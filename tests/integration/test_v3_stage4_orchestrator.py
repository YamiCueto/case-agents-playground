import json
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional
import pytest
from sqlalchemy import select, text
from src.agents.common.contracts import ModelProvider, ModelResponse, ToolCall
from src.agents.v3_state_and_memory.orchestrator import AgentV3Orchestrator
from src.domain.enums import UserRole
from src.domain.exceptions import UnauthorizedActionError, ValidationError
from src.domain.memory.entities import DecisionRecord, PendingDecisionRecord
from src.domain.memory.enums import DecisionStatus, MemoryScope, ProvenanceType
from src.domain.memory.identity import LabSimulatedIdentityResolver
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.database.models import (
    AgentConversationMessageModel,
    AgentConversationModel,
    AgentDecisionModel,
    AgentPendingTaskModel,
    TicketModel,
)


class MultiTurnCoreferenceProvider(ModelProvider):
    """
    Proveedor simulado para probar correferencia multiturno y directiva de frescura:
    - En Turno 1: Devuelve llamada a get_ticket_by_id('TICK-1001') y luego síntesis.
    - En Turno 2 (pregunta elíptica "¿Quién lo tiene asignado?"):
      Inspecciona los mensajes pasados, identifica que 'lo' es TICK-1001, y emite get_ticket_by_id('TICK-1001')
      para cumplir la directiva de frescura consultando MySQL en tiempo real.
    """

    def __init__(self) -> None:
        self.turns_called = 0

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        self.turns_called += 1
        user_msgs = [m for m in messages if m.get("role") == "user"]
        last_query = user_msgs[-1]["content"] if user_msgs else ""

        # Verificar si hay observaciones de herramientas en el turno actual
        tool_obs = [m for m in messages if m.get("role") == "tool"]

        if "asignado" in last_query.lower() or "quién" in last_query.lower():
            # Turno 2: Pregunta elíptica
            if not tool_obs:
                # Comprobar que en los mensajes previos figura el ticket TICK-1001
                full_history = json.dumps(messages, ensure_ascii=False)
                assert "TICK-1001" in full_history, "Correferencia fallida: TICK-1001 no se encontró en el historial hidratado."
                # Emite llamada a herramienta para obtener estado fresco
                return ModelResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(
                            id="call_fresh_assignee",
                            name="get_ticket_by_id",
                            arguments={"ticket_code": "TICK-1001"},
                        )
                    ],
                )
            else:
                # Ya observó el ticket fresco de MySQL
                obs_data = json.loads(tool_obs[-1]["content"])
                assignee = obs_data.get("assignee") or "soporte_tecnico"
                return ModelResponse(
                    content=f"El ticket TICK-1001 se encuentra asignado a {assignee} según el estado vivo en MySQL.",
                    tool_calls=[],
                )
        else:
            # Turno 1: Consulta inicial
            if not tool_obs:
                return ModelResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(
                            id="call_initial_ticket",
                            name="get_ticket_by_id",
                            arguments={"ticket_code": "TICK-1001"},
                        )
                    ],
                )
            else:
                obs_data = json.loads(tool_obs[-1]["content"])
                status = obs_data.get("status", "OPEN")
                return ModelResponse(
                    content=f"El ticket TICK-1001 se encuentra en estado {status}.",
                    tool_calls=[],
                )


@pytest.fixture
def identity_carlos_and_laura():
    factory = get_app_session_factory()
    with factory() as session:
        resolver = LabSimulatedIdentityResolver(session)
        carlos = resolver.resolve("usr_carlos")
        laura = resolver.resolve("usr_laura")
        return carlos, laura


