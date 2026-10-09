from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from src.domain.entities import Ticket, TicketComment, TicketHistory
from src.domain.enums import TicketStatus, Priority, HistoryAction
from src.infrastructure.database.models import TicketModel, TicketCommentModel, TicketHistoryModel


class TicketRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, ticket_id: int) -> Optional[Ticket]:
        stmt = select(TicketModel).where(TicketModel.id == ticket_id)
        model = self.session.scalar(stmt)
        if model is None:
            return None
        return self._to_ticket_entity(model)

    def get_by_code(self, code: str) -> Optional[Ticket]:
        stmt = select(TicketModel).where(TicketModel.code == code)
        model = self.session.scalar(stmt)
        if model is None:
            return None
        return self._to_ticket_entity(model)

    def count_tickets(self) -> int:
        stmt = select(func.count(TicketModel.id))
        count = self.session.scalar(stmt)
        return count or 0

    def create(self, ticket: Ticket) -> Ticket:
        model = TicketModel(
            code=ticket.code,
            title=ticket.title,
            description=ticket.description,
            status=ticket.status.value,
            priority=ticket.priority.value,
            category_id=ticket.category_id,
            creator_id=ticket.creator_id,
            assignee_id=ticket.assignee_id,
            sla_due_at=ticket.sla_due_at,
            resolved_at=ticket.resolved_at,
            closed_at=ticket.closed_at,
        )
        self.session.add(model)
        self.session.flush()
        return self._to_ticket_entity(model)

    def update(self, ticket: Ticket) -> Ticket:
        stmt = select(TicketModel).where(TicketModel.id == ticket.id)
        model = self.session.scalar(stmt)
        if model is None:
            raise ValueError(f"No se encontró el ticket con id {ticket.id}")

        model.title = ticket.title
        model.description = ticket.description
        model.status = ticket.status.value
        model.priority = ticket.priority.value
        model.category_id = ticket.category_id
        model.assignee_id = ticket.assignee_id
        model.sla_due_at = ticket.sla_due_at
        model.resolved_at = ticket.resolved_at
        model.closed_at = ticket.closed_at
        self.session.flush()
        return self._to_ticket_entity(model)

    def list_tickets(
        self,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        category_id: Optional[int] = None,
        limit: int = 50,
    ) -> List[Ticket]:
        stmt = select(TicketModel)
        if status:
            stmt = stmt.where(TicketModel.status == status)
        if priority:
            stmt = stmt.where(TicketModel.priority == priority)
        if category_id:
            stmt = stmt.where(TicketModel.category_id == category_id)

        stmt = stmt.order_by(TicketModel.created_at.desc()).limit(limit)
        models = self.session.scalars(stmt).all()
        return [self._to_ticket_entity(m) for m in models]

    def add_comment(self, comment: TicketComment) -> TicketComment:
        model = TicketCommentModel(
            ticket_id=comment.ticket_id,
            user_id=comment.user_id,
            content=comment.content,
            is_internal=comment.is_internal,
        )
        self.session.add(model)
        self.session.flush()
        return TicketComment(
            id=model.id,
            ticket_id=model.ticket_id,
            user_id=model.user_id,
            content=model.content,
            is_internal=model.is_internal,
            created_at=model.created_at,
        )

    def list_comments(self, ticket_id: int) -> List[TicketComment]:
        stmt = select(TicketCommentModel).where(TicketCommentModel.ticket_id == ticket_id).order_by(TicketCommentModel.created_at.asc())
        models = self.session.scalars(stmt).all()
        return [
            TicketComment(
                id=m.id,
                ticket_id=m.ticket_id,
                user_id=m.user_id,
                content=m.content,
                is_internal=m.is_internal,
                created_at=m.created_at,
            )
            for m in models
        ]

    def add_history(self, history: TicketHistory) -> TicketHistory:
        model = TicketHistoryModel(
            ticket_id=history.ticket_id,
            user_id=history.user_id,
            action=history.action.value,
            old_value=history.old_value,
            new_value=history.new_value,
        )
        self.session.add(model)
        self.session.flush()
        return TicketHistory(
            id=model.id,
            ticket_id=model.ticket_id,
            user_id=model.user_id,
            action=HistoryAction(model.action),
            old_value=model.old_value,
            new_value=model.new_value,
            created_at=model.created_at,
        )

    def list_history(self, ticket_id: int) -> List[TicketHistory]:
        stmt = select(TicketHistoryModel).where(TicketHistoryModel.ticket_id == ticket_id).order_by(TicketHistoryModel.created_at.asc())
        models = self.session.scalars(stmt).all()
        return [
            TicketHistory(
                id=m.id,
                ticket_id=m.ticket_id,
                user_id=m.user_id,
                action=HistoryAction(m.action),
                old_value=m.old_value,
                new_value=m.new_value,
                created_at=m.created_at,
            )
            for m in models
        ]

    def _to_ticket_entity(self, model: TicketModel) -> Ticket:
        return Ticket(
            id=model.id,
            code=model.code,
            title=model.title,
            description=model.description,
            status=TicketStatus(model.status),
            priority=Priority(model.priority),
            category_id=model.category_id,
            creator_id=model.creator_id,
            assignee_id=model.assignee_id,
            sla_due_at=model.sla_due_at,
            resolved_at=model.resolved_at,
            closed_at=model.closed_at,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
