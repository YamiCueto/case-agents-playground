import json
import pytest
from fastapi.testclient import TestClient
from src.api.app import app
from src.api.routes.chat import register_agent_stream_dispatcher
from src.api.schemas import StreamEvent


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert "llm_server" in data
    assert data["database"] == "connected"


def test_list_agents_endpoint(client: TestClient) -> None:
    response = client.get("/api/agents")
    assert response.status_code == 200
    agents = response.json()
    assert len(agents) >= 6

    ids = [a["id"] for a in agents]
    for required_id in ["v1", "v2", "v3", "v4", "v5", "v6"]:
        assert required_id in ids

    v1_agent = next(a for a in agents if a["id"] == "v1")
    assert v1_agent["enabled"] is True
    assert v1_agent["status"] == "ready"

    v2_agent = next(a for a in agents if a["id"] == "v2")
    assert v2_agent["enabled"] is True
    assert v2_agent["status"] == "ready"

    v3_agent = next(a for a in agents if a["id"] == "v3")
    assert v3_agent["enabled"] is False
    assert v3_agent["status"] == "future"


def test_list_personas_endpoint(client: TestClient) -> None:
    response = client.get("/api/personas")
    assert response.status_code == 200
    personas = response.json()
    assert len(personas) >= 6
    assert all(p["is_lab_simulation"] is True for p in personas)

    usernames = [p["username"] for p in personas]
    assert "usr_carlos" in usernames
    assert "supervisor_juan" in usernames


def test_list_tickets_api(client: TestClient) -> None:
    response = client.get("/api/tickets?viewer_username=usr_carlos")
    assert response.status_code == 200
    tickets = response.json()
    assert len(tickets) >= 5


def test_get_ticket_detail_api(client: TestClient) -> None:
    response = client.get("/api/tickets/TICK-1001?viewer_username=usr_carlos")
    assert response.status_code == 200
    detail = response.json()
    assert detail["code"] == "TICK-1001"
    assert "status" in detail
    assert "comments" in detail
    assert "history" in detail


def test_chat_stream_pending_agent(client: TestClient) -> None:
    payload = {
        "agent_version": "v3",
        "query": "Consulta el ticket TICK-1001",
        "user_persona": "usr_carlos",
    }
    response = client.post("/api/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    events = []
    for line in response.text.split("\n"):
        if line.startswith("data: "):
            raw_json = line[6:].strip()
            if raw_json:
                events.append(json.loads(raw_json))

    assert len(events) >= 2
    types = [e["type"] for e in events]
    assert "USER_REQUEST" in types
    assert "AGENT_NOT_READY" in types
    assert "RUN_COMPLETED" in types


def test_chat_stream_registered_dispatcher(client: TestClient) -> None:
    async def sample_dispatcher(req):
        yield StreamEvent(
            event_id="evt-test-1",
            agent_version="v1_test",
            hop_number=1,
            hop_title="USER REQUEST",
            type="USER_REQUEST",
            payload={"query": req.query, "api_key": "secret_token_123"},
        )
        yield StreamEvent(
            event_id="evt-test-2",
            agent_version="v1_test",
            hop_number=2,
            hop_title="MODEL INFERENCE",
            type="MODEL_INFERENCE_1",
            payload={"tokens": 42},
        )
        yield StreamEvent(
            event_id="evt-test-3",
            agent_version="v1_test",
            type="RUN_COMPLETED",
            payload={"status": "completed"},
        )

    register_agent_stream_dispatcher("v1_test", sample_dispatcher)

    payload = {
        "agent_version": "v1_test",
        "query": "¿Cuál es la prioridad del ticket?",
        "user_persona": "usr_carlos",
    }
    response = client.post("/api/chat/stream", json=payload)
    assert response.status_code == 200

    events = []
    for line in response.text.split("\n"):
        if line.startswith("data: "):
            raw_json = line[6:].strip()
            if raw_json:
                events.append(json.loads(raw_json))

    assert len(events) == 3
    assert events[0]["payload"]["api_key"] == "***REDACTED***"
    assert events[0]["payload"]["_lab_mode"] is True
    assert events[1]["hop_number"] == 2
    assert events[2]["type"] == "RUN_COMPLETED"
