import pytest
from sqlalchemy.orm import Session
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.repositories.user_repository import UserRepository
from src.infrastructure.repositories.ticket_repository import TicketRepository
from src.domain.enums import UserRole, TicketStatus


@pytest.fixture
def db_session() -> Session:
    session_factory = get_app_session_factory()
    session = session_factory()
    yield session
    session.close()


def test_user_repository_reads_seeded_users(db_session: Session) -> None:
    repo = UserRepository(db_session)

    carlos = repo.get_by_username("usr_carlos")
    assert carlos is not None
    assert carlos.role == UserRole.USER
    assert carlos.is_active is True

    supervisor = repo.get_by_username("supervisor_juan")
    assert supervisor is not None
    assert supervisor.role == UserRole.SUPERVISOR

    active_users = repo.list_active()
    assert len(active_users) >= 6


def test_category_repository_reads_seeded_categories(db_session: Session) -> None:
    repo = UserRepository(db_session)

    db_cat = repo.get_category_by_code("DATABASE")
    assert db_cat is not None
    assert db_cat.name == "Base de Datos"

    categories = repo.list_categories()
    assert len(categories) >= 5


def test_ticket_repository_reads_seeded_tickets(db_session: Session) -> None:
    repo = TicketRepository(db_session)

    ticket_1 = repo.get_by_code("TICK-1001")
    assert ticket_1 is not None
    assert ticket_1.status == TicketStatus.OPEN
    assert ticket_1.priority.value == "HIGH"

    ticket_2 = repo.get_by_code("TICK-1002")
    assert ticket_2 is not None
    assert ticket_2.status == TicketStatus.IN_PROGRESS

    comments = repo.list_comments(ticket_2.id)
    assert len(comments) >= 1

    history = repo.list_history(ticket_2.id)
    assert len(history) >= 3
