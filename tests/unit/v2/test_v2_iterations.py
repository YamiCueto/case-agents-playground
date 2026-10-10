import pytest
from sqlalchemy.orm import Session
from src.agents.v2_agent_loop.agent import AgentLoop, run_agent_v2
from src.agents.v2_agent_loop.mock_provider import MockModelProviderV2
from src.agents.v2_agent_loop.state import ExecutionStatus, StopReason


def test_agent_v2_direct_answer_stops_iteration_1(db_session: Session) -> None:
    provider = MockModelProviderV2()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(
        query="¿Cuál es el procedimiento general para priorizar un incidente?",
        operator_username="usr_carlos",
    )

    assert state.status == ExecutionStatus.COMPLETED
    assert state.stop_reason == StopReason.FINAL_ANSWER
    assert state.iteration_index == 1
    assert len(state.executed_tools) == 0
    assert len(state.iterations) == 1
    assert state.final_answer is not None
    assert "conceptual" in state.final_answer.lower()


def test_agent_v2_single_tool_loop_completes_in_2_iterations(db_session: Session) -> None:
    provider = MockModelProviderV2()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(
        query="Consulta el ticket TICK-1001 y dime su estado",
        operator_username="usr_carlos",
    )

    assert state.status == ExecutionStatus.COMPLETED
    assert state.stop_reason == StopReason.FINAL_ANSWER
    assert state.iteration_index == 2
    assert len(state.executed_tools) == 1
    assert state.executed_tools[0].tool_name == "get_ticket_by_id"
    assert state.executed_tools[0].result["status"] == "success"
    assert state.executed_tools[0].result["data"]["code"] == "TICK-1001"
    assert len(state.iterations) == 2
    assert state.final_answer is not None
    assert "TICK-1001" in state.final_answer


def test_agent_v2_multi_step_dependent_causal_chain(db_session: Session) -> None:
    provider = MockModelProviderV2()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(
        query="Revisa los tickets vencidos y consulta el detalle del primer ticket vencido para explicarme la causa",
        operator_username="usr_carlos",
    )

    assert state.status == ExecutionStatus.COMPLETED
    assert state.stop_reason == StopReason.FINAL_ANSWER
    assert state.iteration_index == 3
    assert len(state.executed_tools) == 2

    tool1 = state.executed_tools[0]
    assert tool1.tool_name == "identify_overdue_tickets"
    assert tool1.result["status"] == "success"
    overdue_list = tool1.result["data"]
    assert len(overdue_list) > 0
    expected_first_code = overdue_list[0]["code"]

    tool2 = state.executed_tools[1]
    assert tool2.tool_name == "get_ticket_by_id"
    assert tool2.arguments["ticket_code"] == expected_first_code
    assert tool2.result["status"] == "success"
    assert tool2.result["data"]["code"] == expected_first_code

    assert len(state.iterations) == 3
    assert state.final_answer is not None
    assert expected_first_code in state.final_answer


def test_run_agent_v2_convenience_function() -> None:
    provider = MockModelProviderV2()
    answer = run_agent_v2(
        user_query="¿Qué es un SLA?",
        provider=provider,
    )
    assert isinstance(answer, str)
    assert len(answer) > 10
