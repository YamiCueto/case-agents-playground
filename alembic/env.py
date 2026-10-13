import sys
import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

sys.path.insert(0, os.path.abspath("."))

from src.infrastructure.config import get_settings
from src.infrastructure.database.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.admin_database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def ensure_database_exists() -> None:
    """Garantiza que la base de datos objetivo exista antes de ejecutar migraciones."""
    from sqlalchemy import create_engine, text
    try:
        server_engine = create_engine(settings.server_admin_url, poolclass=pool.NullPool)
        with server_engine.connect() as s_conn:
            s_conn.execute(
                text(f"CREATE DATABASE IF NOT EXISTS `{settings.db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            )
            s_conn.commit()
    except Exception:
        # Continuar si no se tienen permisos a nivel de servidor o si la BD ya existe
        pass


def run_migrations_online() -> None:
    ensure_database_exists()
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
