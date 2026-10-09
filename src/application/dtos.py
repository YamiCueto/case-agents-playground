from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from src.domain.enums import TicketStatus, Priority


class CreateTicketDTO(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(min_length=5)
    priority: Priority = Priority.MEDIUM
    category_code: str
    creator_username: str


class AssignTicketDTO(BaseModel):
    ticket_code: str
    assignee_username: str
    operator_username: str


class ChangeTicketStatusDTO(BaseModel):
    ticket_code: str
    target_status: TicketStatus
    operator_username: str
    resolution_comment: Optional[str] = None


class AddCommentDTO(BaseModel):
    ticket_code: str
    author_username: str
    content: str = Field(min_length=1)
    is_internal: bool = False


class TicketSummaryDTO(BaseModel):
    code: str
    title: str
    status: str
    priority: str
    category_code: str
    creator_username: str
    assignee_username: Optional[str] = None
    sla_due_at: str
    is_overdue: bool


class CommentDTO(BaseModel):
    id: Optional[int]
    author_username: str
    content: str
    is_internal: bool
    created_at: Optional[str]


class HistoryDTO(BaseModel):
    id: Optional[int]
    operator_username: str
    action: str
    old_value: Optional[str]
    new_value: str
    created_at: Optional[str]


class TicketDetailDTO(BaseModel):
    code: str
    title: str
    description: str
    status: str
    priority: str
    category_code: str
    creator_username: str
    assignee_username: Optional[str] = None
    sla_due_at: str
    resolved_at: Optional[str] = None
    closed_at: Optional[str] = None
    is_overdue: bool
    comments: List[CommentDTO] = Field(default_factory=list)
    history: List[HistoryDTO] = Field(default_factory=list)
