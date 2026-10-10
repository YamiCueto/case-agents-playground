import asyncio
import json
import time
from typing import Any, Dict, List, Optional
import pytest
from fastapi.testclient import TestClient
from src.api.app import app
from src.api.schemas import ChatRequest, StreamEvent
from src.agents.common.contracts import ModelProvider, ModelResponse, ToolCall
from src.agents.v2_agent_loop.agent import AgentLoop, run_agent_v2_stream
from src.agents.v2_agent_loop.mock_provider import MockModelProviderV2
from src.agents.v2_agent_loop.state import ExecutionStatus, StopReason
from src.agents.v2_agent_loop.idempotency import IdempotencyRegistry


@pytest.fixture
def api_client() -> TestClient:
    return TestClient(app)


class CustomControlledDelayProvider(ModelProvider):
    def __init__(self, delay_seconds: float = 0.03) -> None:
        self.delay_seconds = delay_seconds
        self.call_count = 0

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        time.sleep(self.delay_seconds)
        self.call_count += 1
        if self.call_count == 1:
            return ModelResponse(
                content=None,
                tool_calls=[
                    ToolCall(
                        id="call_delayed_01",
                        name="get_ticket_by_id",
                        arguments={"ticket_code": "TICK-1001"},
                    )
                ],
            )
        return ModelResponse(
            content="Ticket TICK-1001 analizado progresivamente.",
            tool_calls=[],
        )


class MultiToolSingleInferenceProvider(ModelProvider):
    def __init__(self) -> None:
        self.called = False

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        if not self.called:
            self.called = True
            return ModelResponse(
                content=None,
                tool_calls=[
                    ToolCall(
                        id="call_multi_1",
                        name="get_ticket_by_id",
                        arguments={"ticket_code": "TICK-1001"},
                    ),
                    ToolCall(
                        id="call_multi_2",
                        name="get_ticket_by_id",
                        arguments={"ticket_code": "TICK-1002"},
                    ),
                ],
            )
        return ModelResponse(
            content="Ambos tickets TICK-1001 y TICK-1002 fueron procesados en paralelo.",
            tool_calls=[],
        )


class ValidationErrorRecoveryProvider(ModelProvider):
    def __init__(self) -> None:
        self.step = 0

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        self.step += 1
        if self.step == 1:
            return ModelResponse(
                content=None,
                tool_calls=[
                    ToolCall(
                        id="call_invalid_args_01",
                        name="get_ticket_by_id",
                        arguments={},
                    )
                ],
            )
        return ModelResponse(
            content="La herramienta rechazó los argumentos por falta de código, operación recuperada.",
            tool_calls=[],
        )


