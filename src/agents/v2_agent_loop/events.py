import uuid
from typing import Any, Dict, List, Optional
from src.agents.common.contracts import ToolCall
from src.agents.tools.ticket_tools import TOOLS_SCHEMAS
from src.agents.v2_agent_loop.state import AgentExecutionState
from src.api.schemas import StreamEvent


def _make_event(
    state: AgentExecutionState,
    event_type: str,
    phase: str,
    payload: Dict[str, Any],
) -> StreamEvent:
    return StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v2",
        execution_id=state.execution_id,
        iteration_index=state.iteration_index,
        phase=phase,
        correlation_id=state.correlation_id,
        type=event_type,
        payload=payload,
    )


def event_run_started(state: AgentExecutionState) -> StreamEvent:
    return StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v2",
        execution_id=state.execution_id,
        iteration_index=0,
        phase="init",
        correlation_id=state.correlation_id,
        type="RUN_STARTED",
        payload={
            "query": state.query,
            "operator": state.operator_username,
            "max_iterations": state.max_iterations,
            "global_timeout_seconds": state.global_timeout_seconds,
            "inference_timeout_seconds": state.inference_timeout_seconds,
            "tool_timeout_seconds": state.tool_timeout_seconds,
        },
    )


def event_iteration_started(state: AgentExecutionState) -> StreamEvent:
    return _make_event(
        state,
        "ITERATION_STARTED",
        "loop",
        {
            "iteration_index": state.iteration_index,
            "max_iterations": state.max_iterations,
            "elapsed_seconds": round(state.elapsed_seconds(), 3),
            "remaining_global_seconds": round(state.remaining_global_seconds(), 3),
        },
    )


def event_inference_started(
    state: AgentExecutionState,
    provider_type: str,
    model_name: str,
    timeout_seconds: float,
) -> StreamEvent:
    return _make_event(
        state,
        "MODEL_INFERENCE_STARTED",
        "inference",
        {
            "provider_type": provider_type,
            "model_name": model_name,
            "messages_count": len(state.messages),
            "tools_registered_count": len(TOOLS_SCHEMAS),
            "tools_schemas": [t["name"] for t in TOOLS_SCHEMAS],
            "timeout_seconds": timeout_seconds,
        },
    )


def event_inference_completed(
    state: AgentExecutionState,
    has_tool_calls: bool,
    tool_calls_count: int,
    duration_ms: float,
) -> StreamEvent:
    return _make_event(
        state,
        "MODEL_INFERENCE_COMPLETED",
        "inference",
        {
            "has_tool_calls": has_tool_calls,
            "tool_calls_count": tool_calls_count,
            "duration_ms": round(duration_ms, 2),
            "finish_reason": "tool_calls" if has_tool_calls else "stop",
        },
    )


def event_tool_proposed(
    state: AgentExecutionState,
    tool_call: ToolCall,
    is_mutative: bool,
) -> StreamEvent:
    return _make_event(
        state,
        "TOOL_CALL_PROPOSED",
        "proposal",
        {
            "tool_call_id": tool_call.id,
            "tool_name": tool_call.name,
            "arguments": tool_call.arguments,
            "is_mutative": is_mutative,
        },
    )


def event_arguments_validated(
    state: AgentExecutionState,
    tool_call: ToolCall,
    is_valid: bool,
    validated_args: Dict[str, Any],
    val_error: Optional[str],
) -> StreamEvent:
    return _make_event(
        state,
        "ARGUMENTS_VALIDATED",
        "validation",
        {
            "tool_call_id": tool_call.id,
            "tool_name": tool_call.name,
            "is_valid": is_valid,
            "validated_arguments": validated_args if is_valid else {},
            "validation_error": val_error if not is_valid else None,
        },
    )


def event_tool_execution_started(
    state: AgentExecutionState,
    tool_call: ToolCall,
    is_mutative: bool,
    policy: str,
) -> StreamEvent:
    return _make_event(
        state,
        "TOOL_EXECUTION_STARTED",
        "execution",
        {
            "tool_call_id": tool_call.id,
            "tool_name": tool_call.name,
            "operator": state.operator_username,
            "is_mutative": is_mutative,
            "policy": policy,
        },
    )