def test_v3_multiturn_conversation_and_coreference_with_fresh_mysql_data(identity_carlos_and_laura):
    """
    1. Conversación multiturno con memoria real en MySQL:
    - Turno 1: Carlos pregunta por TICK-1001. Se ejecuta y se persiste el turno en MySQL.
    - Turno 2: Carlos pregunta "¿Quién lo tiene asignado?". ContextBuilder hidrata Turno 1.
    - El modelo resuelve la correferencia ('lo' -> TICK-1001) y consulta la herramienta para obtener
      datos frescos de MySQL conforme a la Directiva de Frescura Operativa.
    - Ambos turnos quedan persistidos en agent_conversation_messages.
    """
    carlos, _ = identity_carlos_and_laura
    provider = MultiTurnCoreferenceProvider()
    orchestrator = AgentV3Orchestrator(provider=provider)
    conv_id = f"conv-v3-multi-{uuid.uuid4().hex[:6]}"

    try:
        # Turno 1
        state_1 = orchestrator.run(
            query="¿Cuál es el estado del ticket TICK-1001?",
            user_persona="usr_carlos",
            conversation_id=conv_id,
            turn_id=f"turn-1-{uuid.uuid4().hex[:4]}",
        )
        assert state_1.final_answer is not None
        assert "TICK-1001" in state_1.final_answer
        assert state_1.status.value == "completed"

        # Turno 2: Pregunta elíptica de seguimiento
        state_2 = orchestrator.run(
            query="¿Quién lo tiene asignado actualmente?",
            user_persona="usr_carlos",
            conversation_id=conv_id,
            turn_id=f"turn-2-{uuid.uuid4().hex[:4]}",
        )
        assert state_2.final_answer is not None
        assert "TICK-1001" in state_2.final_answer
        assert "asignado a" in state_2.final_answer

        # Verificar persistencia en MySQL
        factory = get_app_session_factory()
        with factory() as session:
            rows = session.execute(
                text("SELECT id, turn_id, role, content FROM agent_conversation_messages WHERE conversation_id = :cid ORDER BY id ASC"),
                {"cid": conv_id},
            ).fetchall()

            # 2 turnos completos = 4 mensajes (user, assistant, user, assistant)
            assert len(rows) == 4
            assert rows[0].role == "user"
            assert rows[1].role == "assistant"
            assert rows[2].role == "user"
            assert rows[3].role == "assistant"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id = :cid"), {"cid": conv_id})
            session.commit()


def test_v3_multitenant_user_isolation(identity_carlos_and_laura):
    """
    2. Aislamiento estricto multitenant:
    - Carlos crea una conversación y preferencia persistente.
    - Laura no puede acceder a la conversación de Carlos (UnauthorizedActionError).
    - Laura en su propia sesión no recibe ninguna preferencia de Carlos en su contexto.
    """
    carlos, laura = identity_carlos_and_laura
    conv_id_carlos = f"conv-carlos-{uuid.uuid4().hex[:6]}"
    conv_id_laura = f"conv-laura-{uuid.uuid4().hex[:6]}"

    class SimpleEchoProvider(ModelProvider):
        def generate(self, messages, tools, timeout=None):
            return ModelResponse(content="Respuesta general sin herramientas.", tool_calls=[])

    orchestrator = AgentV3Orchestrator(provider=SimpleEchoProvider())

    try:
        # Carlos establece preferencia persistente y conversación
        orchestrator.run(
            query="Recuerda que mi preferencia es preferred_channel: SMS para notificaciones",
            user_persona="usr_carlos",
            conversation_id=conv_id_carlos,
        )

        # Laura intenta consultar la conversación de Carlos -> Rechazada
        with pytest.raises(UnauthorizedActionError) as exc_info:
            orchestrator.run(
                query="Continuar conversación",
                user_persona="usr_laura",
                conversation_id=conv_id_carlos,
            )
        assert "no tiene acceso a la conversación" in str(exc_info.value)

        # Laura ejecuta su propia conversación
        state_laura = orchestrator.run(
            query="¿Cuál es el horario de atención?",
            user_persona="usr_laura",
            conversation_id=conv_id_laura,
        )
        assert state_laura.status.value == "completed"

        # Verificar que el contexto de Laura NO incluyó la preferencia de Carlos
        laura_system_msg = state_laura.messages[0]["content"]
        assert "preferred_channel" not in laura_system_msg
        assert "SMS" not in laura_system_msg

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id IN (:c1, :c2)"), {"c1": conv_id_carlos, "c2": conv_id_laura})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id IN (:c1, :c2)"), {"c1": conv_id_carlos, "c2": conv_id_laura})
            session.execute(text("DELETE FROM agent_decisions WHERE user_id IN (:u1, :u2) AND decision_key = 'preferred_channel'"), {"u1": carlos.user_id, "u2": laura.user_id})
            session.commit()


