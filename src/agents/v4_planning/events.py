import uuid
from typing import Any, Dict, List, Optional
from src.api.schemas import StreamEvent
from src.domain.memory.policy import MemoryPolicy
from src.domain.planning.entities import Plan, PlanStep


def _make_v4_event(
    event_type: str,
    phase: str,
    payload: Dict[str, Any],
    execution_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    iteration_index: Optional[int] = None,
) -> StreamEvent:
    clean_payload = MemoryPolicy.sanitize_payload(payload)
    return StreamEvent(
        event_id=f"evt-v4-{uuid.uuid4().hex[:10]}",
        agent_version="v4",
        execution_id=execution_id,
        iteration_index=iteration_index,
        phase=phase,
        correlation_id=correlation_id,
        type=event_type,
        payload=clean_payload,
    )


def event_v4_plan_generated(
    execution_id: str,
    correlation_id: str,
    plan: Plan,
    iteration_index: int = 0,
) -> StreamEvent:
    return _make_v4_event(
        event_type="PLAN_GENERATED",
        phase="planning",
        payload={
            "goal": plan.goal,
            "revision": plan.revision,
            "steps_count": len(plan.steps),
            "steps": [s.to_dict() for s in plan.steps],
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_plan_validated(
    execution_id: str,
    correlation_id: str,
    plan: Plan,
    iteration_index: int = 0,
) -> StreamEvent:
    return _make_v4_event(
        event_type="PLAN_VALIDATED",
        phase="validation",
        payload={
            "goal": plan.goal,
            "revision": plan.revision,
            "is_valid": True,
            "steps_count": len(plan.steps),
            "step_ids": [s.id for s in plan.steps],
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_step_started(
    execution_id: str,
    correlation_id: str,
    step: PlanStep,
    revision: int,
    iteration_index: int,
) -> StreamEvent:
    return _make_v4_event(
        event_type="STEP_STARTED",
        phase="execution",
        payload={
            "step_id": step.id,
            "action": step.action,
            "description": step.description,
            "executor": step.executor.value,
            "status": step.status.value,
            "revision": revision,
            "depends_on": list(step.depends_on),
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_step_completed(
    execution_id: str,
    correlation_id: str,
    step: PlanStep,
    revision: int,
    iteration_index: int,
    duration_ms: float = 0.0,
) -> StreamEvent:
    return _make_v4_event(
        event_type="STEP_COMPLETED",
        phase="execution",
        payload={
            "step_id": step.id,
            "action": step.action,
            "executor": step.executor.value,
            "status": step.status.value,
            "revision": revision,
            "duration_ms": round(duration_ms, 2),
            "observation": step.observation,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_step_failed(
    execution_id: str,
    correlation_id: str,
    step: PlanStep,
    revision: int,
    iteration_index: int,
    error_message: str,
) -> StreamEvent:
    return _make_v4_event(
        event_type="STEP_FAILED",
        phase="execution",
        payload={
            "step_id": step.id,
            "action": step.action,
            "executor": step.executor.value,
            "status": step.status.value,
            "revision": revision,
            "error": error_message,
            "observation": step.observation,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_replanning_triggered(
    execution_id: str,
    correlation_id: str,
    failed_step_id: str,
    current_revision: int,
    archived_snapshots_count: int,
    iteration_index: int,
) -> StreamEvent:
    return _make_v4_event(
        event_type="REPLANNING_TRIGGERED",
        phase="replanning",
        payload={
            "failed_step_id": failed_step_id,
            "previous_revision": current_revision,
            "archived_snapshots_count": archived_snapshots_count,
            "reason": f"Paso [{failed_step_id}] falló durante la ejecución. Activando estrategia de contingencia.",
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_plan_revision_created(
    execution_id: str,
    correlation_id: str,
    new_plan: Plan,
    iteration_index: int,
) -> StreamEvent:
    return _make_v4_event(
        event_type="PLAN_REVISION_CREATED",
        phase="replanning",
        payload={
            "goal": new_plan.goal,
            "new_revision": new_plan.revision,
            "steps_count": len(new_plan.steps),
            "steps": [s.to_dict() for s in new_plan.steps],
            "goal_preserved": True,
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_plan_blocked(
    execution_id: str,
    correlation_id: str,
    blocked_step_ids: List[str],
    revision: int,
    iteration_index: int,
) -> StreamEvent:
    return _make_v4_event(
        event_type="PLAN_BLOCKED",
        phase="stall",
        payload={
            "termination_reason": "no_executable_steps",
            "blocked_step_ids": blocked_step_ids,
            "revision": revision,
            "message": "Runtime Stall: Existen pasos pendientes pero ninguno tiene sus dependencias resueltas.",
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )


def event_v4_plan_completed(
    execution_id: str,
    correlation_id: str,
    plan: Plan,
    iteration_index: int,
) -> StreamEvent:
    return _make_v4_event(
        event_type="PLAN_COMPLETED",
        phase="complete",
        payload={
            "goal": plan.goal,
            "revision": plan.revision,
            "is_completed": plan.is_completed,
            "steps_resolved_count": len([s for s in plan.steps if s.status in {step_status for step_status in [s.status]}]),
        },
        execution_id=execution_id,
        correlation_id=correlation_id,
        iteration_index=iteration_index,
    )
