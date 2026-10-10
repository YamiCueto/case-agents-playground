import asyncio
import concurrent.futures
import json
import time
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelProvider, ModelResponse, ToolCall
from src.agents.v2_agent_loop.cycle_detector import check_stagnation, compute_action_signature
from src.agents.v2_agent_loop.events import (
    event_arguments_validated,
    event_final_synthesis,
    event_inference_completed,
    event_inference_started,
    event_iteration_completed,
    event_iteration_started,
    event_loop_limit_exceeded,
    event_observation_appended,
    event_repetition_detected,
    event_run_cancelled,
    event_run_completed,
    event_run_failed,
    event_run_started,
    event_timeout_exceeded,
    event_tool_execution_completed,
    event_tool_execution_started,
    event_tool_proposed,
)
from src.agents.v2_agent_loop.idempotency import IdempotencyRegistry
from src.agents.v2_agent_loop.inference import (
    SYSTEM_PROMPT_V2,
    execute_inference,
    execute_inference_async,
)
from src.agents.v2_agent_loop.state import (
    AgentExecutionState,
    ExecutionStatus,
    IterationSummary,
    StopReason,
    ToolExecutionRecord,
)
from src.agents.v2_agent_loop.tool_executor import (
    execute_tool,
    execute_tool_async,
    validate_tool_arguments_safe,
)
from src.api.schemas import StreamEvent


