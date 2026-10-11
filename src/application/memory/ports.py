from abc import ABC, abstractmethod
from typing import List, Optional
from src.domain.memory.entities import (
    ConversationSession,
    ConversationTurn,
    DecisionRecord,
    PendingDecisionRecord,
)


class ConversationMemoryStore(ABC):
    """Puerto de aplicación para el almacenamiento de conversaciones e historial."""

    @abstractmethod
    def create_or_get_conversation(
        self, user_id: int, subject_id: str, conversation_id: str, title: Optional[str] = None
    ) -> ConversationSession:
        pass

    @abstractmethod
    def save_turn(self, turn: ConversationTurn) -> None:
        pass

    @abstractmethod
    def get_conversation(self, conversation_id: str, user_id: int) -> Optional[ConversationSession]:
        pass

    @abstractmethod
    def get_recent_turns(self, conversation_id: str, user_id: int, limit: int = 10) -> List[ConversationTurn]:
        pass

    @abstractmethod
    def clear_conversation(self, conversation_id: str, user_id: int) -> bool:
        pass


class DecisionMemoryStore(ABC):
    """Puerto de aplicación para el almacenamiento de decisiones, preferencias y tareas pendientes."""

    @abstractmethod
    def save_decision(
        self, record: DecisionRecord, explicit_user_confirmation: bool = False
    ) -> DecisionRecord:
        pass

    @abstractmethod
    def get_active_decisions(
        self, user_id: int, subject_id: str, session_id: Optional[str] = None
    ) -> List[DecisionRecord]:
        pass

    @abstractmethod
    def revoke_decision(self, decision_id: str, user_id: int) -> bool:
        pass

    @abstractmethod
    def get_decision_history(self, decision_key: str, user_id: int) -> List[DecisionRecord]:
        """Recupera la cadena histórica completa de versiones y revocaciones para una clave de decisión."""
        pass


    @abstractmethod
    def save_pending_task(self, task: PendingDecisionRecord) -> PendingDecisionRecord:
        pass

    @abstractmethod
    def get_pending_task(self, decision_id: str, user_id: int) -> Optional[PendingDecisionRecord]:
        pass

    @abstractmethod
    def get_active_pending_task_by_session(
        self, user_id: int, session_id: str
    ) -> Optional[PendingDecisionRecord]:
        pass

    @abstractmethod
    def atomic_acquire_for_resolving(
        self,
        decision_id: str,
        user_id: int,
        lease_owner: Optional[str] = None,
        lease_seconds: int = 300,
    ) -> PendingDecisionRecord:
        pass

    @abstractmethod
    def atomic_reclaim_expired_task(
        self, decision_id: str, user_id: int
    ) -> PendingDecisionRecord:
        """Transiciona tareas con lease vencido a 'recovery_required' para evitar reejecuciones ciegas."""
        pass

    @abstractmethod
    def record_execution_checkpoint(
        self, decision_id: str, user_id: int, checkpoint: dict
    ) -> PendingDecisionRecord:
        """Registra el punto de control de ejecución de herramienta para idempotencia de extremo a extremo."""
        pass

    @abstractmethod
    def reconcile_and_resolve(
        self, decision_id: str, user_id: int, selected_value: str, reconciliation_note: str
    ) -> PendingDecisionRecord:
        """Reconcilia una tarea en recovery_required tras confirmar éxito externo y la marca como resuelta."""
        pass

    @abstractmethod
    def reconcile_and_reset_to_pending(
        self, decision_id: str, user_id: int, reconciliation_note: str
    ) -> PendingDecisionRecord:
        """Reconcilia una tarea en recovery_required tras confirmar ausencia de mutación y la devuelve a pending."""
        pass

    @abstractmethod
    def atomic_resolve_task(
        self, decision_id: str, user_id: int, selected_value: str
    ) -> PendingDecisionRecord:
        pass

    @abstractmethod
    def atomic_acquire_and_resolve_task(
        self,
        decision_id: str,
        user_id: int,
        selected_value: str,
        lease_owner: Optional[str] = None,
        lease_seconds: int = 300,
    ) -> PendingDecisionRecord:
        pass

    @abstractmethod
    def atomic_fail_task(
        self, decision_id: str, user_id: int, reason: Optional[str] = None
    ) -> PendingDecisionRecord:
        pass

    @abstractmethod
    def cancel_pending_task(self, decision_id: str, user_id: int) -> bool:
        pass

