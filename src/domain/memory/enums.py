from enum import Enum


class MemoryScope(str, Enum):
    SESSION = "session"
    PERSISTENT = "persistent"


class DecisionStatus(str, Enum):
    PENDING = "pending"
    RESOLVING = "resolving"
    RESOLVED = "resolved"
    REVOKED = "revoked"
    CANCELLED = "cancelled"
    FAILED = "failed"
    RECOVERY_REQUIRED = "recovery_required"


class ProvenanceType(str, Enum):
    USER_EXPLICIT = "user_explicit"
    TOOL_OBSERVATION = "tool_observation"
    AGENT_PROPOSED_RESOLVED = "agent_proposed_resolved"


class MemoryMessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"