def event_tool_execution_completed(
    state: AgentExecutionState,
    tool_call: ToolCall,
    execution_status: Optional[str],
    duration_ms: float,
    is_mutative: bool,
    idempotency_hit: bool,
    result: Dict[str, Any],
) -> StreamEvent:
    return _make_event(
        state,
        "TOOL_EXECUTION_COMPLETED",
        "execution",
        {
            "tool_call_id": tool_call.id,
            "tool_name": tool_call.name,
            "execution_status": execution_status,
            "duration_ms": round(duration_ms, 2),
            "is_mutative": is_mutative,
            "idempotency_hit": idempotency_hit,
            "result": result,
        },
    )


def event_observation_appended(
    state: AgentExecutionState,
    tool_call: ToolCall,
    result: Dict[str, Any],
) -> StreamEvent:
    return _make_event(
        state,
        "OBSERVATION_APPENDED",
        "observation",
        {
            "tool_call_id": tool_call.id,
            "tool_name": tool_call.name,
            "role": "tool",
            "observation": result,
        },
    )


def event_iteration_completed(
    state: AgentExecutionState,
    duration_ms: float,
    tool_calls_count: int,
    had_observation: bool,
    decision: str,
    tools_invoked: List[str],
) -> StreamEvent:
    return _make_event(
        state,
        "ITERATION_COMPLETED",
        "loop",
        {
            "iteration_index": state.iteration_index,
            "duration_ms": round(duration_ms, 2),
            "tool_calls_count": tool_calls_count,
            "had_observation": had_observation,
            "decision": decision,
            "tools_invoked": tools_invoked,
        },
    )


def event_final_synthesis(
    state: AgentExecutionState,
    answer: str,
) -> StreamEvent:
    return _make_event(
        state,
        "FINAL_SYNTHESIS",
        "synthesis",
        {
            "answer": answer,
            "content": answer,
            "message": answer,
            "total_iterations": state.iteration_index,
        },
    )


def event_loop_limit_exceeded(state: AgentExecutionState) -> StreamEvent:
    return _make_event(
        state,
        "LOOP_LIMIT_EXCEEDED",
        "loop",
        {
            "max_iterations": state.max_iterations,
            "message": state.error_message,
        },
    )


def event_repetition_detected(
    state: AgentExecutionState,
    tool_calls_count: int,
) -> StreamEvent:
    return _make_event(
        state,
        "LOOP_REPETITION_DETECTED",
        "loop",
        {
            "message": state.error_message,
            "tool_calls_count": tool_calls_count,
        },
    )


def event_timeout_exceeded(
    state: AgentExecutionState,
    reason: str,
    message: str,
) -> StreamEvent:
    return _make_event(
        state,
        "LOOP_TIMEOUT_EXCEEDED",
        "loop",
        {
            "reason": reason,
            "message": message,
        },
    )


def event_run_completed(state: AgentExecutionState) -> StreamEvent:
    return _make_event(
        state,
        "RUN_COMPLETED",
        "complete",
        {
            "status": "completed",
            "stop_reason": state.stop_reason.value if state.stop_reason else "final_answer",
            "total_iterations": state.iteration_index,
            "total_tools_executed": len(state.executed_tools),
            "total_duration_ms": round(state.total_duration_ms, 2),
        },
    )


def event_run_failed(state: AgentExecutionState) -> StreamEvent:
    return _make_event(
        state,
        "RUN_FAILED",
        "complete",
        {
            "status": "failed",
            "stop_reason": state.stop_reason.value if state.stop_reason else "error",
            "error_message": state.error_message,
            "total_iterations": state.iteration_index,
        },
    )


def event_run_cancelled(state: AgentExecutionState) -> StreamEvent:
    return _make_event(
        state,
        "RUN_CANCELLED",
        "complete",
        {
            "status": "cancelled",
            "stop_reason": "client_cancelled",
            "message": "Ejecución cancelada por desconexión del cliente.",
            "total_iterations": state.iteration_index,
        },
    )
