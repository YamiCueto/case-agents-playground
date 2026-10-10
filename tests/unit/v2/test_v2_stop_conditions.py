import pytest
from sqlalchemy.orm import Session
from src.agents.v2_agent_loop.agent import AgentLoop
from src.agents.v2_agent_loop.mock_provider import MockModelProviderV2
from src.agents.v2_agent_loop.state import ExecutionStatus, StopReason


def test_agent_v2_max_iterations_hard_stop(db_session: Session) -> None:
    provider = MockModelProviderV2(force_infinite_tools=True)
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(
        query="Prueba límite operacional",
        max_iterations=2,
    )

    assert state.status == ExecutionStatus.FAILED
    assert state.stop_reason == StopReason.MAX_ITERATIONS_REACHED
    assert state.iteration_index == 2
    assert len(state.executed_tools) == 2
    assert "Límite operacional" in (state.error_message or "")


def test_agent_v2_stagnation_repetitive_call_detected(db_session: Session) -> None:
    provider = MockModelProviderV2(force_repetitive_calls=True)
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(
        query="Prueba detección de ciclo repetitivo",
        max_iterations=5,
    )

    assert state.status == ExecutionStatus.FAILED
    assert state.stop_reason == StopReason.REPETITIVE_TOOL_CALL
    assert state.iteration_index == 2
    assert "Estancamiento" in (state.error_message or "")
