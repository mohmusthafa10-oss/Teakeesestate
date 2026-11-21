"""
Alembic env.py — PostgreSQL-ready migration environment.

DATABASE_URL is read from the application settings (env var).
Never set sqlalchemy.url in alembic.ini — always use the env var.
"""
import logging
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from sqlalchemy.exc import OperationalError

from alembic import context

# Make the app importable from the migrations directory
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from app.database.base import Base
from app.database.session import sanitize_db_url
import app.models.models  # ensure all models are registered with Base.metadata

logger = logging.getLogger("alembic.env")

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Inject database URL from settings — never from alembic.ini
DATABASE_URL = sanitize_db_url(settings.DATABASE_URL)

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. "
        "Export it as an environment variable before running Alembic."
    )


def run_migrations_offline() -> None:
    """
    Run migrations without a live database connection (generates SQL script).
    Useful for reviewing what will be applied to production.
    """
    logger.info("Running migrations in OFFLINE mode against: %s", DATABASE_URL.split("@")[-1])
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=False,  # avoids false positives between sqlite/pg defaults
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations against a live database.
    Uses NullPool so each Alembic run gets its own connection lifecycle.
    """
    logger.info("Running migrations in ONLINE mode against: %s", DATABASE_URL.split("@")[-1])

    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = DATABASE_URL

    try:
        connectable = engine_from_config(
            configuration,
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )

        with connectable.connect() as connection:
            # Verify connection before running migrations
            connection.execute(text("SELECT 1"))

            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=False,
            )

            with context.begin_transaction():
                context.run_migrations()

    except OperationalError as exc:
        logger.critical(
            "Cannot connect to database for migrations.\n"
            "Check DATABASE_URL is correct and the PostgreSQL server is reachable.\n"
            "Error: %s",
            exc,
        )
        raise SystemExit(1) from exc


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
