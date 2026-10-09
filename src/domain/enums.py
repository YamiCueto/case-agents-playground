from enum import Enum


class TicketStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class UserRole(str, Enum):
    USER = "USER"
    AGENT = "AGENT"
    SUPERVISOR = "SUPERVISOR"
    ADMIN = "ADMIN"


class HistoryAction(str, Enum):
    CREATED = "CREATED"
    ASSIGNED = "ASSIGNED"
    STATUS_CHANGED = "STATUS_CHANGED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED"
    COMMENTED = "COMMENTED"