@pytest.mark.anyio
async def test_v2_stream_1_direct_response_without_tools() -> None:
    provider = MockModelProviderV2(simulation_mode="dynamic_support")
    req = ChatRequest(
        agent_version="v2",
        query="Explica el procedimiento conceptual de gestión de incidentes",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(req, provider=provider):
        events.append(evt)

    assert len(events) >= 6
    types = [e.type for e in events]
    assert types[0] == "RUN_STARTED"
    assert "ITERATION_STARTED" in types
    assert "MODEL_INFERENCE_STARTED" in types
    assert "MODEL_INFERENCE_COMPLETED" in types
    assert "FINAL_SYNTHESIS" in types
    assert "ITERATION_COMPLETED" in types
    assert types[-1] == "RUN_COMPLETED"

    assert "TOOL_CALL_PROPOSED" not in types
    assert "TOOL_EXECUTION_STARTED" not in types
    assert "TOOL_EXECUTION_COMPLETED" not in types

    exec_id = events[0].execution_id
    assert exec_id is not None
    assert all(e.execution_id == exec_id for e in events)

    run_completed = events[-1]
    assert run_completed.payload["status"] == "completed"
    assert run_completed.payload["total_iterations"] == 1
    assert run_completed.payload["total_tools_executed"] == 0


@pytest.mark.anyio
async def test_v2_stream_2_single_tool_and_final_synthesis() -> None:
    provider = MockModelProviderV2(simulation_mode="dynamic_support")
    req = ChatRequest(
        agent_version="v2",
        query="Consulta el ticket TICK-1002",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(req, provider=provider):
        events.append(evt)

    types = [e.type for e in events]
    assert "RUN_STARTED" in types
    assert "TOOL_CALL_PROPOSED" in types
    assert "ARGUMENTS_VALIDATED" in types
    assert "TOOL_EXECUTION_STARTED" in types
    assert "TOOL_EXECUTION_COMPLETED" in types
    assert "OBSERVATION_APPENDED" in types
    assert "FINAL_SYNTHESIS" in types
    assert "RUN_COMPLETED" in types

    tool_prop = next(e for e in events if e.type == "TOOL_CALL_PROPOSED")
    assert tool_prop.payload["tool_name"] == "get_ticket_by_id"
    t_id = tool_prop.payload["tool_call_id"]

    arg_val = next(e for e in events if e.type == "ARGUMENTS_VALIDATED")
    assert arg_val.payload["tool_call_id"] == t_id
    assert arg_val.payload["is_valid"] is True

    tool_start = next(e for e in events if e.type == "TOOL_EXECUTION_STARTED")
    assert tool_start.payload["tool_call_id"] == t_id

    tool_comp = next(e for e in events if e.type == "TOOL_EXECUTION_COMPLETED")
    assert tool_comp.payload["tool_call_id"] == t_id
    assert tool_comp.payload["execution_status"] == "success"

    obs = next(e for e in events if e.type == "OBSERVATION_APPENDED")
    assert obs.payload["tool_call_id"] == t_id

    final_event = events[-1]
    assert final_event.type == "RUN_COMPLETED"
    assert final_event.payload["status"] == "completed"
    assert final_event.payload["total_iterations"] == 2
    assert final_event.payload["total_tools_executed"] == 1


@pytest.mark.anyio
async def test_v2_stream_3_two_sequential_tools_causal_chain() -> None:
    provider = MockModelProviderV2(simulation_mode="dynamic_support")
    req = ChatRequest(
        agent_version="v2",
        query="Identifica los tickets vencidos y consulta el detalle del primer ticket",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(req, provider=provider):
        events.append(evt)

    proposals = [e for e in events if e.type == "TOOL_CALL_PROPOSED"]
    assert len(proposals) == 2
    assert proposals[0].payload["tool_name"] == "identify_overdue_tickets"
    assert proposals[0].iteration_index == 1

    assert proposals[1].payload["tool_name"] == "get_ticket_by_id"
    assert proposals[1].iteration_index == 2
    assert "ticket_code" in proposals[1].payload["arguments"]

    synthesis = next(e for e in events if e.type == "FINAL_SYNTHESIS")
    assert synthesis.iteration_index == 3

    run_comp = events[-1]
    assert run_comp.type == "RUN_COMPLETED"
    assert run_comp.payload["total_iterations"] == 3
    assert run_comp.payload["total_tools_executed"] == 2


@pytest.mark.anyio
async def test_v2_stream_4_multiple_tools_in_single_inference() -> None:
    provider = MultiToolSingleInferenceProvider()
    req = ChatRequest(
        agent_version="v2",
        query="Compara los tickets TICK-1001 y TICK-1002",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(req, provider=provider):
        events.append(evt)

    proposals = [e for e in events if e.type == "TOOL_CALL_PROPOSED"]
    assert len(proposals) == 2
    assert [p.payload["tool_call_id"] for p in proposals] == ["call_multi_1", "call_multi_2"]

    validations = [e for e in events if e.type == "ARGUMENTS_VALIDATED"]
    assert len(validations) == 2
    assert [v.payload["tool_call_id"] for v in validations] == ["call_multi_1", "call_multi_2"]

    starts = [e for e in events if e.type == "TOOL_EXECUTION_STARTED"]
    assert len(starts) == 2
    assert [s.payload["tool_call_id"] for s in starts] == ["call_multi_1", "call_multi_2"]

    completions = [e for e in events if e.type == "TOOL_EXECUTION_COMPLETED"]
    assert len(completions) == 2
    assert [c.payload["tool_call_id"] for c in completions] == ["call_multi_1", "call_multi_2"]

    observations = [e for e in events if e.type == "OBSERVATION_APPENDED"]
    assert len(observations) == 2
    assert [o.payload["tool_call_id"] for o in observations] == ["call_multi_1", "call_multi_2"]

    iter_1_completed = next(
        e for e in events if e.type == "ITERATION_COMPLETED" and e.iteration_index == 1
    )
    assert iter_1_completed.payload["tool_calls_count"] == 2


@pytest.mark.anyio
async def test_v2_stream_5_event_ordering_and_correlation() -> None:
    provider = MockModelProviderV2(simulation_mode="dynamic_support")
    req = ChatRequest(
        agent_version="v2",
        query="Consulta el ticket TICK-1002",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(req, provider=provider):
        events.append(evt)

    event_ids = [e.event_id for e in events]
    assert len(event_ids) == len(set(event_ids))

    primary_exec_id = events[0].execution_id
    primary_corr_id = events[0].correlation_id
    assert primary_exec_id.startswith("exec-")
    assert primary_corr_id.startswith("corr-")

    for e in events:
        assert e.agent_version == "v2"
        assert e.execution_id == primary_exec_id
        assert e.correlation_id == primary_corr_id
        assert e.timestamp is not None
        assert e.phase in [
            "init",
            "loop",
            "inference",
            "proposal",
            "validation",
            "execution",
            "observation",
            "synthesis",
            "complete",
        ]

    tool_events = [e for e in events if "tool_call_id" in e.payload]
    unique_tool_ids = set(e.payload["tool_call_id"] for e in tool_events)
    assert len(unique_tool_ids) == 1


@pytest.mark.anyio
async def test_v2_stream_6_validation_error_and_observation() -> None:
    provider = ValidationErrorRecoveryProvider()
    req = ChatRequest(
        agent_version="v2",
        query="Listar tickets con estado erróneo",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(req, provider=provider):
        events.append(evt)

    arg_val = next(e for e in events if e.type == "ARGUMENTS_VALIDATED")
    assert arg_val.payload["is_valid"] is False
    assert arg_val.payload["validation_error"] is not None

    tool_comp = next(e for e in events if e.type == "TOOL_EXECUTION_COMPLETED")
    assert tool_comp.payload["execution_status"] == "error"
    assert tool_comp.payload["result"]["error_type"] == "argumentos_invalidos"

    obs = next(e for e in events if e.type == "OBSERVATION_APPENDED")
    assert obs.payload["observation"]["error_type"] == "argumentos_invalidos"

    synthesis = next(e for e in events if e.type == "FINAL_SYNTHESIS")
    assert synthesis.iteration_index == 2


@pytest.mark.anyio
async def test_v2_stream_7_max_iterations_limit() -> None:
    provider = MockModelProviderV2(force_infinite_tools=True)
    req = ChatRequest(
        agent_version="v2",
        query="Bucle infinito de tickets",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(req, provider=provider, max_iterations=3):
        events.append(evt)

    types = [e.type for e in events]
    assert "LOOP_LIMIT_EXCEEDED" in types
    assert "RUN_FAILED" in types

    limit_evt = next(e for e in events if e.type == "LOOP_LIMIT_EXCEEDED")
    assert limit_evt.payload["max_iterations"] == 3

    failed_evt = events[-1]
    assert failed_evt.type == "RUN_FAILED"
    assert failed_evt.payload["status"] == "failed"
    assert failed_evt.payload["stop_reason"] == "max_iterations_reached"
    assert failed_evt.payload["total_iterations"] == 3


@pytest.mark.anyio
async def test_v2_stream_8_timeout_and_controlled_finalization() -> None:
    provider = MockModelProviderV2(simulate_hanging_inference_seconds=0.25)
    req = ChatRequest(
        agent_version="v2",
        query="Operación lenta con timeout",
        user_persona="usr_carlos",
    )

    events: List[StreamEvent] = []
    async for evt in run_agent_v2_stream(
        req,
        provider=provider,
        inference_timeout_seconds=0.05,
    ):
        events.append(evt)

    types = [e.type for e in events]
    assert "LOOP_TIMEOUT_EXCEEDED" in types
    assert "RUN_FAILED" in types

    failed_evt = events[-1]
    assert failed_evt.type == "RUN_FAILED"
    assert failed_evt.payload["stop_reason"] == "inference_timeout"


@pytest.mark.anyio
async def test_v2_stream_9_client_disconnection() -> None:
    provider = CustomControlledDelayProvider(delay_seconds=0.1)
    req = ChatRequest(
        agent_version="v2",
        query="Consulta interrumpida por cliente",
        user_persona="usr_carlos",
    )

    received_before_cancel: List[StreamEvent] = []
    stream_gen = run_agent_v2_stream(req, provider=provider)

    async def consume_limited() -> None:
        async for evt in stream_gen:
            received_before_cancel.append(evt)
            if evt.type == "ITERATION_STARTED":
                break

    await consume_limited()
    assert len(received_before_cancel) >= 2

    await stream_gen.aclose()


@pytest.mark.anyio
async def test_v2_stream_10_agent_v1_regression(api_client: TestClient) -> None:
    payload = {
        "agent_version": "v1",
        "query": "Consulta el ticket TICK-1001",
        "user_persona": "usr_carlos",
    }
    response = api_client.post("/api/chat/stream", json=payload)
    assert response.status_code == 200

    raw_events: List[Dict[str, Any]] = []
    for line in response.text.split("\n"):
        if line.startswith("data: "):
            content = line[6:].strip()
            if content:
                raw_events.append(json.loads(content))

    assert len(raw_events) >= 8

    hops = [e.get("hop_number") for e in raw_events if e.get("hop_number") is not None]
    assert hops == [1, 2, 3, 4, 5, 6, 7]

    types = [e["type"] for e in raw_events]
    assert types[0] == "USER_REQUEST"
    assert types[1] == "MODEL_INFERENCE_1"
    assert types[2] == "TOOL_PROPOSAL"
    assert types[3] == "ARGUMENT_VALIDATION"
    assert types[4] == "CPU_TOOL_EXECUTION"
    assert types[5] == "TOOL_RESULT_INJECTION"
    assert types[6] == "FINAL_SYNTHESIS"
    assert types[7] == "RUN_COMPLETED"

    assert all(e["agent_version"] == "v1" for e in raw_events)


@pytest.mark.anyio
async def test_v2_stream_incremental_delivery_with_controlled_delays() -> None:
    provider = CustomControlledDelayProvider(delay_seconds=0.04)
    req = ChatRequest(
        agent_version="v2",
        query="Consulta el ticket TICK-1001",
        user_persona="usr_carlos",
    )

    arrival_times: List[float] = []
    events: List[StreamEvent] = []

    t_start = time.monotonic()
    async for evt in run_agent_v2_stream(req, provider=provider):
        arrival_times.append(time.monotonic() - t_start)
        events.append(evt)

    assert len(events) >= 7
    total_elapsed = arrival_times[-1] - arrival_times[0]
    assert total_elapsed >= 0.06

    for i in range(1, len(arrival_times)):
        assert arrival_times[i] >= arrival_times[i - 1]
