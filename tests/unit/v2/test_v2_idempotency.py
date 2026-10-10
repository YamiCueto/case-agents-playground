import time
import pytest
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelResponse, ToolCall
from src.agents.v2_agent_loop.agent import AgentLoop
from src.agents.v2_agent_loop.idempotency import IdempotencyRegistry
from src.agents.v2_agent_loop.state import ExecutionStatus


def test_agent_v2_idempotency_prevents_duplicate_mutations(db_session: Session) -> None:
    class DuplicateCreationMock:
        def __init__(self) -> None:
            self.turn = 0

        def generate(self, messages, tools, timeout=None):
            self.turn += 1
            if self.turn <= 2:
                call = ToolCall(
                    id=f"call_create_{self.turn}",
                    name="create_ticket",
                    arguments={
                        "title": "Incidente Idempotente Test",
                        "description": "Fallo transaccional para verificar duplicación",
                        "priority": "HIGH",
                        "category_code": "SOFTWARE",
                    },
                )
                return ModelResponse(content=None, tool_calls=[call])
            return ModelResponse(content="Ticket creado una sola vez.", tool_calls=[])

    provider = DuplicateCreationMock()
    idempotency = IdempotencyRegistry()
    loop = AgentLoop(
        provider=provider,
        session=db_session,
        idempotency_registry=idempotency,
    )

    state = loop.run(query="Crea un ticket de alta prioridad para fallo transaccional")

    assert state.status == ExecutionStatus.COMPLETED
    assert len(state.executed_tools) == 2

    call_1 = state.executed_tools[0]
    assert call_1.tool_name == "create_ticket"
    assert call_1.result["status"] == "success"
    assert call_1.idempotency_hit is False
    created_code = call_1.result["data"]["code"]

    call_2 = state.executed_tools[1]
    assert call_2.tool_name == "create_ticket"
    assert call_2.result["status"] == "success"
    assert call_2.idempotency_hit is True
    assert call_2.result["data"]["code"] == created_code


def test_agent_v2_mutative_uncertain_timeout_blocks_retry(monkeypatch, db_session: Session) -> None:
    class HangingMutationProvider:
        def __init__(self) -> None:
            self.turn = 0

        def generate(self, messages, tools, timeout=None):
            self.turn += 1
            call = ToolCall(
                id=f"call_create_uncertain_{self.turn}",
                name="create_ticket",
                arguments={
                    "title": "Incidente Timeout Incierto",
                    "description": "Falla de red durante commit",
                    "priority": "HIGH",
                    "category_code": "NETWORK",
                },
            )
            return ModelResponse(content=None, tool_calls=[call])

    def slow_mutative_tool(tc, session, operator_username):
        time.sleep(0.5)
        return {"status": "success", "data": {"code": "TICK-SHOULD-NOT-REACH"}}

    monkeypatch.setattr(
        "src.agents.v2_agent_loop.agent.execute_tool_call",
        slow_mutative_tool,
    )

    provider = HangingMutationProvider()
    idempotency = IdempotencyRegistry()
    loop = AgentLoop(
        provider=provider,
        session=db_session,
        idempotency_registry=idempotency,
    )

    state = loop.run(
        query="Crea un ticket para incidente WAN",
        tool_timeout_seconds=0.01,
        max_iterations=2,
    )

    assert len(state.executed_tools) == 2
    first_exec = state.executed_tools[0]
    assert first_exec.result["status"] == "error"
    assert first_exec.result["error_type"] == "timeout"

    second_exec = state.executed_tools[1]
    assert second_exec.result["status"] == "error"
    assert second_exec.result["error_type"] == "mutacion_estado_incierto"
    assert "bloqueada por política de seguridad" in second_exec.result["message"]
