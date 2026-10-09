from typing import Generator
from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session
from src.infrastructure.config import get_settings


def create_db_engine(database_url: str, echo: bool = False) -> Engine:
    return create_engine(
        database_url,
        echo=echo,
        pool_pre_ping=True,
        pool_recycle=3600,
    )


def get_admin_engine() -> Engine:
    settings = get_settings()
    return create_db_engine(settings.admin_database_url)


def get_app_engine() -> Engine:
    settings = get_settings()
    return create_db_engine(settings.app_database_url)


def get_admin_session_factory() -> sessionmaker[Session]:
    engine = get_admin_engine()
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_app_session_factory() -> sessionmaker[Session]:
    engine = get_app_engine()
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_app_session() -> Generator[Session, None, None]:
    factory = get_app_session_factory()
    session = factory()
    try:
        yield session
    finally:
        session.close()
