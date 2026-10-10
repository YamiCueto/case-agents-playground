import asyncio
import concurrent.futures
import time
from typing import Any, Callable, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from src.agents.common.contracts import ToolCall
from src.agents.tools.ticket_tools import execute_tool_call, validate_tool_arguments
from src.agents.v2_agent_loop.idempotency import (
    IdempotencyRegistry,
    authorize_tool_action,
)
from src.agents.v2_agent_loop.inference import run_with_nonblocking_timeout


def validate_tool_arguments_safe(tc: ToolCall) -> Tuple[Dict[str, Any], bool, str]:
    try:
        validated_args = validate_tool_arguments(tc.name, tc.arguments)
        return validated_args, True, ""
    except Exception as err:
        return tc.arguments, False, str(err)


def isolated_tool_runner(
    tool_call: ToolCall,
    session_factory: Callable[[], Session],
    operator_username: str,
) -> Dict[str, Any]:
    import src.agents.v2_agent_loop.agent as agent_module

    runner_fn = getattr(agent_module, "execute_tool_call", execute_tool_call)
    sess = session_factory()
    try:
        return runner_fn(tool_call, sess, operator_username)
    finally:
        try:
            sess.close()
        except Exception:
            pass


def execute_tool(
    execution_id: str,
    operator_username: str,
    tool_call: ToolCall,
    session_factory: Callable[[], Session],
    session: Optional[Session],
    idempotency: IdempotencyRegistry,
    remaining_global_seconds: float,
    tool_timeout_seconds: float,
    is_valid: bool,
    validation_error_msg: str,
) -> Tuple[Dict[str, Any], bool, float]:
    tool_start_mono = time.monotonic()
    is_mutative = idempotency.is_mutative(tool_call.name)
    idempotency_hit = False

    policy, policy_data = idempotency.check_mutation_policy(
        execution_id, tool_call.name, tool_call.arguments
    )

    if not is_valid:
        execution_result = {
            "status": "error",
            "error_type": "argumentos_invalidos",
            "message": validation_error_msg,
        }
    elif policy == "BLOCKED_UNCERTAIN":
        execution_result = policy_data or {
            "status": "error",
            "error_type": "mutacion_estado_incierto",
            "message": "Operación mutativa bloqueada por resultado previo incierto tras timeout.",
        }
    elif policy == "CACHED":
        idempotency_hit = True
        execution_result = {
            "status": "success",
            "idempotency_hit": True,
            "tool_name": tool_call.name,
            "message": "Operación mutativa idempotente: se retorna resultado previo de esta ejecución.",
            "data": policy_data.get("data") if policy_data else None,
        }
    else:
        authorized, auth_msg = authorize_tool_action(
            tool_call.name, operator_username, session
        )
        if not authorized:
            execution_result = {
                "status": "error",
                "error_type": "no_autorizado",
                "message": auth_msg,
            }
            if is_mutative:
                idempotency.record_failed(
                    execution_id, tool_call.name, tool_call.arguments
                )
        else:
            if is_mutative:
                idempotency.record_pending(
                    execution_id, tool_call.name, tool_call.arguments
                )

            rem_tool = min(remaining_global_seconds, tool_timeout_seconds)

            try:
                execution_result = run_with_nonblocking_timeout(
                    isolated_tool_runner,
                    args=(tool_call, session_factory, operator_username),
                    timeout_seconds=rem_tool,
                )
                if is_mutative:
                    if execution_result.get("status") == "success":
                        idempotency.record_completed(
                            execution_id,
                            tool_call.name,
                            tool_call.arguments,
                            execution_result,
                        )
                    else:
                        idempotency.record_failed(
                            execution_id, tool_call.name, tool_call.arguments
                        )
            except concurrent.futures.TimeoutError:
                if is_mutative:
                    idempotency.record_uncertain_timeout(
                        execution_id, tool_call.name, tool_call.arguments
                    )
                if session is not None:
                    try:
                        session.invalidate()
                    except Exception:
                        pass
                execution_result = {
                    "status": "error",
                    "error_type": "timeout",
                    "message": f"Herramienta '{tool_call.name}' excedió el límite de {rem_tool:.2f}s.",
                }
            except Exception as tool_err:
                if is_mutative:
                    idempotency.record_failed(
                        execution_id, tool_call.name, tool_call.arguments
                    )
                execution_result = {
                    "status": "error",
                    "error_type": "excepcion_ejecucion",
                    "message": str(tool_err),
                }

    tool_duration = (time.monotonic() - tool_start_mono) * 1000.0
    return execution_result, idempotency_hit, tool_duration


async def execute_tool_async(
    execution_id: str,
    operator_username: str,
    tool_call: ToolCall,
    session_factory: Callable[[], Session],
    session: Optional[Session],
    idempotency: IdempotencyRegistry,
    remaining_global_seconds: float,
    tool_timeout_seconds: float,
    is_valid: bool,
    validation_error_msg: str,
) -> Tuple[Dict[str, Any], bool, float]:
    return await asyncio.to_thread(
        execute_tool,
        execution_id,
        operator_username,
        tool_call,
        session_factory,
        session,
        idempotency,
        remaining_global_seconds,
        tool_timeout_seconds,
        is_valid,
        validation_error_msg,
    )
