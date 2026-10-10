import pytest
from sqlalchemy.orm import Session
from src.infrastructure.database.connection import get_app_session_factory


@pytest.fixture
def db_session() -> Session:
    factory = get_app_session_factory()
    session = factory()
    yield session
    session.close()