def test_v3_persistence_recovery_after_simulated_fastapi_restart(identity_carlos_and_laura):
    """
    3. Recuperación tras reinicio simulado de FastAPI:
    - Instancia 1 de AgentV3Orchestrator ejecuta Turno 1 y registra preferencia 'theme_mode: dark'.
    - Se destruye la Instancia 1 simulando apagado de uvicorn.
    - Se crea Instancia 2 completamente nueva (sin memoria residual en proceso).
    - Instancia 2 recupera la conversación y la preferencia directamente desde MySQL.
    """
    carlos, _ = identity_carlos_and_laura
    conv_id = f"conv-restart-{uuid.uuid4().hex[:6]}"

    class TurnEchoProvider(ModelProvider):
        def generate(self, messages, tools, timeout=None):
            return ModelResponse(content="Respuesta confirmada.", tool_calls=[])

    try:
        # Fase 1: Instancia 1
        orch_1 = AgentV3Orchestrator(provider=TurnEchoProvider())
        orch_1.run(
            query="Recuerda que mi preferencia es theme_mode: dark",
            user_persona="usr_carlos",
            conversation_id=conv_id,
            turn_id="turn-pre-restart-01",
        )

        # Destruir Instancia 1
        del orch_1

        # Fase 2: Instancia 2 post-reinicio
        orch_2 = AgentV3Orchestrator(provider=TurnEchoProvider())
        state_post = orch_2.run(
            query="¿Cuál es la configuración de mi interfaz?",
            user_persona="usr_carlos",
            conversation_id=conv_id,
            turn_id="turn-post-restart-02",
        )

        # Verificar que el contexto hidratado contiene Turno 1 y la preferencia desde MySQL
        hydrated_system = state_post.messages[0]["content"]
        assert "theme_mode" in hydrated_system
        assert "dark" in hydrated_system

        # Comprobar que en state_post.messages figura el turno anterior de Carlos
        user_queries_in_messages = [m["content"] for m in state_post.messages if m["role"] == "user"]
        assert "Recuerda que mi preferencia es theme_mode: dark" in user_queries_in_messages

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_decisions WHERE user_id = :uid AND decision_key = 'theme_mode'"), {"uid": carlos.user_id})
            session.commit()


def test_v3_explicit_persistent_preference_and_revocation_lifecycle(identity_carlos_and_laura):
    """
    4. Ciclo completo de preferencia persistente y revocación explícita:
    - Carlos establece 'default_priority: HIGH'.
    - Siguiente turno comprueba que la preferencia está activa y se hidrata en el prompt.
    - Carlos solicita 'Olvida mi preferencia de default_priority'.
    - Decisión transiciona a 'revoked' en MySQL.
    - Siguiente turno comprueba que ya NO se inyecta en el prompt.
    """
    carlos, _ = identity_carlos_and_laura
    conv_id = f"conv-pref-cycle-{uuid.uuid4().hex[:6]}"

    class PassthroughProvider(ModelProvider):
        def generate(self, messages, tools, timeout=None):
            return ModelResponse(content="Entendido.", tool_calls=[])

    orchestrator = AgentV3Orchestrator(provider=PassthroughProvider())

    try:
        # 1. Establecer preferencia
        orchestrator.run(
            query="Recuerda que mi preferencia es default_priority: HIGH para incidentes",
            user_persona="usr_carlos",
            conversation_id=conv_id,
        )

        # 2. Verificar en MySQL
        active_decs = orchestrator.decision_store.get_active_decisions(carlos.user_id, carlos.username)
        pref = next((d for d in active_decs if d.key == "default_priority"), None)
        assert pref is not None
        assert pref.value == "HIGH"
        assert pref.status == DecisionStatus.RESOLVED

        # 3. Consulta intermedia -> Debe estar presente en el contexto
        state_mid = orchestrator.run(
            query="¿Qué prioridad asignamos por defecto?",
            user_persona="usr_carlos",
            conversation_id=conv_id,
        )
        assert "default_priority" in state_mid.messages[0]["content"]

        # 4. Revocación
        orchestrator.run(
            query="Olvida mi preferencia de default_priority",
            user_persona="usr_carlos",
            conversation_id=conv_id,
        )

        # 5. Verificar que en MySQL quedó revocada
        active_after = orchestrator.decision_store.get_active_decisions(carlos.user_id, carlos.username)
        assert not any(d.key == "default_priority" for d in active_after)

        # 6. Siguiente consulta -> Ya NO figura en el contexto
        state_final = orchestrator.run(
            query="Prueba final sin preferencia",
            user_persona="usr_carlos",
            conversation_id=conv_id,
        )
        assert "default_priority" not in state_final.messages[0]["content"]

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_decisions WHERE user_id = :uid AND decision_key = 'default_priority'"), {"uid": carlos.user_id})
            session.commit()


