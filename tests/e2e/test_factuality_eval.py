import pytest
from sqlalchemy.orm import Session
from src.agents.common.providers import OpenAICompatibleProvider
from src.agents.v1_tool_calling.agent import run_agent_v1
from src.infrastructure.database.connection import get_app_session_factory
from tests.unit.test_response_groundedness import (
    evaluate_communicative_quality,
    evaluate_response_faithfulness,
)


@pytest.fixture
def db_session() -> Session:
    factory = get_app_session_factory()
    session = factory()
    yield session
    session.close()


@pytest.fixture
def real_provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider()


def test_qwen_factuality_ticket_status(db_session: Session, real_provider: OpenAICompatibleProvider) -> None:
    response = run_agent_v1(
        user_query="Cuál es el estado exacto del ticket TICK-1001?",
        provider=real_provider,
        session=db_session,
        operator_username="usr_carlos",
    )
    observed_data = {
        "code": "TICK-1001",
        "status": "OPEN",
        "priority": "HIGH",
        "comments": [],
    }
    violations = evaluate_response_faithfulness(response, observed_data)
    assert len(violations) == 0, f"Violaciones de veracidad detectadas: {violations}"
    assert "OPEN" in response.upper()


def test_qwen_communicative_quality_and_factuality_status_query(
    db_session: Session,
    real_provider: OpenAICompatibleProvider,
) -> None:
    response = run_agent_v1(
        user_query="Consulta el ticket TICK-1001 y dime su estado",
        provider=real_provider,
        session=db_session,
        operator_username="usr_carlos",
    )
    assert response.strip() != "OPEN", "La respuesta no debe ser el monosílabo 'OPEN'"
    comm_violations = evaluate_communicative_quality(response, "TICK-1001", "OPEN")
    assert len(comm_violations) == 0, f"Violaciones de calidad comunicativa: {comm_violations}"
    observed_data = {
        "code": "TICK-1001",
        "status": "OPEN",
        "priority": "HIGH",
        "comments": [],
    }
    fact_violations = evaluate_response_faithfulness(response, observed_data)
    assert len(fact_violations) == 0, f"Violaciones de veracidad: {fact_violations}"


def test_qwen_factuality_overdue_list(db_session: Session, real_provider: OpenAICompatibleProvider) -> None:
    response = run_agent_v1(
        user_query="Identifica qué tickets tienen SLA vencido actualmente.",
        provider=real_provider,
        session=db_session,
        operator_username="supervisor_juan",
    )
    assert "TICK-1003" in response
    assert "TICK-1001" not in response

