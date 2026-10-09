import pytest
import asyncio
from sqlalchemy.orm import Session
from src.agents.common.providers import OpenAICompatibleProvider
from src.agents.v1_tool_calling.agent import run_agent_v1, run_agent_v1_stream
from src.infrastructure.database.connection import get_app_session_factory
from src.api.schemas import ChatRequest


@pytest.fixture
def db_session() -> Session:
    factory = get_app_session_factory()
    session = factory()
    yield session
    session.close()


@pytest.fixture
def real_provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider()


def test_qwen_tool_call_caso_a(db_session: Session, real_provider: OpenAICompatibleProvider) -> None:
    response = run_agent_v1(
        user_query="Consulta el ticket TICK-1001 y dime su estado",
        provider=real_provider,
        session=db_session,
        operator_username="usr_carlos",
    )
    assert "TICK-1001" in response
    assert "OPEN" in response.upper()


def test_qwen_tool_call_caso_b_overdue(db_session: Session, real_provider: OpenAICompatibleProvider) -> None:
    response = run_agent_v1(
        user_query="Cuáles tickets tienen el SLA vencido?",
        provider=real_provider,
        session=db_session,
        operator_username="supervisor_juan",
    )
    assert "TICK-1003" in response


def test_qwen_caso_c_conceptual(db_session: Session, real_provider: OpenAICompatibleProvider) -> None:
    response = run_agent_v1(
        user_query="Qué recomendaciones generales existen para priorizar incidentes técnicos?",
        provider=real_provider,
        session=db_session,
        operator_username="usr_carlos",
    )
    assert len(response) > 50


def test_qwen_stream_all_hops(real_provider: OpenAICompatibleProvider) -> None:
    async def _runner() -> None:
        request = ChatRequest(
            agent_version="v1",
            query="Consulta el ticket TICK-1002",
            user_persona="usr_carlos",
        )
        events = []
        async for evt in run_agent_v1_stream(request, provider=real_provider):
            events.append(evt)

        hop_numbers = [e.hop_number for e in events if e.hop_number is not None]
        assert 1 in hop_numbers
        assert 2 in hop_numbers
        assert 3 in hop_numbers
        assert 4 in hop_numbers
        assert 5 in hop_numbers
        assert 6 in hop_numbers
        assert 7 in hop_numbers

        tool_proposal_events = [e for e in events if e.type == "TOOL_PROPOSAL"]
        assert len(tool_proposal_events) == 1
        assert tool_proposal_events[0].payload["tool_name"] == "get_ticket_by_id"

        execution_events = [e for e in events if e.type == "CPU_TOOL_EXECUTION"]
        assert len(execution_events) == 1
        assert execution_events[0].payload["database"] == "MySQL"

    asyncio.run(_runner())
