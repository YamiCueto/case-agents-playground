from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="USER")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    created_tickets: Mapped[List["TicketModel"]] = relationship(
        "TicketModel",
        back_populates="creator",
        foreign_keys="TicketModel.creator_id",
    )
    assigned_tickets: Mapped[List["TicketModel"]] = relationship(
        "TicketModel",
        back_populates="assignee",
        foreign_keys="TicketModel.assignee_id",
    )
    comments: Mapped[List["TicketCommentModel"]] = relationship(
        "TicketCommentModel",
        back_populates="user",
    )
    history_entries: Mapped[List["TicketHistoryModel"]] = relationship(
        "TicketHistoryModel",
        back_populates="user",
    )


class TicketCategoryModel(Base):
    __tablename__ = "ticket_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tickets: Mapped[List["TicketModel"]] = relationship(
        "TicketModel",
        back_populates="category",
    )


class TicketModel(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN", index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM", index=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("ticket_categories.id"), nullable=False)
    creator_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    assignee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    sla_due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    category: Mapped["TicketCategoryModel"] = relationship(
        "TicketCategoryModel",
        back_populates="tickets",
    )
    creator: Mapped["UserModel"] = relationship(
        "UserModel",
        foreign_keys=[creator_id],
        back_populates="created_tickets",
    )
    assignee: Mapped[Optional["UserModel"]] = relationship(
        "UserModel",
        foreign_keys=[assignee_id],
        back_populates="assigned_tickets",
    )
    comments: Mapped[List["TicketCommentModel"]] = relationship(
        "TicketCommentModel",
        back_populates="ticket",
        cascade="all, delete-orphan",
    )
    history_entries: Mapped[List["TicketHistoryModel"]] = relationship(
        "TicketHistoryModel",
        back_populates="ticket",
        cascade="all, delete-orphan",
    )


class TicketCommentModel(Base):
    __tablename__ = "ticket_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    ticket: Mapped["TicketModel"] = relationship("TicketModel", back_populates="comments")
    user: Mapped["UserModel"] = relationship("UserModel", back_populates="comments")


class TicketHistoryModel(Base):
    __tablename__ = "ticket_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    new_value: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    ticket: Mapped["TicketModel"] = relationship("TicketModel", back_populates="history_entries")
    user: Mapped["UserModel"] = relationship("UserModel", back_populates="history_entries")
