import uuid
from typing import Any, Dict, List, Optional
from src.api.schemas import StreamEvent
from src.domain.memory.entities import DecisionRecord, PendingDecisionRecord
from src.domain.memory.policy import MemoryPolicy


def _make_v3_event(
    event_type: str,
    phase: str,
    payload: Dict[str, Any],
    execution_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    iteration_index: Optional[int] = None,
) -> StreamEvent:
    # Sanitizar payload para garantizar cero fuga de secretos en el stream SSE
    clean_payload = MemoryPolicy.sanitize_payload(payload)
    return StreamEvent(
        event_id=f"evt-v3-{uuid.uuid4().hex[:10]}",
        agent_version="v3",
        execution_id=execution_id,
        iteration_index=iteration_index,
        phase=phase,
        correlation_id=correlation_id,
        type=event_type,
        payload=clean_payload,
    )


def event_v3_memory_hydrated(
    execution_id: str,
    correlation_id: str,
    conversation_id: str,
    stats: Dict[str, Any],
    active_decisions: List[DecisionRecord],
) -> StreamEvent:
    return _make_v3_event(
        event_type="MEMORY_HYDRATED",
        phase="hydration",
        payload={
            "conversation_id": conversation_id,
            "turns_count": stats.get("history_turns_count", 0),
            "decisions_count": stats.get("decisions_count", 0),
            "active_decisions": [
                {"key": d.key, "value": d.value, "scope": d.scope.value, "version": d.version}
                for d in active_decisions
            ],
            "stats": stats,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
    )


def event_v3_decision_saved(
    execution_id: str,
    correlation_id: str,
    decision: DecisionRecord,
) -> StreamEvent:
    return _make_v3_event(
        event_type="DECISION_SAVED",
        phase="memory",
        payload={
            "decision_id": decision.decision_id,
            "key": decision.key,
            "value": decision.value,
            "scope": decision.scope.value,
            "version": decision.version,
            "status": decision.status.value,
            "rationale": decision.rationale,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
    )


def event_v3_decision_revoked(
    execution_id: str,
    correlation_id: str,
    decision_key: str,
) -> StreamEvent:
    return _make_v3_event(
        event_type="DECISION_REVOKED",
        phase="memory",
        payload={
            "decision_key": decision_key,
            "status": "revoked",
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
    )


def event_v3_pending_task_proposed(
    execution_id: str,
    correlation_id: str,
    task: PendingDecisionRecord,
) -> StreamEvent:
    return _make_v3_event(
        event_type="PENDING_TASK_PROPOSED",
        phase="hitl_pause",
        payload={
            "decision_id": task.decision_id,
            "question": task.question,
            "options": task.options,
            "target_tool_name": task.target_tool_name,
            "missing_parameter_name": task.missing_parameter_name,
            "status": task.status.value,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
    )


def event_v3_pending_task_resolved(
    execution_id: str,
    correlation_id: str,
    task: PendingDecisionRecord,
) -> StreamEvent:
    return _make_v3_event(
        event_type="PENDING_TASK_RESOLVED",
        phase="resumption",
        payload={
            "decision_id": task.decision_id,
            "selected_value": task.selected_value,
            "target_tool_name": task.target_tool_name,
            "status": task.status.value,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
    )


def event_v3_recovery_alert(
    execution_id: str,
    correlation_id: str,
    task: PendingDecisionRecord,
) -> StreamEvent:
    return _make_v3_event(
        event_type="TASK_RECOVERY_REQUIRED",
        phase="reconciliation",
        payload={
            "decision_id": task.decision_id,
            "target_tool_name": task.target_tool_name,
            "status": task.status.value,
            "recovery_reason": task.recovery_reason,
            "execution_checkpoint": task.execution_checkpoint,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
    )


def event_v3_turn_persisted(
    execution_id: str,
    correlation_id: str,
    turn_id: str,
    conversation_id: str,
) -> StreamEvent:
    return _make_v3_event(
        event_type="TURN_PERSISTED",
        phase="persistence",
        payload={
            "turn_id": turn_id,
            "conversation_id": conversation_id,
            "status": "stored_in_mysql",
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
    )
