import pytest
from sqlalchemy.orm import Session
from src.infrastructure.database.connection import get_app_session_factory
from src.application.ticket_service import TicketService
from src.application.dtos import (
    CreateTicketDTO,
    AssignTicketDTO,
    ChangeTicketStatusDTO,
    AddCommentDTO,
)
from src.domain.enums import Priority, TicketStatus
from src.domain.exceptions import UnauthorizedActionError, ValidationError


@pytest.fixture
def service() -> TicketService:
    session_factory = get_app_session_factory()
    session = session_factory()
    srv = TicketService(session)
    yield srv
    session.close()


def test_mysql_list_and_filter_tickets(service: TicketService) -> None:
    all_tickets = service.list_tickets(viewer_username="usr_carlos")
    assert len(all_tickets) >= 5

    open_tickets = service.list_tickets(viewer_username="usr_carlos", status="OPEN")
    assert all(t.status == "OPEN" for t in open_tickets)

    critical_tickets = service.list_tickets(viewer_username="usr_carlos", priority="CRITICAL")
    assert all(t.priority == "CRITICAL" for t in critical_tickets)


def test_mysql_identify_overdue_tickets(service: TicketService) -> None:
    overdue_tickets = service.identify_overdue_tickets(viewer_username="supervisor_juan")
    codes = [t.code for t in overdue_tickets]
    assert "TICK-1003" in codes


def test_mysql_create_and_lifecycle_flow(service: TicketService) -> None:
    create_dto = CreateTicketDTO(
        title="Falla de balanceador en API Gateway",
        description="Peticiones rebotan hacia servidores fuera de línea",
        priority=Priority.CRITICAL,
        category_code="NETWORK",
        creator_username="usr_laura",
    )
    created = service.create_ticket(create_dto)
    ticket_code = created.code

    assert ticket_code.startswith("TICK-")
    assert created.status == TicketStatus.OPEN.value
    assert created.priority == Priority.CRITICAL.value

    assigned = service.assign_ticket(
        AssignTicketDTO(
            ticket_code=ticket_code,
            assignee_username="agente_redes",
            operator_username="supervisor_juan",
        )
    )
    assert assigned.assignee_username == "agente_redes"

    in_progress = service.change_ticket_status(
        ChangeTicketStatusDTO(
            ticket_code=ticket_code,
            target_status=TicketStatus.IN_PROGRESS,
            operator_username="agente_redes",
        )
    )
    assert in_progress.status == TicketStatus.IN_PROGRESS.value

    resolved = service.change_ticket_status(
        ChangeTicketStatusDTO(
            ticket_code=ticket_code,
            target_status=TicketStatus.RESOLVED,
            operator_username="agente_redes",
            resolution_comment="Servidores fuera de línea retirados del pool activo.",
        )
    )
    assert resolved.status == TicketStatus.RESOLVED.value

    with pytest.raises(UnauthorizedActionError, match="SUPERVISOR o ADMIN"):
        service.change_ticket_status(
            ChangeTicketStatusDTO(
                ticket_code=ticket_code,
                target_status=TicketStatus.CLOSED,
                operator_username="agente_redes",
            )
        )

    closed = service.change_ticket_status(
        ChangeTicketStatusDTO(
            ticket_code=ticket_code,
            target_status=TicketStatus.CLOSED,
            operator_username="supervisor_juan",
        )
    )
    assert closed.status == TicketStatus.CLOSED.value

    detail = service.get_ticket(ticket_code, "usr_laura")
    actions = [h.action for h in detail.history]
    assert "CREATED" in actions
    assert "ASSIGNED" in actions
    assert "STATUS_CHANGED" in actions


def test_mysql_add_comment(service: TicketService) -> None:
    import uuid
    unique_content = f"Nota de prueba {uuid.uuid4().hex[:8]}"
    comment = service.add_comment(
        AddCommentDTO(
            ticket_code="TICK-1001",
            author_username="soporte_tecnico",
            content=unique_content,
            is_internal=True,
        )
    )
    assert comment.author_username == "soporte_tecnico"
    assert comment.is_internal is True

    detail = service.get_ticket("TICK-1001", "usr_carlos")
    matching = [c for c in detail.comments if c.content == unique_content]
    assert len(matching) == 1
