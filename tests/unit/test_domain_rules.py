from datetime import datetime, timedelta, timezone
import pytest
from src.domain.enums import TicketStatus, Priority, UserRole
from src.domain.entities import User, Ticket
from src.domain.rules import (
    calculate_sla_due_date,
    is_ticket_overdue,
    validate_status_transition,
    validate_user_authorization,
)
from src.domain.exceptions import (
    InvalidStatusTransitionError,
    UnauthorizedActionError,
    ValidationError,
)


def create_sample_user(role: UserRole = UserRole.USER, is_active: bool = True, user_id: int = 1) -> User:
    return User(
        id=user_id,
        username=f"user_{user_id}",
        email=f"user_{user_id}@test.com",
        full_name=f"Test User {user_id}",
        role=role,
        is_active=is_active,
    )


def create_sample_ticket(
    status: TicketStatus = TicketStatus.OPEN,
    priority: Priority = Priority.MEDIUM,
    assignee_id: int | None = None,
    sla_due_at: datetime | None = None,
) -> Ticket:
    now = datetime.now(timezone.utc)
    return Ticket(
        id=10,
        code="TICK-1010",
        title="Problema de prueba",
        description="Descripción de prueba",
        status=status,
        priority=priority,
        category_id=1,
        creator_id=1,
        assignee_id=assignee_id,
        sla_due_at=sla_due_at or (now + timedelta(hours=24)),
    )


def test_sla_calculation_by_priority() -> None:
    base_time = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)

    critical_due = calculate_sla_due_date(Priority.CRITICAL, start_date=base_time)
    assert critical_due == base_time + timedelta(hours=4)

    high_due = calculate_sla_due_date(Priority.HIGH, start_date=base_time)
    assert high_due == base_time + timedelta(hours=12)

    medium_due = calculate_sla_due_date(Priority.MEDIUM, start_date=base_time)
    assert medium_due == base_time + timedelta(hours=24)

    low_due = calculate_sla_due_date(Priority.LOW, start_date=base_time)
    assert low_due == base_time + timedelta(hours=48)


def test_is_ticket_overdue() -> None:
    now = datetime.now(timezone.utc)

    ticket_not_overdue = create_sample_ticket(sla_due_at=now + timedelta(hours=2))
    assert not is_ticket_overdue(ticket_not_overdue, reference_time=now)

    ticket_overdue = create_sample_ticket(sla_due_at=now - timedelta(hours=1))
    assert is_ticket_overdue(ticket_overdue, reference_time=now)

    resolved_ticket = create_sample_ticket(
        status=TicketStatus.RESOLVED,
        sla_due_at=now - timedelta(hours=5),
    )
    assert not is_ticket_overdue(resolved_ticket, reference_time=now)

    closed_ticket = create_sample_ticket(
        status=TicketStatus.CLOSED,
        sla_due_at=now - timedelta(hours=5),
    )
    assert not is_ticket_overdue(closed_ticket, reference_time=now)


def test_status_transition_open_to_in_progress_requires_assignee() -> None:
    operator = create_sample_user(role=UserRole.AGENT)
    ticket_without_assignee = create_sample_ticket(status=TicketStatus.OPEN, assignee_id=None)

    with pytest.raises(ValidationError, match="sin un responsable asignado"):
        validate_status_transition(
            ticket=ticket_without_assignee,
            target_status=TicketStatus.IN_PROGRESS,
            operator=operator,
        )

    ticket_with_assignee = create_sample_ticket(status=TicketStatus.OPEN, assignee_id=2)
    validate_status_transition(
        ticket=ticket_with_assignee,
        target_status=TicketStatus.IN_PROGRESS,
        operator=operator,
    )


def test_status_transition_in_progress_to_resolved_requires_comment() -> None:
    operator = create_sample_user(role=UserRole.AGENT)
    ticket = create_sample_ticket(status=TicketStatus.IN_PROGRESS, assignee_id=operator.id)

    with pytest.raises(ValidationError, match="Se requiere un comentario explicativo"):
        validate_status_transition(
            ticket=ticket,
            target_status=TicketStatus.RESOLVED,
            operator=operator,
            resolution_comment="",
        )

    validate_status_transition(
        ticket=ticket,
        target_status=TicketStatus.RESOLVED,
        operator=operator,
        resolution_comment="Falla resuelta satisfactoriamente",
    )


def test_closing_critical_ticket_requires_supervisor_or_admin() -> None:
    agent_operator = create_sample_user(role=UserRole.AGENT)
    supervisor_operator = create_sample_user(role=UserRole.SUPERVISOR)
    admin_operator = create_sample_user(role=UserRole.ADMIN)

    critical_ticket = create_sample_ticket(
        status=TicketStatus.RESOLVED,
        priority=Priority.CRITICAL,
        assignee_id=agent_operator.id,
    )

    with pytest.raises(UnauthorizedActionError, match="SUPERVISOR o ADMIN"):
        validate_status_transition(
            ticket=critical_ticket,
            target_status=TicketStatus.CLOSED,
            operator=agent_operator,
        )

    validate_status_transition(
        ticket=critical_ticket,
        target_status=TicketStatus.CLOSED,
        operator=supervisor_operator,
    )

    validate_status_transition(
        ticket=critical_ticket,
        target_status=TicketStatus.CLOSED,
        operator=admin_operator,
    )


def test_closed_ticket_is_terminal() -> None:
    admin_operator = create_sample_user(role=UserRole.ADMIN)
    closed_ticket = create_sample_ticket(status=TicketStatus.CLOSED)

    with pytest.raises(InvalidStatusTransitionError, match="cerrado definitivamente"):
        validate_status_transition(
            ticket=closed_ticket,
            target_status=TicketStatus.IN_PROGRESS,
            operator=admin_operator,
        )


def test_user_authorization_matrix() -> None:
    user = create_sample_user(role=UserRole.USER)
    agent = create_sample_user(role=UserRole.AGENT)
    inactive_agent = create_sample_user(role=UserRole.AGENT, is_active=False)

    validate_user_authorization(user, "CREATE_TICKET")
    validate_user_authorization(user, "VIEW_TICKET")

    with pytest.raises(UnauthorizedActionError):
        validate_user_authorization(user, "ASSIGN_TICKET")

    validate_user_authorization(agent, "ASSIGN_TICKET")

    with pytest.raises(UnauthorizedActionError):
        validate_user_authorization(agent, "CLOSE_CRITICAL_TICKET")

    with pytest.raises(UnauthorizedActionError, match="INACTIVE"):
        validate_user_authorization(inactive_agent, "ASSIGN_TICKET")
