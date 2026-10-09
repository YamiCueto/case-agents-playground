from datetime import datetime, timedelta, timezone
from typing import Optional, Set
from src.domain.enums import TicketStatus, Priority, UserRole
from src.domain.entities import User, Ticket
from src.domain.exceptions import (
    InvalidStatusTransitionError,
    UnauthorizedActionError,
    ValidationError,
)

SLA_HOURS_BY_PRIORITY = {
    Priority.CRITICAL: 4,
    Priority.HIGH: 12,
    Priority.MEDIUM: 24,
    Priority.LOW: 48,
}

VALID_STATUS_TRANSITIONS = {
    TicketStatus.OPEN: {TicketStatus.IN_PROGRESS},
    TicketStatus.IN_PROGRESS: {TicketStatus.RESOLVED},
    TicketStatus.RESOLVED: {TicketStatus.CLOSED, TicketStatus.IN_PROGRESS},
    TicketStatus.CLOSED: set(),
}


def calculate_sla_due_date(priority: Priority, start_date: Optional[datetime] = None) -> datetime:
    base_time = start_date or datetime.now(timezone.utc)
    hours = SLA_HOURS_BY_PRIORITY.get(priority, 24)
    return base_time + timedelta(hours=hours)


def is_ticket_overdue(ticket: Ticket, reference_time: Optional[datetime] = None) -> bool:
    if ticket.status in {TicketStatus.RESOLVED, TicketStatus.CLOSED}:
        return False
    current_time = reference_time or datetime.now(timezone.utc)
    target_sla = ticket.sla_due_at
    if target_sla.tzinfo is None and current_time.tzinfo is not None:
        target_sla = target_sla.replace(tzinfo=timezone.utc)
    elif target_sla.tzinfo is not None and current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    return current_time > target_sla


def validate_status_transition(
    ticket: Ticket,
    target_status: TicketStatus,
    operator: User,
    resolution_comment: Optional[str] = None,
) -> None:
    if not operator.is_active:
        raise UnauthorizedActionError(operator.role.value, "OPERATE_ON_INACTIVE_USER")

    if ticket.status == TicketStatus.CLOSED:
        raise InvalidStatusTransitionError(
            ticket.status.value,
            target_status.value,
            "El ticket está cerrado definitivamente.",
        )

    allowed_targets: Set[TicketStatus] = VALID_STATUS_TRANSITIONS.get(ticket.status, set())
    if target_status not in allowed_targets:
        raise InvalidStatusTransitionError(
            ticket.status.value,
            target_status.value,
            f"Transición no permitida desde {ticket.status.value}.",
        )

    if target_status == TicketStatus.IN_PROGRESS:
        if ticket.assignee_id is None:
            raise ValidationError("No se puede iniciar el ticket sin un responsable asignado.")

    if target_status == TicketStatus.RESOLVED:
        if not resolution_comment or not resolution_comment.strip():
            raise ValidationError("Se requiere un comentario explicativo para resolver el ticket.")
        if operator.role == UserRole.USER and ticket.creator_id != operator.id:
            raise UnauthorizedActionError(operator.role.value, "RESOLVE_TICKET")

    if target_status == TicketStatus.CLOSED:
        if ticket.priority == Priority.CRITICAL and operator.role not in {UserRole.SUPERVISOR, UserRole.ADMIN}:
            raise UnauthorizedActionError(
                operator.role.value,
                "El cierre de tickets CRITICAL exige aprobación de SUPERVISOR o ADMIN.",
            )


def validate_user_authorization(user: User, action: str) -> None:
    if not user.is_active:
        raise UnauthorizedActionError(user.role.value, f"{action}_ON_INACTIVE_USER")

    allowed_roles_by_action = {
        "CREATE_TICKET": {UserRole.USER, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN},
        "ASSIGN_TICKET": {UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN},
        "REOPEN_TICKET": {UserRole.USER, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN},
        "CLOSE_CRITICAL_TICKET": {UserRole.SUPERVISOR, UserRole.ADMIN},
        "LIST_TICKETS": {UserRole.USER, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN},
        "VIEW_TICKET": {UserRole.USER, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN},
        "ADD_COMMENT": {UserRole.USER, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN},
    }

    allowed = allowed_roles_by_action.get(action)
    if allowed is not None and user.role not in allowed:
        raise UnauthorizedActionError(user.role.value, action)
