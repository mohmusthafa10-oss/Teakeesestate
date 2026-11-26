"""
SQLAlchemy session and engine factory.

Reads DATABASE_URL from environment (via pydantic-settings).

- If DATABASE_URL starts with 'sqlite': uses check_same_thread=False, no pool settings.
- Otherwise (PostgreSQL/psycopg2): configures production-grade connection pool with
  pre-ping health checks and graceful error handling.

Never hardcode credentials here — set DATABASE_URL in Render environment variables.
"""
import logging
import sys
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings

logger = logging.getLogger(__name__)

def sanitize_db_url(url: str) -> str:
    """Normalize and fix common database URL issues (e.g. Render's postgres:// or empty port :/ )."""
    if not url:
        return url
    url = url.strip().strip("'\"")
    # Fix postgres:// -> postgresql+psycopg2://
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]

    # Fix empty port like @host:/dbname -> @host:5432/dbname
    if "@" in url:
        prefix, rest = url.split("@", 1)
        if ":/" in rest:
            rest = rest.replace(":/", ":5432/", 1)
        url = prefix + "@" + rest
    return url

database_url = sanitize_db_url(settings.DATABASE_URL)


def _make_engine():
    """Create the SQLAlchemy engine based on the DATABASE_URL scheme."""
    if database_url.startswith("sqlite"):
        if settings.is_production:
            raise RuntimeError(
                "FATAL CONFIGURATION ERROR: Attempting to run in production mode with a SQLite database. "
                "PostgreSQL is required in production. Set DATABASE_URL to a valid PostgreSQL connection URI in /etc/teakees/backend.env."
            )
        logger.info("Using SQLite database (development mode)")
        eng = create_engine(
            database_url,
            connect_args={"check_same_thread": False, "timeout": 30},
            echo=False,
        )
        @event.listens_for(eng, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
            except Exception:
                pass
            finally:
                cursor.close()
        return eng

    # PostgreSQL / psycopg2 — production settings
    pool_size = int(getattr(settings, "DB_POOL_SIZE", 10))
    max_overflow = int(getattr(settings, "DB_MAX_OVERFLOW", 20))
    pool_timeout = int(getattr(settings, "DB_POOL_TIMEOUT", 30))

    logger.info(
        "Using PostgreSQL database | pool_size=%d max_overflow=%d pool_timeout=%d",
        pool_size,
        max_overflow,
        pool_timeout,
    )

    return create_engine(
        database_url,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_pre_ping=True,          # validates connection before each checkout
        pool_recycle=1800,           # recycle stale connections after 30 min
        echo=False,
    )


engine = _make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def validate_database_connection() -> bool:
    """
    Test that the database is reachable.
    Returns True on success, raises RuntimeError on failure.
    Called at application startup.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection validated successfully.")
        return True
    except OperationalError as exc:
        logger.critical(
            "FATAL: Cannot connect to the database.\n"
            "Ensure DATABASE_URL is set correctly in your environment.\n"
            "Error: %s",
            exc,
        )
        raise RuntimeError(
            "Database connection failed. Check DATABASE_URL environment variable."
        ) from exc
    except SQLAlchemyError as exc:
        logger.critical("Unexpected database error during startup: %s", exc)
        raise RuntimeError("Unexpected database error during startup.") from exc


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a database session and ensures it is closed."""
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as exc:
        logger.error("Database error during request: %s", exc)
        db.rollback()
        raise
    finally:
        db.close()
