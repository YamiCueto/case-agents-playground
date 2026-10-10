import json
import pytest
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelResponse, ToolCall
from src.agents.v2_agent_loop.agent import AgentLoop
from src.agents.v2_agent_loop.state import ExecutionStatus, StopReason


def test_agent_v2_multiple_tools_in_single_inference(db_session: Session) -> None:
    class MultiToolMockProvider:
        def __init__(self) -> None:
            self.turn = 0

        def generate(self, messages, tools, timeout=None):
            self.turn += 1
            if self.turn == 1:
                call1 = ToolCall(
                    id="call_multi_1",
                    name="get_ticket_by_id",
                    arguments={"ticket_code": "TICK-1001"},
                )
                call2 = ToolCall(
                    id="call_multi_2",
                    name="get_ticket_by_id",
                    arguments={"ticket_code": "TICK-1002"},
                )
                return ModelResponse(content=None, tool_calls=[call1, call2])
            return ModelResponse(content="Ambos tickets verificados.", tool_calls=[])

    provider = MultiToolMockProvider()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(query="Consulta TICK-1001 y TICK-1002 simultáneamente")

    assert state.status == ExecutionStatus.COMPLETED
    assert state.stop_reason == StopReason.FINAL_ANSWER
    assert state.iteration_index == 2
    assert len(state.executed_tools) == 2

    assert state.executed_tools[0].tool_call_id == "call_multi_1"
    assert state.executed_tools[0].result["data"]["code"] == "TICK-1001"
    assert state.executed_tools[1].tool_call_id == "call_multi_2"
    assert state.executed_tools[1].result["data"]["code"] == "TICK-1002"

    assistant_msgs = [m for m in state.messages if m.get("role") == "assistant" and m.get("tool_calls")]
    assert len(assistant_msgs) == 1
    assert len(assistant_msgs[0]["tool_calls"]) == 2

    tool_msgs = [m for m in state.messages if m.get("role") == "tool"]
    assert len(tool_msgs) == 2
    assert tool_msgs[0]["tool_call_id"] == "call_multi_1"
    assert tool_msgs[1]["tool_call_id"] == "call_multi_2"


def test_agent_v2_empty_observation_handled_controlled(db_session: Session) -> None:
    class EmptyOverdueProvider:
        def __init__(self) -> None:
            self.turn = 0

        def generate(self, messages, tools, timeout=None):
            self.turn += 1
            tool_msgs = [m for m in messages if m.get("role") == "tool"]
            if len(tool_msgs) == 0:
                return ModelResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(
                            id="call_list_empty",
                            name="list_tickets",
                            arguments={"status": "CLOSED", "priority": "CRITICAL"},
                        )
                    ],
                )
            first_obs = json.loads(tool_msgs[0]["content"])
            data = first_obs.get("data", [])
            if len(data) == 0:
                return ModelResponse(
                    content="Se verificó el catálogo y no existen tickets cerrados con prioridad crítica.",
                    tool_calls=[],
                )
            return ModelResponse(content="Tickets encontrados.", tool_calls=[])

    provider = EmptyOverdueProvider()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(query="Consulta tickets cerrados de prioridad crítica")

    assert state.status == ExecutionStatus.COMPLETED
    assert state.stop_reason == StopReason.FINAL_ANSWER
    assert state.iteration_index == 2
    assert "no existen tickets" in state.final_answer.lower()
    assert "TICK-1001" not in state.final_answer


def test_agent_v2_tool_error_propagates_into_observation(db_session: Session) -> None:
    class NonExistentTicketProvider:
        def __init__(self) -> None:
            self.turn = 0

        def generate(self, messages, tools, timeout=None):
            self.turn += 1
            tool_msgs = [m for m in messages if m.get("role") == "tool"]
            if len(tool_msgs) == 0:
                return ModelResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(
                            id="call_not_found",
                            name="get_ticket_by_id",
                            arguments={"ticket_code": "TICK-999999"},
                        )
                    ],
                )
            return ModelResponse(
                content="El ticket solicitado no fue encontrado en la base de datos.",
                tool_calls=[],
            )

    provider = NonExistentTicketProvider()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(query="Consulta el ticket TICK-999999")

    assert state.status == ExecutionStatus.COMPLETED
    assert len(state.executed_tools) == 1
    tool_rec = state.executed_tools[0]
    assert tool_rec.result["status"] == "error"
    assert tool_rec.result["error_type"] == "entidad_no_encontrada"

    tool_msgs = [m for m in state.messages if m.get("role") == "tool"]
    assert len(tool_msgs) == 1
    assert tool_msgs[0]["tool_call_id"] == "call_not_found"
    assert "entidad_no_encontrada" in tool_msgs[0]["content"]


def test_agent_v2_multiple_tools_strict_bijective_correspondence(db_session: Session) -> None:
    class TripleToolProvider:
        def __init__(self) -> None:
            self.turn = 0

        def generate(self, messages, tools, timeout=None):
            self.turn += 1
            if self.turn == 1:
                return ModelResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(id="call_t1", name="get_ticket_by_id", arguments={"ticket_code": "TICK-1001"}),
                        ToolCall(id="call_t2", name="get_ticket_by_id", arguments={"ticket_code": "TICK-1002"}),
                        ToolCall(id="call_t3", name="get_ticket_by_id", arguments={"ticket_code": "TICK-1003"}),
                    ],
                )
            return ModelResponse(content="Los tres tickets fueron inspeccionados con éxito.", tool_calls=[])

    provider = TripleToolProvider()
    loop = AgentLoop(provider=provider, session=db_session)
    state = loop.run(query="Consulta TICK-1001, TICK-1002 y TICK-1003 simultáneamente")

    assert state.status == ExecutionStatus.COMPLETED
    assert len(state.executed_tools) == 3

    tool_msgs = [m for m in state.messages if m.get("role") == "tool"]
    assert len(tool_msgs) == 3

    expected_ids = ["call_t1", "call_t2", "call_t3"]
    for idx, expected_id in enumerate(expected_ids):
        assert tool_msgs[idx]["tool_call_id"] == expected_id
        assert state.executed_tools[idx].tool_call_id == expected_id