class AgentLoopEngine:
    def __init__(
        self,
        provider: ModelProvider,
        session: Optional[Session] = None,
        session_factory: Optional[Callable[[], Session]] = None,
        idempotency_registry: Optional[IdempotencyRegistry] = None,
    ) -> None:
        from src.infrastructure.database.connection import get_app_session_factory

        self.provider = provider
        self.session = session
        self.session_factory = session_factory or get_app_session_factory()
        self.idempotency = idempotency_registry or IdempotencyRegistry()

    def init_state(
        self,
        query: str,
        operator_username: str = "usr_carlos",
        max_iterations: int = 5,
        global_timeout_seconds: float = 60.0,
        inference_timeout_seconds: float = 30.0,
        tool_timeout_seconds: float = 15.0,
    ) -> AgentExecutionState:
        state = AgentExecutionState(
            query=query,
            operator_username=operator_username,
            max_iterations=max_iterations,
            global_timeout_seconds=global_timeout_seconds,
            inference_timeout_seconds=inference_timeout_seconds,
            tool_timeout_seconds=tool_timeout_seconds,
            start_time_monotonic=time.monotonic(),
            status=ExecutionStatus.RUNNING,
        )
        state.messages = [
            {"role": "system", "content": SYSTEM_PROMPT_V2},
            {"role": "user", "content": query},
        ]
        return state

    def check_global_timeout(self, state: AgentExecutionState) -> bool:
        if state.is_global_timeout():
            state.status = ExecutionStatus.FAILED
            state.stop_reason = StopReason.GLOBAL_TIMEOUT
            state.error_message = (
                f"Tiempo global de ejecución ({state.global_timeout_seconds}s) superado."
            )
            return True
        return False

    def start_iteration(self, state: AgentExecutionState) -> Tuple[float, float]:
        state.iteration_index += 1
        iter_start_mono = time.monotonic()
        rem_global = state.remaining_global_seconds()
        effective_inf_timeout = min(rem_global, state.inference_timeout_seconds)
        return iter_start_mono, effective_inf_timeout

    def handle_inference_timeout(
        self,
        state: AgentExecutionState,
        effective_timeout: float,
        iter_start_mono: float,
    ) -> None:
        state.status = ExecutionStatus.FAILED
        state.stop_reason = StopReason.INFERENCE_TIMEOUT
        state.error_message = (
            f"Inferencia del modelo excedió el límite de {effective_timeout:.2f}s."
        )
        iter_duration = (time.monotonic() - iter_start_mono) * 1000.0
        state.record_iteration(
            IterationSummary(
                iteration_index=state.iteration_index,
                duration_ms=iter_duration,
                tool_calls_count=0,
                had_observation=False,
                decision="timeout",
            )
        )

    def handle_inference_fatal_error(
        self,
        state: AgentExecutionState,
        err_msg: str,
    ) -> None:
        state.status = ExecutionStatus.FAILED
        state.stop_reason = StopReason.FATAL_ERROR
        state.error_message = f"Error en inferencia: {err_msg}"

    def handle_terminal_response(
        self,
        state: AgentExecutionState,
        content: Optional[str],
        iter_start_mono: float,
    ) -> None:
        state.final_answer = content or "Consulta resuelta sin herramientas."
        state.status = ExecutionStatus.COMPLETED
        state.stop_reason = StopReason.FINAL_ANSWER
        iter_duration = (time.monotonic() - iter_start_mono) * 1000.0
        state.record_iteration(
            IterationSummary(
                iteration_index=state.iteration_index,
                duration_ms=iter_duration,
                tool_calls_count=0,
                had_observation=False,
                decision="final_answer",
            )
        )

    def check_stagnation_state(
        self,
        state: AgentExecutionState,
        tool_calls: List[ToolCall],
        previous_sig: Optional[Tuple[Tuple[str, str], ...]],
        repetition_count: int,
        iter_start_mono: float,
    ) -> Tuple[bool, Tuple[Tuple[str, str], ...], int]:
        current_sig = compute_action_signature(tool_calls)
        has_mutative = any(self.idempotency.is_mutative(tc.name) for tc in tool_calls)
        is_stagnant, new_count = check_stagnation(
            current_sig, previous_sig, repetition_count, has_mutative
        )
        if is_stagnant:
            state.status = ExecutionStatus.FAILED
            state.stop_reason = StopReason.REPETITIVE_TOOL_CALL
            state.error_message = (
                "Estancamiento detectado: el agente propuso de forma repetitiva el mismo "
                "conjunto de herramientas y argumentos sin avanzar."
            )
            iter_duration = (time.monotonic() - iter_start_mono) * 1000.0
            state.record_iteration(
                IterationSummary(
                    iteration_index=state.iteration_index,
                    duration_ms=iter_duration,
                    tool_calls_count=len(tool_calls),
                    had_observation=False,
                    decision="stagnation_stopped",
                    tools_invoked=[tc.name for tc in tool_calls],
                )
            )
            return True, current_sig, new_count
        return False, current_sig, new_count

    def append_assistant_tool_calls(
        self,
        state: AgentExecutionState,
        content: Optional[str],
        tool_calls: List[ToolCall],
    ) -> None:
        state.messages.append({
            "role": "assistant",
            "content": content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                    },
                }
                for tc in tool_calls
            ],
        })

    def process_tool_result(
        self,
        state: AgentExecutionState,
        tc: ToolCall,
        validated_args: Dict[str, Any],
        execution_result: Dict[str, Any],
        idempotency_hit: bool,
        tool_duration: float,
    ) -> None:
        state.record_tool_execution(
            ToolExecutionRecord(
                iteration_index=state.iteration_index,
                tool_call_id=tc.id,
                tool_name=tc.name,
                arguments=tc.arguments,
                validated_arguments=validated_args,
                result=execution_result,
                duration_ms=tool_duration,
                is_mutative=self.idempotency.is_mutative(tc.name),
                idempotency_hit=idempotency_hit,
            )
        )
        state.messages.append({
            "role": "tool",
            "tool_call_id": tc.id,
            "name": tc.name,
            "content": json.dumps(execution_result, ensure_ascii=False),
        })

    def finalize_iteration(
        self,
        state: AgentExecutionState,
        iter_start_mono: float,
        tool_calls_count: int,
        had_observation: bool,
        decision: str,
        tools_invoked: List[str],
    ) -> float:
        iter_duration = (time.monotonic() - iter_start_mono) * 1000.0
        state.record_iteration(
            IterationSummary(
                iteration_index=state.iteration_index,
                duration_ms=iter_duration,
                tool_calls_count=tool_calls_count,
                had_observation=had_observation,
                decision=decision,
                tools_invoked=tools_invoked,
            )
        )
        return iter_duration

    def finalize_run(self, state: AgentExecutionState) -> None:
        if state.status == ExecutionStatus.RUNNING and state.iteration_index >= state.max_iterations:
            state.status = ExecutionStatus.FAILED
            state.stop_reason = StopReason.MAX_ITERATIONS_REACHED
            state.error_message = (
                f"Límite operacional de {state.max_iterations} iteraciones alcanzado sin respuesta final."
            )

    def execute_sync(self, state: AgentExecutionState) -> AgentExecutionState:
        previous_sig: Optional[Tuple[Tuple[str, str], ...]] = None
        repetition_count = 0

        while state.iteration_index < state.max_iterations:
            if self.check_global_timeout(state):
                break

            iter_start_mono, effective_timeout = self.start_iteration(state)
            current_tools: List[str] = []

            try:
                response = execute_inference(self.provider, state.messages, effective_timeout)
            except concurrent.futures.TimeoutError:
                self.handle_inference_timeout(state, effective_timeout, iter_start_mono)
                break
            except Exception as inf_err:
                self.handle_inference_fatal_error(state, str(inf_err))
                break

            if not response.tool_calls:
                self.handle_terminal_response(state, response.content, iter_start_mono)
                break

            is_stagnant, current_sig, repetition_count = self.check_stagnation_state(
                state, response.tool_calls, previous_sig, repetition_count, iter_start_mono
            )
            if is_stagnant:
                break

            previous_sig = current_sig
            self.append_assistant_tool_calls(state, response.content, response.tool_calls)

            for tc in response.tool_calls:
                current_tools.append(tc.name)
                validated_args, is_valid, val_err = validate_tool_arguments_safe(tc)
                execution_result, idempotency_hit, tool_duration = execute_tool(
                    execution_id=state.execution_id,
                    operator_username=state.operator_username,
                    tool_call=tc,
                    session_factory=self.session_factory,
                    session=self.session,
                    idempotency=self.idempotency,
                    remaining_global_seconds=state.remaining_global_seconds(),
                    tool_timeout_seconds=state.tool_timeout_seconds,
                    is_valid=is_valid,
                    validation_error_msg=val_err,
                )
                self.process_tool_result(
                    state, tc, validated_args, execution_result, idempotency_hit, tool_duration
                )

            self.finalize_iteration(
                state,
                iter_start_mono,
                len(response.tool_calls),
                True,
                "continue_next_iteration",
                current_tools,
            )

        self.finalize_run(state)
        return state

    async def execute_stream(
        self,
        state: AgentExecutionState,
    ) -> AsyncGenerator[StreamEvent, None]:
        yield event_run_started(state)
        previous_sig: Optional[Tuple[Tuple[str, str], ...]] = None
        repetition_count = 0

        try:
            while state.iteration_index < state.max_iterations:
                if self.check_global_timeout(state):
                    yield event_timeout_exceeded(
                        state, state.stop_reason.value, state.error_message
                    )
                    break

                iter_start_mono, effective_timeout = self.start_iteration(state)
                current_tools: List[str] = []

                yield event_iteration_started(state)
                yield event_inference_started(
                    state,
                    type(self.provider).__name__,
                    getattr(self.provider, "model_name", "qwen_local"),
                    effective_timeout,
                )

                inf_start_mono = time.monotonic()
                try:
                    response = await execute_inference_async(
                        self.provider, state.messages, effective_timeout
                    )
                except concurrent.futures.TimeoutError:
                    self.handle_inference_timeout(state, effective_timeout, iter_start_mono)
                    yield event_timeout_exceeded(
                        state, state.stop_reason.value, state.error_message
                    )
                    break
                except Exception as inf_err:
                    self.handle_inference_fatal_error(state, str(inf_err))
                    break

                inf_duration = (time.monotonic() - inf_start_mono) * 1000.0
                yield event_inference_completed(
                    state,
                    bool(response.tool_calls),
                    len(response.tool_calls),
                    inf_duration,
                )

                if not response.tool_calls:
                    self.handle_terminal_response(state, response.content, iter_start_mono)
                    yield event_final_synthesis(state, state.final_answer)
                    yield event_iteration_completed(
                        state,
                        (time.monotonic() - iter_start_mono) * 1000.0,
                        0,
                        False,
                        "final_answer",
                        [],
                    )
                    break

                is_stagnant, current_sig, repetition_count = self.check_stagnation_state(
                    state, response.tool_calls, previous_sig, repetition_count, iter_start_mono
                )
                if is_stagnant:
                    yield event_repetition_detected(state, len(response.tool_calls))
                    yield event_iteration_completed(
                        state,
                        (time.monotonic() - iter_start_mono) * 1000.0,
                        len(response.tool_calls),
                        False,
                        "stagnation_stopped",
                        [tc.name for tc in response.tool_calls],
                    )
                    break

                previous_sig = current_sig
                self.append_assistant_tool_calls(state, response.content, response.tool_calls)

                for tc in response.tool_calls:
                    current_tools.append(tc.name)
                    is_mutative = self.idempotency.is_mutative(tc.name)
                    yield event_tool_proposed(state, tc, is_mutative)

                    validated_args, is_valid, val_err = validate_tool_arguments_safe(tc)
                    yield event_arguments_validated(
                        state, tc, is_valid, validated_args, val_err
                    )

                    policy, _ = self.idempotency.check_mutation_policy(
                        state.execution_id, tc.name, tc.arguments
                    )
                    yield event_tool_execution_started(state, tc, is_mutative, policy)

                    execution_result, idempotency_hit, tool_duration = await execute_tool_async(
                        execution_id=state.execution_id,
                        operator_username=state.operator_username,
                        tool_call=tc,
                        session_factory=self.session_factory,
                        session=self.session,
                        idempotency=self.idempotency,
                        remaining_global_seconds=state.remaining_global_seconds(),
                        tool_timeout_seconds=state.tool_timeout_seconds,
                        is_valid=is_valid,
                        validation_error_msg=val_err,
                    )
                    self.process_tool_result(
                        state, tc, validated_args, execution_result, idempotency_hit, tool_duration
                    )

                    yield event_tool_execution_completed(
                        state,
                        tc,
                        execution_result.get("status"),
                        tool_duration,
                        is_mutative,
                        idempotency_hit,
                        execution_result,
                    )
                    yield event_observation_appended(state, tc, execution_result)

                iter_duration = self.finalize_iteration(
                    state,
                    iter_start_mono,
                    len(response.tool_calls),
                    True,
                    "continue_next_iteration",
                    current_tools,
                )
                yield event_iteration_completed(
                    state,
                    iter_duration,
                    len(response.tool_calls),
                    True,
                    "continue_next_iteration",
                    current_tools,
                )

            self.finalize_run(state)

            if state.stop_reason == StopReason.MAX_ITERATIONS_REACHED:
                yield event_loop_limit_exceeded(state)

            if state.status == ExecutionStatus.COMPLETED:
                yield event_run_completed(state)
            elif state.status == ExecutionStatus.FAILED:
                yield event_run_failed(state)

        except GeneratorExit:
            state.status = ExecutionStatus.CANCELLED
            state.stop_reason = StopReason.CLIENT_CANCELLED
            return
        except asyncio.CancelledError:
            state.status = ExecutionStatus.CANCELLED
            state.stop_reason = StopReason.CLIENT_CANCELLED
            yield event_run_cancelled(state)
            raise
