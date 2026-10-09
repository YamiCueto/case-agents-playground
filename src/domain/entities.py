from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from src.domain.enums import TicketStatus, Priority, UserRole, HistoryAction


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    username: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool = True
    created_at: Optional[datetime] = None


class TicketCategory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    code: str
    name: str
    description: str
    is_active: bool = True


class Ticket(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    code: str
    title: str
    description: str
    status: TicketStatus = TicketStatus.OPEN
    priority: Priority = Priority.MEDIUM
    category_id: int
    creator_id: int
    assignee_id: Optional[int] = None
    sla_due_at: datetime
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TicketComment(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    ticket_id: int
    user_id: int
    content: str
    is_internal: bool = False
    created_at: Optional[datetime] = None


class TicketHistory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    ticket_id: int
    user_id: int
    action: HistoryAction
    old_value: Optional[str] = None
    new_value: str
    created_at: Optional[datetime] = None
