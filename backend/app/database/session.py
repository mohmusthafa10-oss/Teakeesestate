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

from sqlalchemy.engine.url import make_url

logger = logging.getLogger(__name__)

def sanitize_db_url(url: str) -> str:
    """Normalize and fix common database URL issues (e.g. Render's postgres://, empty port :/, or missing SSL)."""
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
        prefix, rest = url.rsplit("@", 1)
        if ":/" in rest:
            rest = rest.replace(":/", ":5432/", 1)
        url = prefix + "@" + rest

    # Enforce sslmode=require for Render-hosted PostgreSQL connections if not explicitly set
    if "postgresql" in url and "render.com" in url:
        if "sslmode=" not in url:
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}sslmode=require"

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


def get_db_diagnostic_info(target_url: str = None) -> dict:
    """
    Returns sanitized connection metadata without exposing passwords or private credentials.
    Safe for diagnostic endpoints, health checks, and logs.
    """
    url_to_parse = target_url or database_url
    try:
        parsed = make_url(url_to_parse)
        raw_host = parsed.host or ("file" if parsed.get_backend_name() == "sqlite" else "unknown")
        if len(raw_host) > 14 and "." in raw_host:
            # Mask host: e.g. dpg-c1234567.oregon-postgres.render.com -> dpg-c***render.com
            prefix = raw_host[:5]
            domain = raw_host.split(".", 1)[-1]
            masked_host = f"{prefix}***.{domain}"
        elif raw_host not in ("localhost", "127.0.0.1", "file"):
            masked_host = f"{raw_host[:2]}***"
        else:
            masked_host = raw_host

        raw_user = parsed.username or "none"
        if len(raw_user) > 3:
            masked_user = f"{raw_user[:2]}***"
        elif raw_user != "none":
            masked_user = "***"
        else:
            masked_user = "none"

        query_params = dict(parsed.query) if parsed.query else {}

        return {
            "dialect": parsed.get_backend_name(),
            "driver": parsed.get_driver_name(),
            "masked_host": masked_host,
            "port": parsed.port or (5432 if "postgres" in parsed.get_backend_name() else None),
            "database": parsed.database or "default",
            "masked_username": masked_user,
            "sslmode": query_params.get("sslmode", "not specified"),
            "is_sqlite": parsed.get_backend_name() == "sqlite",
            "is_postgres": "postgres" in parsed.get_backend_name(),
        }
    except Exception as exc:
        return {
            "error": f"Failed to parse database URL: {exc}",
            "is_sqlite": str(url_to_parse).startswith("sqlite"),
            "is_postgres": "postgres" in str(url_to_parse),
        }


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