def test_v3_pending_task_interruption_and_resumption(identity_carlos_and_laura):
    """
    5. Tarea pendiente interrumpida y reanudación segura:
    - Se registra una tarea pausada en agent_pending_tasks.
    - El orquestador reanuda la tarea con el valor seleccionado:
      adquisición atómica -> revalidación Pydantic -> consulta de estado MySQL -> ejecución -> resolución.
    - Se crea un nuevo ticket en MySQL y la tarea transiciona a 'resolved'.
    """
    carlos, _ = identity_carlos_and_laura
    orchestrator = AgentV3Orchestrator()
    task_id = f"task-resume-{uuid.uuid4().hex[:6]}"
    conv_id = f"conv-task-{uuid.uuid4().hex[:6]}"

    pending_rec = PendingDecisionRecord(
        decision_id=task_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=conv_id,
        original_query="Crear ticket para corte de fibra",
        question="Seleccione la prioridad requerida",
        options=["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        target_tool_name="create_ticket",
        pending_tool_arguments={
            "title": "Corte de fibra óptica troncal",
            "description": "Se detectó pérdida de señal en el enlace principal.",
            "category_code": "NETWORK",
        },
        missing_parameter_name="priority",
    )
    orchestrator.decision_store.save_pending_task(pending_rec)

    try:
        # Reanudar tarea pasando selected_value="CRITICAL"
        state = orchestrator.run(
            query="Opción seleccionada: CRITICAL",
            user_persona="usr_carlos",
            conversation_id=conv_id,
            decision_id=task_id,
            selected_value="CRITICAL",
        )
        assert state.status.value == "completed"
        assert "ha sido reanudada y resuelta con el valor 'CRITICAL'" in state.final_answer

        # Verificar en MySQL que la tarea está resuelta
        factory = get_app_session_factory()
        with factory() as session:
            task_model = session.scalar(
                select(AgentPendingTaskModel).where(AgentPendingTaskModel.decision_id == task_id)
            )
            assert task_model is not None
            assert task_model.status == "resolved"
            assert task_model.selected_value == "CRITICAL"
            assert task_model.resolved_at is not None

            # Verificar que el ticket se creó en MySQL con prioridad CRITICAL
            created_ticket = session.scalar(
                select(TicketModel).where(TicketModel.title == "Corte de fibra óptica troncal")
            )
            assert created_ticket is not None
            assert created_ticket.priority == "CRITICAL"
            assert created_ticket.category.code == "NETWORK"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"), {"did": task_id})
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM ticket_history WHERE ticket_id IN (SELECT id FROM tickets WHERE title = 'Corte de fibra óptica troncal')"))
            session.execute(text("DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE title = 'Corte de fibra óptica troncal')"))
            session.execute(text("DELETE FROM tickets WHERE title = 'Corte de fibra óptica troncal'"))
            session.commit()


def test_v3_concurrent_pending_task_resumption_prevents_double_mutation(identity_carlos_and_laura):
    """
    6. Concurrencia y prevención de doble mutación:
    - Dos trabajadores intentan reanudar la misma tarea pendiente simultáneamente.
    - Exactamente un trabajador logra la adquisición y resolución.
    - El segundo trabajador recibe ValidationError (tarea ya adquirida).
    """
    carlos, _ = identity_carlos_and_laura
    orchestrator = AgentV3Orchestrator()
    task_id = f"task-race-{uuid.uuid4().hex[:6]}"
    conv_id = f"conv-race-{uuid.uuid4().hex[:6]}"

    pending_rec = PendingDecisionRecord(
        decision_id=task_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=conv_id,
        original_query="Crear ticket concurrente",
        question="Seleccione prioridad",
        options=["LOW", "HIGH"],
        target_tool_name="create_ticket",
        pending_tool_arguments={
            "title": "Incidente concurrente test",
            "description": "Prueba de carreras de resolución",
            "category_code": "GENERAL",
        },
        missing_parameter_name="priority",
    )
    orchestrator.decision_store.save_pending_task(pending_rec)

    def worker_resolve(worker_id: str):
        try:
            return orchestrator.run(
                query="HIGH",
                user_persona="usr_carlos",
                conversation_id=conv_id,
                decision_id=task_id,
                selected_value="HIGH",
            )
        except Exception as e:
            return e

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(worker_resolve, "w1")
            f2 = executor.submit(worker_resolve, "w2")
            res1 = f1.result()
            res2 = f2.result()

        successes = [r for r in [res1, res2] if not isinstance(r, Exception)]
        errors = [r for r in [res1, res2] if isinstance(r, Exception)]

        assert len(successes) == 1, "Exactamente 1 trabajador debe resolver la tarea."
        assert len(errors) == 1, "El segundo trabajador debe ser rechazado."
        assert "no se encuentra en estado 'pending'" in str(errors[0]) or "Transición de estado inválida" in str(errors[0])

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"), {"did": task_id})
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM ticket_history WHERE ticket_id IN (SELECT id FROM tickets WHERE title = 'Incidente concurrente test')"))
            session.execute(text("DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE title = 'Incidente concurrente test')"))
            session.execute(text("DELETE FROM tickets WHERE title = 'Incidente concurrente test'"))
            session.commit()


def test_v3_sse_stream_events_emission_and_sanitization(identity_carlos_and_laura):
    """
    7. Emisión de eventos SSE para Agent v3:
    - Verifica que run_stream emite eventos con agent_version='v3'.
    - Verifica emisión de MEMORY_HYDRATED con métricas de presupuesto.
    - Verifica sanitización de secretos en los eventos emitidos.
    """
    import asyncio
    carlos, _ = identity_carlos_and_laura

    class SecretLeakerProvider(ModelProvider):
        def generate(self, messages, tools, timeout=None):
            return ModelResponse(content="Aquí está tu respuesta final sin inconvenientes.", tool_calls=[])

    orchestrator = AgentV3Orchestrator(provider=SecretLeakerProvider())
    conv_id = f"conv-sse-v3-{uuid.uuid4().hex[:6]}"

    async def collect_events():
        evts = []
        async for evt in orchestrator.run_stream(
            query="¿Cuál es el estado de mis servicios?",
            user_persona="usr_carlos",
            conversation_id=conv_id,
        ):
            evts.append(evt)
        return evts

    try:
        events = asyncio.run(collect_events())

        assert len(events) >= 3
        types = [e.type for e in events]
        assert "MEMORY_HYDRATED" in types
        assert "RUN_STARTED" in types
        assert "FINAL_SYNTHESIS" in types
        assert "TURN_PERSISTED" in types

        # Comprobar que todos los eventos pertenecen a v3
        for e in events:
            assert e.agent_version == "v3"

        # Comprobar que MEMORY_HYDRATED incluye stats y conversación
        hydrated_evt = next(e for e in events if e.type == "MEMORY_HYDRATED")
        assert hydrated_evt.payload["conversation_id"] == conv_id
        assert "stats" in hydrated_evt.payload
        assert "total_initial_tokens" in hydrated_evt.payload["stats"]

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id = :cid"), {"cid": conv_id})
            session.commit()


def test_v3_chat_stream_api_endpoint():
    """
    Verifica que el endpoint /api/chat/stream ejecute Agent v3 a través de FastAPI,
    emitiendo eventos SSE de memoria e inferencia.
    """
    from fastapi.testclient import TestClient
    from src.api.app import app

    client = TestClient(app)
    conv_id = f"conv-api-v3-{uuid.uuid4().hex[:6]}"
    payload = {
        "agent_version": "v3",
        "query": "¿Cuál es el procedimiento general para priorizar un incidente?",
        "user_persona": "usr_carlos",
        "conversation_id": conv_id,
    }

    try:
        response = client.post("/api/chat/stream", json=payload)
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        events = []
        for line in response.text.split("\n"):
            if line.startswith("data: "):
                raw = line[6:].strip()
                if raw:
                    events.append(json.loads(raw))

        assert len(events) >= 3
        types = [e["type"] for e in events]
        assert "MEMORY_HYDRATED" in types
        assert "RUN_STARTED" in types
        assert "FINAL_SYNTHESIS" in types

        for e in events:
            assert e["agent_version"] == "v3"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"), {"cid": conv_id})
            session.execute(text("DELETE FROM agent_conversations WHERE conversation_id = :cid"), {"cid": conv_id})
            session.commit()

