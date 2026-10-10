import json
import time
from typing import Any, Callable, Dict, List, Optional
import pytest
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelProvider, ModelResponse, ToolCall
from src.agents.v2_agent_loop.agent import AgentLoop
from src.agents.v2_agent_loop.mock_provider import MockModelProviderV2
from src.agents.v2_agent_loop.state import ExecutionStatus, StopReason
from src.infrastructure.database.connection import get_app_session_factory


@pytest.fixture
def db_session() -> Session:
    factory = get_app_session_factory()
    session = factory()
    yield session
    session.close()


class MultiToolParityProvider(ModelProvider):
    def __init__(self) -> None:
        self.turn = 0

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        self.turn += 1
        if self.turn == 1:
            return ModelResponse(
                content=None,
                tool_calls=[
                    ToolCall(
                        id="call_p1",
                        name="get_ticket_by_id",
                        arguments={"ticket_code": "TICK-1001"},
                    ),
                    ToolCall(
                        id="call_p2",
                        name="get_ticket_by_id",
                        arguments={"ticket_code": "TICK-1002"},
                    ),
                ],
            )
        return ModelResponse(
            content="Ambos tickets fueron validados con paridad estricta.",
            tool_calls=[],
        )


class ValidationParityProvider(ModelProvider):
    def __init__(self) -> None:
        self.turn = 0

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        self.turn += 1
        if self.turn == 1:
            return ModelResponse(
                content=None,
                tool_calls=[
                    ToolCall(
                        id="call_invalid_p",
                        name="get_ticket_by_id",
                        arguments={},
                    )
                ],
            )
        return ModelResponse(
            content="Error de validación observado y recuperado en ambos caminos.",
            tool_calls=[],
        )


SCENARIOS = [
    (
        "direct_response",
        lambda: MockModelProviderV2(),
        "¿Cuál es el procedimiento general para priorizar un incidente?",
        {"max_iterations": 5},
    ),
    (
        "single_tool",
        lambda: MockModelProviderV2(),
        "Consulta el ticket TICK-1001 y dime su estado",
        {"max_iterations": 5},
    ),
    (
        "multiple_tools",
        lambda: MultiToolParityProvider(),
        "Consulta TICK-1001 y TICK-1002 en paralelo",
        {"max_iterations": 5},
    ),
    (
        "causal_dependency",
        lambda: MockModelProviderV2(),
        "Revisa los tickets vencidos y consulta el detalle del primer ticket vencido",
        {"max_iterations": 5},
    ),
    (
        "validation_error",
        lambda: ValidationParityProvider(),
        "Llama a herramienta con argumentos inválidos",
        {"max_iterations": 5},
    ),
    (
        "stagnation",
        lambda: MockModelProviderV2(force_repetitive_calls=True),
        "Genera ciclo repetitivo de list_tickets",
        {"max_iterations": 5},
    ),
    (
        "max_iterations",
        lambda: MockModelProviderV2(force_infinite_tools=True),
        "Iteraciones infinitas",
        {"max_iterations": 2},
    ),
    (
        "timeout",
        lambda: MockModelProviderV2(simulate_hanging_inference_seconds=0.25),
        "Operación lenta con timeout",
        {"max_iterations": 5, "inference_timeout_seconds": 0.05},
    ),
]


@pytest.mark.anyio
@pytest.mark.parametrize("scenario_name,provider_factory,query,kwargs", SCENARIOS)
async def test_v2_parity_sync_vs_stream(
    db_session: Session,
    scenario_name: str,
    provider_factory: Callable[[], ModelProvider],
    query: str,
    kwargs: Dict[str, Any],
) -> None:
    provider_sync = provider_factory()
    loop_sync = AgentLoop(provider=provider_sync, session=db_session)
    state_sync = loop_sync.run(query=query, **kwargs)

    provider_stream = provider_factory()
    loop_stream = AgentLoop(provider=provider_stream, session=db_session)
    events = []
    async for evt in loop_stream.run_stream(query=query, **kwargs):
        events.append(evt)

    state_stream = loop_stream.last_state
    assert state_stream is not None

    assert state_sync.status == state_stream.status
    assert state_sync.stop_reason == state_stream.stop_reason
    assert state_sync.iteration_index == state_stream.iteration_index

    assert len(state_sync.executed_tools) == len(state_stream.executed_tools)
    for i in range(len(state_sync.executed_tools)):
        tool_sync = state_sync.executed_tools[i]
        tool_stream = state_stream.executed_tools[i]
        assert tool_sync.tool_name == tool_stream.tool_name
        assert tool_sync.arguments == tool_stream.arguments
        assert tool_sync.result.get("status") == tool_stream.result.get("status")
        assert tool_sync.is_mutative == tool_stream.is_mutative
        assert tool_sync.idempotency_hit == tool_stream.idempotency_hit

    assert len(state_sync.messages) == len(state_stream.messages)
    for j in range(len(state_sync.messages)):
        msg_sync = state_sync.messages[j]
        msg_stream = state_stream.messages[j]
        assert msg_sync["role"] == msg_stream["role"]
        if "name" in msg_sync:
            assert msg_sync["name"] == msg_stream.get("name")

    assert len(state_sync.iterations) == len(state_stream.iterations)
    for k in range(len(state_sync.iterations)):
        iter_sync = state_sync.iterations[k]
        iter_stream = state_stream.iterations[k]
        assert iter_sync.decision == iter_stream.decision
        assert iter_sync.tool_calls_count == iter_stream.tool_calls_count
        assert iter_sync.had_observation == iter_stream.had_observation
        assert iter_sync.tools_invoked == iter_stream.tools_invoked

    event_types = [e.type for e in events]
    assert "RUN_STARTED" in event_types

    if state_sync.status == ExecutionStatus.COMPLETED:
        assert "RUN_COMPLETED" in event_types
        completed_evt = next(e for e in events if e.type == "RUN_COMPLETED")
        assert completed_evt.payload["status"] == "completed"
        assert completed_evt.payload["total_iterations"] == state_sync.iteration_index
    elif state_sync.status == ExecutionStatus.FAILED:
        assert "RUN_FAILED" in event_types
        failed_evt = next(e for e in events if e.type == "RUN_FAILED")
        assert failed_evt.payload["status"] == "failed"
        assert failed_evt.payload["stop_reason"] == state_sync.stop_reason.value
