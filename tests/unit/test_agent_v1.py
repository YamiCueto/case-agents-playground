import pytest
from unittest.mock import MagicMock
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelResponse, ToolCall
from src.agents.common.providers import MockModelProvider
from src.agents.tools.ticket_tools import (
    validate_tool_arguments,
    execute_tool_call,
    TOOLS_SCHEMAS,
)
from src.agents.v1_tool_calling.agent import run_agent_v1, run_agent_v1_stream
from src.infrastructure.database.connection import get_app_session_factory
from src.api.schemas import ChatRequest


@pytest.fixture
def db_session() -> Session:
    factory = get_app_session_factory()
    session = factory()
    yield session
    session.close()


def test_validate_tool_arguments_valid() -> None:
    args = {"ticket_code": "TICK-1001"}
    validated = validate_tool_arguments("get_ticket_by_id", args)
    assert validated["ticket_code"] == "TICK-1001"


def test_validate_tool_arguments_invalid() -> None:
    with pytest.raises(Exception):
        validate_tool_arguments("get_ticket_by_id", {})


def test_execute_tool_call_not_found(db_session: Session) -> None:
    tool_call = ToolCall(
        id="call_mock_404",
        name="get_ticket_by_id",
        arguments={"ticket_code": "TICK-9999"},
    )
    result = execute_tool_call(tool_call, db_session, "usr_carlos")
    assert result["status"] == "error"
    assert result["error_type"] == "entidad_no_encontrada"


def test_execute_tool_call_success(db_session: Session) -> None:
    tool_call = ToolCall(
        id="call_mock_200",
        name="get_ticket_by_id",
        arguments={"ticket_code": "TICK-1001"},
    )
    result = execute_tool_call(tool_call, db_session, "usr_carlos")
    assert result["status"] == "success"
    assert result["data"]["code"] == "TICK-1001"


def test_run_agent_v1_caso_a_mock(db_session: Session) -> None:
    rules = {
        "tick-1001": {
            "id": "call_1",
            "name": "get_ticket_by_id",
            "arguments": {"ticket_code": "TICK-1001"},
        }
    }
    provider = MockModelProvider(rules)
    response = run_agent_v1("Consulta el ticket TICK-1001", provider, db_session, "usr_carlos")
    assert "get_ticket_by_id" in response
    assert "TICK-1001" in response


def test_run_agent_v1_caso_b_mock(db_session: Session) -> None:
    rules = {
        "vencidos": {
            "id": "call_2",
            "name": "identify_overdue_tickets",
            "arguments": {},
        }
    }
    provider = MockModelProvider(rules)
    response = run_agent_v1("Muestra los tickets vencidos", provider, db_session, "supervisor_juan")
    assert "identify_overdue_tickets" in response


def test_run_agent_v1_caso_c_conceptual_no_tools(db_session: Session) -> None:
    provider = MockModelProvider()
    response = run_agent_v1("Que es una politica de soporte tecnico?", provider, db_session, "usr_carlos")
    assert "no se requiere invocar herramientas externas" in response


def test_run_agent_v1_stream_with_mock() -> None:
    import asyncio

    async def _runner() -> None:
        rules = {
            "tick-1001": {
                "id": "call_stream_1",
                "name": "get_ticket_by_id",
                "arguments": {"ticket_code": "TICK-1001"},
            }
        }
        provider = MockModelProvider(rules)
        request = ChatRequest(
            agent_version="v1",
            query="Consulta el ticket TICK-1001",
            user_persona="usr_carlos",
        )

        events = []
        async for evt in run_agent_v1_stream(request, provider=provider):
            events.append(evt)

        hop_numbers = [e.hop_number for e in events if e.hop_number is not None]
        assert 1 in hop_numbers
        assert 2 in hop_numbers
        assert 3 in hop_numbers
        assert 4 in hop_numbers
        assert 5 in hop_numbers
        assert 6 in hop_numbers
        assert 7 in hop_numbers
        assert any(e.type == "RUN_COMPLETED" for e in events)

    asyncio.run(_runner())


def test_run_agent_v1_stream_direct_conceptual() -> None:
    import asyncio

    async def _runner() -> None:
        provider = MockModelProvider()
        request = ChatRequest(
            agent_version="v1",
            query="Explica la metodologia de gestion de incidentes",
            user_persona="usr_carlos",
        )

        events = []
        async for evt in run_agent_v1_stream(request, provider=provider):
            events.append(evt)

        event_types = [e.type for e in events]
        assert "USER_REQUEST" in event_types
        assert "DIRECT_ANSWER" in event_types
        assert "FINAL_SYNTHESIS" in event_types
        assert "RUN_COMPLETED" in event_types
        assert "CPU_TOOL_EXECUTION" not in event_types

    asyncio.run(_runner())
