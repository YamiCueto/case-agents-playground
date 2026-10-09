from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from src.infrastructure.database.models import (
    Base,
    UserModel,
    TicketCategoryModel,
    TicketModel,
)
from src.domain.enums import UserRole, Priority, TicketStatus
from src.application.ticket_service import TicketService
from src.application.dtos import (
    CreateTicketDTO,
    AssignTicketDTO,
    ChangeTicketStatusDTO,
    AddCommentDTO,
)
from src.domain.exceptions import EntityNotFoundError, UnauthorizedActionError, ValidationError


@pytest.fixture
def memory_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()

    admin = UserModel(
        username="admin_test",
        email="admin@test.com",
        full_name="Admin Test",
        role=UserRole.ADMIN.value,
        is_active=True,
    )
    supervisor = UserModel(
        username="sup_test",
        email="sup@test.com",
        full_name="Supervisor Test",
        role=UserRole.SUPERVISOR.value,
        is_active=True,
    )
    agent = UserModel(
        username="agent_test",
        email="agent@test.com",
        full_name="Agent Test",
        role=UserRole.AGENT.value,
        is_active=True,
    )
    user = UserModel(
        username="user_test",
        email="user@test.com",
        full_name="User Test",
        role=UserRole.USER.value,
        is_active=True,
    )
    category = TicketCategoryModel(
        code="SOFTWARE",
        name="Software",
        description="Fallas en aplicaciones",
        is_active=True,
    )

    session.add_all([admin, supervisor, agent, user, category])
    session.commit()

    yield session
    session.close()


def test_service_create_and_get_ticket(memory_session: Session) -> None:
    service = TicketService(memory_session)

    dto = CreateTicketDTO(
        title="Error en login",
        description="Fallo de autenticación en módulo de créditos",
        priority=Priority.HIGH,
        category_code="SOFTWARE",
        creator_username="user_test",
    )

    created = service.create_ticket(dto)

    assert created.code == "TICK-1001"
    assert created.status == TicketStatus.OPEN.value
    assert created.priority == Priority.HIGH.value
    assert created.category_code == "SOFTWARE"
    assert created.creator_username == "user_test"
    assert created.assignee_username is None
    assert len(created.history) == 1
    assert created.history[0].action == "CREATED"


def test_service_assign_and_status_flow(memory_session: Session) -> None:
    service = TicketService(memory_session)

    created = service.create_ticket(
        CreateTicketDTO(
            title="Caída de servicio",
            description="El microservicio de pagos no responde",
            priority=Priority.CRITICAL,
            category_code="SOFTWARE",
            creator_username="user_test",
        )
    )

    assigned = service.assign_ticket(
        AssignTicketDTO(
            ticket_code=created.code,
            assignee_username="agent_test",
            operator_username="sup_test",
        )
    )
    assert assigned.assignee_username == "agent_test"

    in_progress = service.change_ticket_status(
        ChangeTicketStatusDTO(
            ticket_code=created.code,
            target_status=TicketStatus.IN_PROGRESS,
            operator_username="agent_test",
        )
    )
    assert in_progress.status == TicketStatus.IN_PROGRESS.value

    resolved = service.change_ticket_status(
        ChangeTicketStatusDTO(
            ticket_code=created.code,
            target_status=TicketStatus.RESOLVED,
            operator_username="agent_test",
            resolution_comment="Servicio reiniciado y dependencias estabilizadas",
        )
    )
    assert resolved.status == TicketStatus.RESOLVED.value
    assert resolved.resolved_at is not None

    with pytest.raises(UnauthorizedActionError):
        service.change_ticket_status(
            ChangeTicketStatusDTO(
                ticket_code=created.code,
                target_status=TicketStatus.CLOSED,
                operator_username="agent_test",
            )
        )

    closed = service.change_ticket_status(
        ChangeTicketStatusDTO(
            ticket_code=created.code,
            target_status=TicketStatus.CLOSED,
            operator_username="sup_test",
        )
    )
    assert closed.status == TicketStatus.CLOSED.value
    assert closed.closed_at is not None


def test_service_add_comment(memory_session: Session) -> None:
    service = TicketService(memory_session)

    created = service.create_ticket(
        CreateTicketDTO(
            title="Consulta sobre extracto",
            description="El usuario solicita explicación de movimientos",
            priority=Priority.LOW,
            category_code="SOFTWARE",
            creator_username="user_test",
        )
    )

    comment = service.add_comment(
        AddCommentDTO(
            ticket_code=created.code,
            author_username="agent_test",
            content="Extracto adjuntado para revisión.",
            is_internal=True,
        )
    )
    assert comment.author_username == "agent_test"
    assert comment.is_internal is True

    detail = service.get_ticket(created.code, "user_test")
    assert len(detail.comments) == 1
    assert detail.comments[0].content == "Extracto adjuntado para revisión."


def test_service_identify_overdue_tickets(memory_session: Session) -> None:
    service = TicketService(memory_session)
    now = datetime.now(timezone.utc)

    past_ticket = TicketModel(
        code="TICK-1002",
        title="Ticket con SLA vencido",
        description="Ticket antiguo",
        status=TicketStatus.OPEN.value,
        priority=Priority.HIGH.value,
        category_id=1,
        creator_id=4,
        assignee_id=None,
        sla_due_at=now - timedelta(hours=5),
    )
    memory_session.add(past_ticket)
    memory_session.commit()

    overdue_list = service.identify_overdue_tickets("admin_test")
    assert any(t.code == "TICK-1002" for t in overdue_list)
