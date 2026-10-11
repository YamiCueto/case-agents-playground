from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from src.domain.exceptions import ValidationError
from src.domain.memory.enums import DecisionStatus, MemoryScope, ProvenanceType


@dataclass
class ConversationTurn:
    turn_id: str
    conversation_id: str
    user_id: int
    subject_id: str
    user_query: str
    agent_response: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    tokens_estimate: int = 0

    def __post_init__(self) -> None:
        if not self.turn_id or not self.turn_id.strip():
            raise ValidationError("turn_id no puede ser vacío.")
        if not self.conversation_id or not self.conversation_id.strip():
            raise ValidationError("conversation_id no puede ser vacío.")
        if self.user_id <= 0:
            raise ValidationError("user_id debe ser un entero positivo.")
        if not self.subject_id or not self.subject_id.strip():
            raise ValidationError("subject_id no puede ser vacío.")
        if not self.user_query or not self.user_query.strip():
            raise ValidationError("user_query no puede ser vacío.")


@dataclass
class ConversationSession:
    conversation_id: str
    user_id: int
    subject_id: str
    title: str = "Nueva Conversación"
    turns: List[ConversationTurn] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        if not self.conversation_id or not self.conversation_id.strip():
            raise ValidationError("conversation_id no puede ser vacío.")
        if self.user_id <= 0:
            raise ValidationError("user_id debe ser un entero positivo.")
        if not self.subject_id or not self.subject_id.strip():
            raise ValidationError("subject_id no puede ser vacío.")

    def add_turn(self, turn: ConversationTurn) -> None:
        if turn.conversation_id != self.conversation_id:
            raise ValidationError(
                f"El turno pertenece a la conversación '{turn.conversation_id}', no a '{self.conversation_id}'."
            )
        self.turns.append(turn)
        self.updated_at = datetime.now(timezone.utc)

    @property
    def total_turns(self) -> int:
        return len(self.turns)


@dataclass
class DecisionRecord:
    decision_id: str
    user_id: int
    subject_id: str
    scope: MemoryScope
    key: str
    value: Any
    rationale: str
    provenance: ProvenanceType
    session_id: Optional[str] = None
    status: DecisionStatus = DecisionStatus.RESOLVED
    version: int = 1
    supersedes_decision_id: Optional[str] = None
    active_lock_key: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    revoked_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.decision_id or not self.decision_id.strip():
            raise ValidationError("decision_id no puede ser vacío.")
        if self.user_id <= 0:
            raise ValidationError("user_id debe ser un entero positivo.")
        if not self.subject_id or not self.subject_id.strip():
            raise ValidationError("subject_id no puede ser vacío.")
        if not self.key or not self.key.strip():
            raise ValidationError("key no puede ser vacío.")
        if self.version <= 0:
            raise ValidationError("version debe ser un entero positivo mayor o igual a 1.")
        if self.scope == MemoryScope.SESSION and not self.session_id:
            raise ValidationError("Las decisiones con scope SESSION requieren session_id.")


    @property
    def is_active(self) -> bool:
        return self.status == DecisionStatus.RESOLVED and self.revoked_at is None

    def revoke(self) -> None:
        if self.status == DecisionStatus.REVOKED:
            return
        self.status = DecisionStatus.REVOKED
        self.revoked_at = datetime.now(timezone.utc)
        self.active_lock_key = None


@dataclass
class PendingDecisionRecord:
    decision_id: str
    user_id: int
    subject_id: str
    session_id: str
    conversation_id: str
    original_query: str
    question: str
    options: List[str]
    target_tool_name: str
    pending_tool_arguments: Dict[str, Any]
    missing_parameter_name: str
    required_role: str = "USER"
    allow_custom_answer: bool = True
    status: DecisionStatus = DecisionStatus.PENDING
    selected_value: Optional[str] = None
    lease_owner: Optional[str] = None
    lease_expires_at: Optional[datetime] = None
    idempotency_token: Optional[str] = None
    execution_checkpoint: Optional[Dict[str, Any]] = None
    recovery_reason: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.decision_id or not self.decision_id.strip():
            raise ValidationError("decision_id no puede ser vacío.")
        if self.user_id <= 0:
            raise ValidationError("user_id debe ser un entero positivo.")
        if not self.subject_id or not self.subject_id.strip():
            raise ValidationError("subject_id no puede ser vacío.")
        if not self.session_id or not self.session_id.strip():
            raise ValidationError("session_id no puede ser vacío.")
        if not self.conversation_id or not self.conversation_id.strip():
            raise ValidationError("conversation_id no puede ser vacío.")
        if not self.options or len(self.options) == 0:
            raise ValidationError("Una decisión pendiente requiere al menos una opción.")
        if not self.target_tool_name or not self.target_tool_name.strip():
            raise ValidationError("target_tool_name no puede ser vacío.")
        if not self.missing_parameter_name or not self.missing_parameter_name.strip():
            raise ValidationError("missing_parameter_name no puede ser vacío.")

    @property
    def is_pending(self) -> bool:
        return self.status == DecisionStatus.PENDING

    def mark_resolving(
        self, lease_owner: Optional[str] = None, lease_expires_at: Optional[datetime] = None
    ) -> None:
        if self.status != DecisionStatus.PENDING:
            raise ValidationError(
                f"No se puede transicionar a RESOLVING desde el estado '{self.status.value}'."
            )
        self.status = DecisionStatus.RESOLVING
        self.lease_owner = lease_owner
        self.lease_expires_at = lease_expires_at

    def mark_recovery_required(self, reason: str) -> None:
        self.status = DecisionStatus.RECOVERY_REQUIRED
        self.recovery_reason = reason

    def resolve(self, value: str) -> None:
        if not value or not str(value).strip():
            raise ValidationError("El valor resuelto para la decisión no puede ser vacío.")
        if self.status != DecisionStatus.RESOLVING:
            raise ValidationError(
                f"Transición de estado inválida: no se puede resolver una decisión en estado '{self.status.value}'. Debe estar en RESOLVING."
            )
        self.selected_value = str(value).strip()
        self.status = DecisionStatus.RESOLVED
        self.resolved_at = datetime.now(timezone.utc)
        self.lease_expires_at = None
        self.lease_owner = None

    def fail(self) -> None:
        self.status = DecisionStatus.FAILED
        self.lease_expires_at = None
        self.lease_owner = None

    def cancel(self) -> None:
        self.status = DecisionStatus.CANCELLED
        self.lease_expires_at = None
        self.lease_owner = None

    def get_merged_arguments(self) -> Dict[str, Any]:
        if self.status != DecisionStatus.RESOLVED or self.selected_value is None:
            raise ValidationError(
                "No se pueden generar argumentos combinados de una decisión no resuelta."
            )
        merged = dict(self.pending_tool_arguments)
        merged[self.missing_parameter_name] = self.selected_value
        return merged
