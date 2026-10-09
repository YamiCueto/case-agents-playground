from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from src.domain.enums import TicketStatus, Priority, UserRole, HistoryAction
from src.domain.entities import Ticket, TicketComment, TicketHistory
from src.domain.rules import (
    calculate_sla_due_date,
    is_ticket_overdue,
    validate_status_transition,
    validate_user_authorization,
)
from src.domain.exceptions import EntityNotFoundError, UnauthorizedActionError, ValidationError
from src.infrastructure.repositories.user_repository import UserRepository
from src.infrastructure.repositories.ticket_repository import TicketRepository
from src.application.dtos import (
    CreateTicketDTO,
    AssignTicketDTO,
    ChangeTicketStatusDTO,
    AddCommentDTO,
    TicketSummaryDTO,
    TicketDetailDTO,
    CommentDTO,
    HistoryDTO,
)


class TicketService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.ticket_repo = TicketRepository(session)

    def create_ticket(self, dto: CreateTicketDTO) -> TicketDetailDTO:
        creator = self.user_repo.get_by_username(dto.creator_username)
        if creator is None:
            raise EntityNotFoundError("Usuario creador", dto.creator_username)

        validate_user_authorization(creator, "CREATE_TICKET")

        category = self.user_repo.get_category_by_code(dto.category_code)
        if category is None:
            raise EntityNotFoundError("Categoría de ticket", dto.category_code)

        ticket_count = self.ticket_repo.count_tickets()
        generated_code = f"TICK-{1001 + ticket_count}"

        sla_due = calculate_sla_due_date(dto.priority)

        ticket = Ticket(
            code=generated_code,
            title=dto.title,
            description=dto.description,
            status=TicketStatus.OPEN,
            priority=dto.priority,
            category_id=category.id,
            creator_id=creator.id,
            assignee_id=None,
            sla_due_at=sla_due,
        )

        created_ticket = self.ticket_repo.create(ticket)

        history = TicketHistory(
            ticket_id=created_ticket.id,
            user_id=creator.id,
            action=HistoryAction.CREATED,
            old_value=None,
            new_value=f"Ticket creado con prioridad {dto.priority.value} y categoría {category.code}",
        )
        self.ticket_repo.add_history(history)
        self.session.commit()

        return self.get_ticket(created_ticket.code, creator.username)

    def get_ticket(self, ticket_code: str, viewer_username: str) -> TicketDetailDTO:
        viewer = self.user_repo.get_by_username(viewer_username)
        if viewer is None:
            raise EntityNotFoundError("Usuario consultante", viewer_username)

        validate_user_authorization(viewer, "VIEW_TICKET")

        ticket = self.ticket_repo.get_by_code(ticket_code)
        if ticket is None:
            raise EntityNotFoundError("Ticket", ticket_code)

        category = self.user_repo.get_category_by_id(ticket.category_id)
        creator = self.user_repo.get_by_id(ticket.creator_id)
        assignee = self.user_repo.get_by_id(ticket.assignee_id) if ticket.assignee_id else None

        comments = self.ticket_repo.list_comments(ticket.id)
        history_records = self.ticket_repo.list_history(ticket.id)

        comment_dtos: List[CommentDTO] = []
        for c in comments:
            author = self.user_repo.get_by_id(c.user_id)
            comment_dtos.append(
                CommentDTO(
                    id=c.id,
                    author_username=author.username if author else "desconocido",
                    content=c.content,
                    is_internal=c.is_internal,
                    created_at=c.created_at.isoformat() if c.created_at else None,
                )
            )

        history_dtos: List[HistoryDTO] = []
        for h in history_records:
            operator = self.user_repo.get_by_id(h.user_id)
            history_dtos.append(
                HistoryDTO(
                    id=h.id,
                    operator_username=operator.username if operator else "sistema",
                    action=h.action.value,
                    old_value=h.old_value,
                    new_value=h.new_value,
                    created_at=h.created_at.isoformat() if h.created_at else None,
                )
            )

        return TicketDetailDTO(
            code=ticket.code,
            title=ticket.title,
            description=ticket.description,
            status=ticket.status.value,
            priority=ticket.priority.value,
            category_code=category.code if category else "GENERAL",
            creator_username=creator.username if creator else "desconocido",
            assignee_username=assignee.username if assignee else None,
            sla_due_at=ticket.sla_due_at.isoformat(),
            resolved_at=ticket.resolved_at.isoformat() if ticket.resolved_at else None,
            closed_at=ticket.closed_at.isoformat() if ticket.closed_at else None,
            is_overdue=is_ticket_overdue(ticket),
            comments=comment_dtos,
            history=history_dtos,
        )

    def list_tickets(
        self,
        viewer_username: str,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        category_code: Optional[str] = None,
        limit: int = 20,
    ) -> List[TicketSummaryDTO]:
        viewer = self.user_repo.get_by_username(viewer_username)
        if viewer is None:
            raise EntityNotFoundError("Usuario consultante", viewer_username)

        validate_user_authorization(viewer, "LIST_TICKETS")

        category_id: Optional[int] = None
        if category_code:
            category = self.user_repo.get_category_by_code(category_code)
            if category:
                category_id = category.id

        tickets = self.ticket_repo.list_tickets(
            status=status,
            priority=priority,
            category_id=category_id,
            limit=limit,
        )

        summaries: List[TicketSummaryDTO] = []
        for t in tickets:
            cat = self.user_repo.get_category_by_id(t.category_id)
            creator = self.user_repo.get_by_id(t.creator_id)
            assignee = self.user_repo.get_by_id(t.assignee_id) if t.assignee_id else None
            summaries.append(
                TicketSummaryDTO(
                    code=t.code,
                    title=t.title,
                    status=t.status.value,
                    priority=t.priority.value,
                    category_code=cat.code if cat else "GENERAL",
                    creator_username=creator.username if creator else "desconocido",
                    assignee_username=assignee.username if assignee else None,
                    sla_due_at=t.sla_due_at.isoformat(),
                    is_overdue=is_ticket_overdue(t),
                )
            )
        return summaries

    def assign_ticket(self, dto: AssignTicketDTO) -> TicketDetailDTO:
        operator = self.user_repo.get_by_username(dto.operator_username)
        if operator is None:
            raise EntityNotFoundError("Operador", dto.operator_username)

        validate_user_authorization(operator, "ASSIGN_TICKET")

        assignee = self.user_repo.get_by_username(dto.assignee_username)
        if assignee is None:
            raise EntityNotFoundError("Asignado propuesto", dto.assignee_username)

        if not assignee.is_active or assignee.role not in {UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN}:
            raise ValidationError(f"El usuario {assignee.username} no puede ser asignado a tickets.")

        ticket = self.ticket_repo.get_by_code(dto.ticket_code)
        if ticket is None:
            raise EntityNotFoundError("Ticket", dto.ticket_code)

        if ticket.status == TicketStatus.CLOSED:
            raise ValidationError("No se puede asignar un ticket cerrado.")

        old_assignee = self.user_repo.get_by_id(ticket.assignee_id) if ticket.assignee_id else None
        old_value = old_assignee.username if old_assignee else "Sin asignar"

        ticket.assignee_id = assignee.id
        self.ticket_repo.update(ticket)

        history = TicketHistory(
            ticket_id=ticket.id,
            user_id=operator.id,
            action=HistoryAction.ASSIGNED,
            old_value=old_value,
            new_value=assignee.username,
        )
        self.ticket_repo.add_history(history)
        self.session.commit()

        return self.get_ticket(ticket.code, operator.username)

    def change_ticket_status(self, dto: ChangeTicketStatusDTO) -> TicketDetailDTO:
        operator = self.user_repo.get_by_username(dto.operator_username)
        if operator is None:
            raise EntityNotFoundError("Operador", dto.operator_username)

        ticket = self.ticket_repo.get_by_code(dto.ticket_code)
        if ticket is None:
            raise EntityNotFoundError("Ticket", dto.ticket_code)

        validate_status_transition(
            ticket=ticket,
            target_status=dto.target_status,
            operator=operator,
            resolution_comment=dto.resolution_comment,
        )

        old_status = ticket.status.value
        ticket.status = dto.target_status
        now = datetime.now(timezone.utc)

        if dto.target_status == TicketStatus.RESOLVED:
            ticket.resolved_at = now
            if dto.resolution_comment:
                comment = TicketComment(
                    ticket_id=ticket.id,
                    user_id=operator.id,
                    content=f"[RESOLUCIÓN]: {dto.resolution_comment}",
                    is_internal=False,
                )
                self.ticket_repo.add_comment(comment)

        elif dto.target_status == TicketStatus.CLOSED:
            ticket.closed_at = now

        elif dto.target_status == TicketStatus.IN_PROGRESS and old_status == TicketStatus.RESOLVED.value:
            ticket.resolved_at = None

        self.ticket_repo.update(ticket)

        history = TicketHistory(
            ticket_id=ticket.id,
            user_id=operator.id,
            action=HistoryAction.STATUS_CHANGED,
            old_value=old_status,
            new_value=dto.target_status.value,
        )
        self.ticket_repo.add_history(history)
        self.session.commit()

        return self.get_ticket(ticket.code, operator.username)

    def add_comment(self, dto: AddCommentDTO) -> CommentDTO:
        author = self.user_repo.get_by_username(dto.author_username)
        if author is None:
            raise EntityNotFoundError("Autor del comentario", dto.author_username)

        validate_user_authorization(author, "ADD_COMMENT")

        ticket = self.ticket_repo.get_by_code(dto.ticket_code)
        if ticket is None:
            raise EntityNotFoundError("Ticket", dto.ticket_code)

        comment = TicketComment(
            ticket_id=ticket.id,
            user_id=author.id,
            content=dto.content,
            is_internal=dto.is_internal,
        )
        created_comment = self.ticket_repo.add_comment(comment)

        history = TicketHistory(
            ticket_id=ticket.id,
            user_id=author.id,
            action=HistoryAction.COMMENTED,
            old_value=None,
            new_value=f"Nuevo comentario registrado por {author.username}",
        )
        self.ticket_repo.add_history(history)
        self.session.commit()

        return CommentDTO(
            id=created_comment.id,
            author_username=author.username,
            content=created_comment.content,
            is_internal=created_comment.is_internal,
            created_at=created_comment.created_at.isoformat() if created_comment.created_at else None,
        )

    def identify_overdue_tickets(self, viewer_username: str) -> List[TicketSummaryDTO]:
        all_tickets = self.list_tickets(viewer_username=viewer_username, limit=100)
        return [t for t in all_tickets if t.is_overdue]

    def get_ticket_history(self, ticket_code: str, viewer_username: str) -> List[HistoryDTO]:
        detail = self.get_ticket(ticket_code, viewer_username)
        return detail.history
