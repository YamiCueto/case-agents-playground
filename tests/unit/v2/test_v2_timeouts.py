import time
import pytest
from sqlalchemy.orm import Session
from src.agents.v2_agent_loop.agent import AgentLoop
from src.agents.v2_agent_loop.mock_provider import MockModelProviderV2
from src.agents.v2_agent_loop.state import ExecutionStatus, StopReason


def test_agent_v2_global_timeout_stops_execution(db_session: Session) -> None:
    provider = MockModelProviderV2(force_infinite_tools=True)
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(
        query="Prueba timeout global",
        max_iterations=10,
        global_timeout_seconds=0.0001,
    )

    assert state.status == ExecutionStatus.FAILED
    assert state.stop_reason == StopReason.GLOBAL_TIMEOUT
    assert "Tiempo global" in (state.error_message or "")


def test_agent_v2_monotonic_time_tracking(db_session: Session) -> None:
    provider = MockModelProviderV2()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(query="Consulta el ticket TICK-1001 y dime su estado")

    assert state.total_duration_ms > 0.0
    for iter_rec in state.iterations:
        assert iter_rec.duration_ms >= 0.0
    for tool_rec in state.executed_tools:
        assert tool_rec.duration_ms >= 0.0


def test_agent_v2_uncooperative_task_does_not_block_runtime_on_timeout(db_session: Session) -> None:
    provider = MockModelProviderV2(simulate_hanging_inference_seconds=1.5)
    loop = AgentLoop(provider=provider, session=db_session)

    start_mono = time.monotonic()
    state = loop.run(
        query="Consulta el ticket TICK-1001",
        inference_timeout_seconds=0.05,
    )
    elapsed = time.monotonic() - start_mono

    assert state.status == ExecutionStatus.FAILED
    assert state.stop_reason == StopReason.INFERENCE_TIMEOUT
    assert elapsed < 0.6
