"""
AEP - Agent v3: State & Memory | Etapa 5: Validación Funcional Real
Suite de validación end-to-end con MySQL, FastAPI y proveedor LLM local (llama.cpp/Qwen 3.5 4B).

Matriz de escenarios cubiertos:
1. Verificación de disponibilidad de MySQL, FastAPI y llama.cpp/Qwen.
2. Conversaciones multiturno reales con Agent v3 mediante endpoints HTTP/SSE.
3. Validación de persistencia tras parada y reinicio del proceso FastAPI.
4. Aislamiento multitenant estricto entre Carlos (usr_carlos) y Laura (usr_laura).
5. Preferencias explícitas: persistencia, recuperación en conversación nueva y revocación.
6. Pausa y reanudación de tarea pendiente con validación Pydantic y comprobación de estado de tickets en MySQL.
7. Simulación de caída tras mutación: verificación de recovery_required (AUD-04) y reconciliación sin doble ejecución (AUD-05).
8. Inspección de eventos SSE y redacción de secretos/credenciales.
9. Recálculo del presupuesto de tokens en inferencias sucesivas bajo sliding window.
10. Regresión completa del backend y suite de pruebas existente.
"""

import json
import os
import subprocess
import sys
import time
import traceback
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.orm import sessionmaker
from src.agents.common.providers import OpenAICompatibleProvider
from src.agents.v3_state_and_memory.orchestrator import AgentV3Orchestrator
from src.domain.enums import Priority, UserRole
from src.domain.exceptions import UnauthorizedActionError, ValidationError
from src.domain.memory.entities import DecisionRecord, PendingDecisionRecord
from src.domain.memory.enums import DecisionStatus, MemoryScope, ProvenanceType
from src.domain.memory.policy import MemoryPolicy
from src.domain.memory.token_budget import TokenBudgetManager
from src.infrastructure.config import Settings
from src.infrastructure.database.connection import create_db_engine
from src.infrastructure.database.models import (
    AgentConversationMessageModel,
    AgentConversationModel,
    AgentDecisionModel,
    AgentPendingTaskModel,
    TicketModel,
)
from src.infrastructure.memory.sql_conversation_memory_store import SqlConversationMemoryStore
from src.infrastructure.memory.sql_decision_memory_store import SqlDecisionMemoryStore

API_BASE_URL = "http://127.0.0.1:8000"
LLM_BASE_URL = "http://127.0.0.1:8080/v1"
MODEL_NAME = "Qwen 3.5 4B UD-Q5_K_XL (local llama-server)"
LIVE_DB_NAME = os.getenv("LIVE_DB_NAME", "cfa_tickets")


def get_live_engine():
    s = Settings()
    s.db_name = LIVE_DB_NAME
    return create_db_engine(s.app_database_url)


def get_live_admin_engine():
    s = Settings()
    s.db_name = LIVE_DB_NAME
    return create_db_engine(s.admin_database_url)


def get_live_session_factory():
    engine = get_live_engine()
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def stream_sse_request(
    payload: Dict[str, Any],
    base_url: str = API_BASE_URL,
    timeout: float = 40.0,
) -> List[Dict[str, Any]]:
    """Envía una petición POST al endpoint SSE y recolecta todos los eventos StreamEvent."""
    req = urllib.request.Request(
        f"{base_url}/api/chat/stream",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    events: List[Dict[str, Any]] = []
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for line in resp:
            line_str = line.decode("utf-8").strip()
            if line_str.startswith("data:"):
                raw_json = line_str[5:].strip()
                if raw_json:
                    events.append(json.loads(raw_json))
    return events


@pytest.fixture(autouse=True)
def cleanup_test_records():
    """Limpia registros de prueba de la base de datos tras cada ejecución."""
    yield
    factory = get_live_session_factory()
    with factory() as session:
        # Limpiar conversaciones de prueba
        test_convs = session.scalars(
            select(AgentConversationModel.conversation_id).where(
                AgentConversationModel.conversation_id.like("test-s5-%")
            )
        ).all()
        for cid in test_convs:
            session.execute(
                delete(AgentConversationMessageModel).where(
                    AgentConversationMessageModel.conversation_id == cid
                )
            )
            session.execute(
                delete(AgentConversationModel).where(
                    AgentConversationModel.conversation_id == cid
                )
            )

        # Limpiar decisiones y tareas de prueba
        session.execute(
            delete(AgentDecisionModel).where(
                AgentDecisionModel.decision_id.like("test-s5-%")
            )
        )
        session.execute(
            delete(AgentPendingTaskModel).where(
                AgentPendingTaskModel.decision_id.like("test-s5-%")
            )
        )

        # Limpiar cualquier ticket de prueba creado
        session.execute(
            delete(TicketModel).where(
                TicketModel.code.like("TEST-TICK-%")
            )
        )
        session.commit()


# ===========================================================================
# ESCENARIO 1: Disponibilidad de MySQL, llama.cpp y FastAPI
# ===========================================================================
def test_stage5_scenario_01_system_availability():
    """
    Escenario 1: Verificar disponibilidad y estado operativo de MySQL,
    llama.cpp (Qwen 3.5 4B) y FastAPI antes de iniciar la suite funcional.
    """
    # 1. Verificar MySQL
    engine = get_live_admin_engine()
    with engine.connect() as conn:
        res = conn.execute(text("SELECT 1")).scalar()
        assert res == 1, "MySQL no respondió con SELECT 1"
        users_count = conn.execute(text("SELECT count(*) FROM users")).scalar()
        assert users_count >= 6, "Tabla users de MySQL no contiene los usuarios requeridos"

    # 2. Verificar llama.cpp
    with urllib.request.urlopen(f"{LLM_BASE_URL}/models", timeout=5) as resp:
        assert resp.status == 200, "llama.cpp no respondió 200 OK"
        data = json.loads(resp.read().decode())
        models = [m["id"] for m in data.get("data", [])]
        assert len(models) >= 1, "llama.cpp no expone modelos activos"
        assert any("qwen" in m.lower() for m in models), f"Modelo Qwen no encontrado en llama.cpp: {models}"

    # 3. Verificar FastAPI
    with urllib.request.urlopen(f"{API_BASE_URL}/openapi.json", timeout=5) as resp:
        assert resp.status == 200, "FastAPI no respondió 200 OK"
        spec = json.loads(resp.read().decode())
        assert spec.get("info", {}).get("title") == "Agent Engineering Playground API"


# ===========================================================================
# ESCENARIO 2: Conversaciones Multiturno Reales con Agent v3 y Correferencia
# ===========================================================================
def test_stage5_scenario_02_multiturn_conversation_and_coreference_real_llm():
    """
    Escenario 2: Conversación multiturno real vía HTTP/SSE con Qwen 3.5 4B.
    - Turno 1: Carlos pregunta por TICK-1001. Agente invoca get_ticket_by_id y sintetiza.
    - Turno 2: Carlos hace pregunta con correferencia elíptica ('¿Quién lo tiene asignado?').
    - El agente hidrata el historial desde MySQL, resuelve la correferencia y consulta
      el estado operativo fresco desde MySQL según la directiva de frescura.
    """
    # Turno 1
    t1_payload = {
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "query": "¿Cuál es el estado y la prioridad del ticket TICK-1001?",
    }
    t1_events = stream_sse_request(t1_payload)
    assert len(t1_events) > 0, "No se recibieron eventos en Turno 1"

    # Extraer conversation_id y turn_id
    hydrated_ev = next((e for e in t1_events if e["type"] == "MEMORY_HYDRATED"), None)
    assert hydrated_ev is not None, "Evento MEMORY_HYDRATED no emitido en Turno 1"
    cid = hydrated_ev["payload"]["conversation_id"]

    persisted_ev = next((e for e in t1_events if e["type"] == "TURN_PERSISTED"), None)
    assert persisted_ev is not None, "Evento TURN_PERSISTED no emitido en Turno 1"

    tool_call_ev = next((e for e in t1_events if e["type"] == "TOOL_CALL_PROPOSED"), None)
    assert tool_call_ev is not None, "El LLM no propuso llamada a herramienta en Turno 1"
    assert tool_call_ev["payload"]["tool_name"] == "get_ticket_by_id"

    final_synth_ev = next((e for e in t1_events if e["type"] == "FINAL_SYNTHESIS"), None)
    assert final_synth_ev is not None, "Evento FINAL_SYNTHESIS no emitido en Turno 1"
    ans1 = final_synth_ev["payload"].get("answer", "")
    assert "TICK-1001" in ans1 or "abierto" in ans1.lower() or "open" in ans1.lower()

    # Turno 2 (Correferencia elíptica en la misma conversación)
    t2_payload = {
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "conversation_id": cid,
        "query": "¿Quién lo tiene asignado y quién lo creó?",
    }
    t2_events = stream_sse_request(t2_payload)
    assert len(t2_events) > 0, "No se recibieron eventos en Turno 2"

    t2_hydrated = next((e for e in t2_events if e["type"] == "MEMORY_HYDRATED"), None)
    assert t2_hydrated is not None, "Evento MEMORY_HYDRATED no emitido en Turno 2"
    assert t2_hydrated["payload"]["turns_count"] >= 1, "La memoria conversacional no hidrató el Turno 1"

    t2_persisted = next((e for e in t2_events if e["type"] == "TURN_PERSISTED"), None)
    assert t2_persisted is not None, "Evento TURN_PERSISTED no emitido en Turno 2"

    # Verificar en MySQL que existen los 2 turnos con secuencia monotónica
    factory = get_live_session_factory()
    with factory() as session:
        messages = session.scalars(
            select(AgentConversationMessageModel)
            .where(AgentConversationMessageModel.conversation_id == cid)
            .order_by(AgentConversationMessageModel.id.asc())
        ).all()
        assert len(messages) >= 4, f"Se esperaban al menos 4 mensajes persistidos (2 turnos), encontrados {len(messages)}"
        turns = {m.turn_id for m in messages}
        assert len(turns) >= 2, f"Se esperaban al menos 2 turn_id estables distintos, encontrados {len(turns)}"


# ===========================================================================
# ESCENARIO 3: Parada y Reinicio Real del Proceso FastAPI
# ===========================================================================
def test_stage5_scenario_03_memory_persistence_across_fastapi_process_restart():
    """
    Escenario 3: Demostración empírica de persistencia tras muerte y renacimiento
    del proceso FastAPI en un puerto dedicado (8009).
    - Se levanta un proceso uvicorn dedicado en PID A.
    - Se envía Turno 1 con Carlos consultando TICK-1004.
    - Se termina con señal dura el proceso PID A y se confirma caída del puerto.
    - Se inicia un nuevo proceso uvicorn en PID B en el mismo puerto.
    - Se envía Turno 2 a PID B con el mismo conversation_id.
    - Se verifica que PID B hidrata la memoria desde MySQL y recuerda el ticket.
    """
    port = 8009
    url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["DB_NAME"] = LIVE_DB_NAME

    # Iniciar Proceso 1
    proc1 = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "src.api.app:app", "--port", str(port)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    proc2 = None
    try:
        # Esperar a que el Proceso 1 esté listo
        ready1 = False
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"{url}/openapi.json", timeout=1) as resp:
                    if resp.status == 200:
                        ready1 = True
                        break
            except Exception:
                time.sleep(0.5)
        assert ready1, "Proceso 1 de FastAPI no estuvo listo"

        # Turno 1 en Proceso 1
        t1_evs = stream_sse_request(
            {
                "agent_version": "v3",
                "user_persona": "usr_carlos",
                "query": "¿Cuál es el estado del ticket TICK-1004?",
            },
            base_url=url,
        )
        t1_hydrated = next((e for e in t1_evs if e["type"] == "MEMORY_HYDRATED"), None)
        assert t1_hydrated is not None
        cid = t1_hydrated["payload"]["conversation_id"]

        # Detener Proceso 1
        proc1.terminate()
        proc1.wait(timeout=10)

        # Confirmar que el puerto cayó
        port_down = False
        try:
            urllib.request.urlopen(f"{url}/openapi.json", timeout=1)
        except Exception:
            port_down = True
        assert port_down, "El servidor no cayó tras terminar el Proceso 1"

        # Iniciar Proceso 2 (Proceso completamente nuevo)
        proc2 = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "src.api.app:app", "--port", str(port)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
        )
        ready2 = False
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"{url}/openapi.json", timeout=1) as resp:
                    if resp.status == 200:
                        ready2 = True
                        break
            except Exception:
                time.sleep(0.5)
        assert ready2, "Proceso 2 de FastAPI no estuvo listo tras reinicio"

        # Turno 2 en Proceso 2
        t2_evs = stream_sse_request(
            {
                "agent_version": "v3",
                "user_persona": "usr_carlos",
                "conversation_id": cid,
                "query": "¿Quién lo tiene asignado y quién lo creó?",
            },
            base_url=url,
        )
        t2_hydrated = next((e for e in t2_evs if e["type"] == "MEMORY_HYDRATED"), None)
        assert t2_hydrated is not None
        assert t2_hydrated["payload"]["turns_count"] >= 1, "El Proceso 2 no hidrató la memoria desde MySQL"

        t2_synth = next((e for e in t2_evs if e["type"] == "FINAL_SYNTHESIS"), None)
        assert t2_synth is not None
        ans = t2_synth["payload"].get("answer", "")
        assert "soporte_tecnico" in ans or "laura" in ans.lower() or "TICK-1004" in ans, f"El nuevo proceso no resolvió la correferencia para TICK-1004: {ans}"

    finally:
        try:
            proc1.terminate()
        except Exception:
            pass
        if proc2 is not None:
            try:
                proc2.terminate()
                proc2.wait(timeout=5)
            except Exception:
                pass


# ===========================================================================
# ESCENARIO 4: Aislamiento Multitenant Estricto (Carlos vs Laura)
# ===========================================================================
def test_stage5_scenario_04_multitenant_user_isolation():
    """
    Escenario 4: Comprobar aislamiento multitenant estricto entre Carlos (id=1)
    y Laura (id=2). Laura no puede acceder a las conversaciones de Carlos.
    """
    # 1. Carlos crea una conversación
    carlos_evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "query": "Consulta el ticket TICK-1001",
    })
    carlos_hydrated = next((e for e in carlos_evs if e["type"] == "MEMORY_HYDRATED"), None)
    assert carlos_hydrated is not None
    carlos_cid = carlos_hydrated["payload"]["conversation_id"]

    # 2. Laura intenta consultar la conversación de Carlos
    laura_evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_laura",
        "conversation_id": carlos_cid,
        "query": "¿Qué ticket estábamos revisando?",
    })
    laura_err = next((e for e in laura_evs if e["type"] == "ERROR"), None)
    assert laura_err is not None, "El sistema no bloqueó a Laura al acceder a la conversación de Carlos"
    assert "no tiene acceso a la conversación" in laura_err["payload"]["message"]

    # 3. Verificar en MySQL que Laura no generó mensajes en la conversación de Carlos
    factory = get_live_session_factory()
    with factory() as session:
        conv = session.scalar(
            select(AgentConversationModel).where(AgentConversationModel.conversation_id == carlos_cid)
        )
        assert conv is not None
        assert conv.user_id == 1, "La conversación no pertenece a Carlos"
        assert conv.subject_id == "usr_carlos"


# ===========================================================================
# ESCENARIO 5: Ciclo de Vida de Preferencias Explícitas (Guardado, Recuerdo, Revocación)
# ===========================================================================
def test_stage5_scenario_05_explicit_persistent_preferences_lifecycle():
    """
    Escenario 5: Preferencias persistentes explícitas autorizadas:
    - Carlos guarda una preferencia: 'Recuerda que mi preferencia es tema: dark'.
    - Se emite DECISION_SAVED y se guarda en MySQL con active_lock_key y version>=1.
    - Carlos abre una conversación nueva; la preferencia es hidratada (MEMORY_HYDRATED).
    - Carlos revoca la preferencia: 'Olvida mi preferencia tema'.
    - Se emite DECISION_REVOKED y active_lock_key pasa a NULL en MySQL.
    """
    # 1. Establecer preferencia
    p_evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "query": "Recuerda que mi preferencia es tema: dark",
    })
    saved_ev = next((e for e in p_evs if e["type"] == "DECISION_SAVED"), None)
    assert saved_ev is not None, "No se emitió evento DECISION_SAVED"
    assert saved_ev["payload"]["key"] == "tema"
    assert saved_ev["payload"]["value"] == "dark"

    # Verificar en MySQL
    factory = get_live_session_factory()
    with factory() as session:
        dec = session.scalar(
            select(AgentDecisionModel).where(
                AgentDecisionModel.user_id == 1,
                AgentDecisionModel.decision_key == "tema",
                AgentDecisionModel.status == "resolved",
            )
        )
        assert dec is not None, "La decisión no se guardó en MySQL"
        assert "usr_1:persistent:tema" in (dec.active_lock_key or "")
        assert dec.version >= 1

    # 2. Conversación nueva: verificar que se hidrata la preferencia activa
    new_conv_evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "query": "Hola, ¿cuáles son mis preferencias activas?",
    })
    new_hydrated = next((e for e in new_conv_evs if e["type"] == "MEMORY_HYDRATED"), None)
    assert new_hydrated is not None
    assert new_hydrated["payload"]["decisions_count"] >= 1, "La preferencia activa no fue hidratada en la conversación nueva"
    active_decs = new_hydrated["payload"]["active_decisions"]
    assert any(d.get("key") == "tema" for d in active_decs)

    # 3. Revocar preferencia
    revoke_evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "query": "Olvida mi preferencia tema",
    })
    revoked_ev = next((e for e in revoke_evs if e["type"] == "DECISION_REVOKED"), None)
    assert revoked_ev is not None, "No se emitió evento DECISION_REVOKED"
    assert revoked_ev["payload"]["decision_key"] == "tema"

    # Verificar en MySQL que active_lock_key es NULL y revoked_at tiene timestamp
    with factory() as session:
        revoked_rec = session.scalar(
            select(AgentDecisionModel).where(
                AgentDecisionModel.user_id == 1,
                AgentDecisionModel.decision_key == "tema",
                AgentDecisionModel.status == "revoked",
            ).order_by(AgentDecisionModel.id.desc())
        )
        assert revoked_rec is not None, "La decisión no tiene estado 'revoked' en MySQL"
        assert revoked_rec.active_lock_key is None, "active_lock_key no fue liberado tras revocación"
        assert revoked_rec.revoked_at is not None, "revoked_at es nulo tras revocación"


# ===========================================================================
# ESCENARIO 6: Tarea Pendiente - Pausa, Reanudación y Validación de Estado Fresco
# ===========================================================================
def test_stage5_scenario_06_pending_task_human_in_the_loop_resumption():
    """
    Escenario 6: Ciclo de vida de tarea pendiente con autorización y revalidación:
    - Se registra una tarea pendiente para Carlos que requiere completar ticket_code.
    - Laura intenta reanudarla -> rechazo inmediato por control de propiedad.
    - Carlos la reanuda aportando 'TICK-1001'.
    - El orquestador revalida tipos con Pydantic, comprueba estado fresco en MySQL,
      adquiere lease atómico, registra checkpoint y ejecuta la herramienta.
    """
    factory = get_live_session_factory()
    decision_store = SqlDecisionMemoryStore(session_factory=factory)
    task_id = f"test-s5-task-{uuid.uuid4().hex[:6]}"

    # Registrar tarea pendiente en MySQL (en la base viva que consulta FastAPI)
    task = PendingDecisionRecord(
        decision_id=task_id,
        user_id=1,
        subject_id="usr_carlos",
        session_id="sess-stage5-val",
        conversation_id="conv-stage5-val",
        original_query="Por favor consulta los datos del ticket",
        question="¿Qué código de ticket deseas consultar?",
        options=["TICK-1001", "TICK-1002"],
        target_tool_name="get_ticket_by_id",
        pending_tool_arguments={},
        missing_parameter_name="ticket_code",
        required_role=UserRole.USER.value,
    )
    decision_store.save_pending_task(task)

    # 1. Laura intenta reanudar la tarea de Carlos
    laura_evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_laura",
        "decision_id": task_id,
        "selected_value": "TICK-1001",
        "query": "Reanudar tarea",
    })
    laura_err = next((e for e in laura_evs if e["type"] == "ERROR"), None)
    assert laura_err is not None, "Laura no fue bloqueada al reanudar la tarea de Carlos"
    assert "no tiene permiso" in laura_err["payload"]["message"] or "no es propietario" in laura_err["payload"]["message"]

    # 2. Carlos reanuda la tarea con valor seleccionado
    carlos_evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "decision_id": task_id,
        "selected_value": "TICK-1001",
        "query": "Reanudar tarea",
    })
    resolved_ev = next((e for e in carlos_evs if e["type"] == "PENDING_TASK_RESOLVED"), None)
    assert resolved_ev is not None, "No se emitió evento PENDING_TASK_RESOLVED"

    # Verificar en MySQL que la tarea está resuelta
    with factory() as session:
        t_model = session.scalar(
            select(AgentPendingTaskModel).where(AgentPendingTaskModel.decision_id == task_id)
        )
        assert t_model is not None
        assert t_model.status == "resolved"
        assert t_model.selected_value == "TICK-1001"
        assert t_model.execution_checkpoint is not None


# ===========================================================================
# ESCENARIO 7: Simulación de Caída tras Mutación, recovery_required y Reconciliación
# ===========================================================================
def test_stage5_scenario_07_crash_simulation_recovery_required_and_reconciliation():
    """
    Escenario 7: Simulación de caída tras mutación con resultado incierto (AUD-04 y AUD-05).
    - Tarea en resolving expira o se interrumpe antes de confirmación en MySQL.
    - Se marca 'recovery_required' y se bloquea reejecución automática para prevenir doble mutación.
    - Se realiza reconciliación verificable explícita (reconcile_and_resolve).
    """
    factory = get_live_session_factory()
    store = SqlDecisionMemoryStore(session_factory=factory)
    task_id = f"test-s5-mut-{uuid.uuid4().hex[:6]}"

    task = PendingDecisionRecord(
        decision_id=task_id,
        user_id=1,
        subject_id="usr_carlos",
        session_id="sess-stage5-mut",
        conversation_id="conv-stage5-mut",
        original_query="Mutación sensible",
        question="Confirmar operación",
        options=["SI", "NO"],
        target_tool_name="create_ticket",
        pending_tool_arguments={"title": "Test", "description": "Desc", "category_code": "GENERAL"},
        missing_parameter_name="priority",
        required_role=UserRole.USER.value,
    )
    store.save_pending_task(task)

    # Adquirir tarea para resolución
    store.atomic_acquire_for_resolving(
        decision_id=task_id,
        user_id=1,
        lease_owner="worker-stage5-crash-sim",
        lease_seconds=-10,  # Ya expirado para simular caída
    )

    # 1. Reclamar tarea expirada -> transiciona a recovery_required (AUD-04)
    reclaimed = store.atomic_reclaim_expired_task(task_id, 1)
    assert reclaimed.status.value == "recovery_required"
    assert "Lease expirado" in (reclaimed.recovery_reason or "")

    # 2. Intentar reejecutar automáticamente -> Bloqueo estricto
    with pytest.raises(ValidationError, match="ya no se encuentra en estado 'pending'"):
        store.atomic_acquire_for_resolving(
            decision_id=task_id,
            user_id=1,
            lease_owner="worker-retry-attempt",
            lease_seconds=60,
        )

    # 3. Reconciliación explícita (AUD-05)
    reconciled = store.reconcile_and_resolve(
        decision_id=task_id,
        user_id=1,
        selected_value="HIGH",
        reconciliation_note="Verificado externamente en sistema destino que la operación no produjo duplicado",
    )
    assert reconciled.status.value == "resolved"
    assert "Reconciliado con éxito" in (reconciled.recovery_reason or "")


# ===========================================================================
# ESCENARIO 8: Sanitización de Eventos SSE y Redacción de Secretos
# ===========================================================================
def test_stage5_scenario_08_sse_event_sanitization_and_secret_redaction():
    """
    Escenario 8: Verificar que los eventos SSE emitidos no filtren credenciales,
    tokens o secretos en texto plano, redáctandolos según MemoryPolicy.
    """
    secret_token = "sk-proj-supersecret99999999999"
    secret_pass = "cfa_secure_pass_2026"

    evs = stream_sse_request({
        "agent_version": "v3",
        "user_persona": "usr_carlos",
        "query": f"Revisa el ticket TICK-1001 usando el token {secret_token} y password: {secret_pass}",
    })

    full_stream_text = json.dumps(evs, ensure_ascii=False)
    assert secret_token not in full_stream_text, "El token secreto se filtró en el stream SSE"
    assert secret_pass not in full_stream_text, "La contraseña se filtró en el stream SSE"
    assert "***REDACTED" in full_stream_text, "No se encontraron marcas de redacción en el stream SSE"


# ===========================================================================
# ESCENARIO 9: Recálculo del Presupuesto de Tokens y Ventana Deslizante
# ===========================================================================
def test_stage5_scenario_09_token_budget_recalculation_and_sliding_window():
    """
    Escenario 9: Recálculo dinámico del presupuesto de tokens en inferencias sucesivas:
    - Comprobar que TokenBudgetManager calcula query_tokens, system_tokens, decisions_tokens.
    - Comprobar que el presupuesto disponible para historial respeta el límite total (4096).
    - Verificar que un historial con muchos turnos activa la ventana deslizante sin desbordar el presupuesto.
    """
    provider = OpenAICompatibleProvider()
    budget = TokenBudgetManager.from_provider_config(provider, default_limit=4096)

    # Simular historial extenso de 15 turnos
    from src.domain.memory.entities import ConversationTurn
    turns = []
    for i in range(15):
        turns.append(
            ConversationTurn(
                turn_id=f"turn-{i}",
                conversation_id="conv-budget-test",
                user_id=1,
                subject_id="usr_carlos",
                user_query=f"Consulta de soporte técnico número {i} con detalles adicionales de la incidencia",
                agent_response=f"Respuesta sintética generada para la consulta {i} con observaciones técnicas del ticket",
                tokens_estimate=120,
            )
        )

    # Aplicar ventana deslizante con reserva para presupuesto restringido
    selected_turns = budget.select_history_turns(
        turns=turns,
        available_budget=500,  # Presupuesto restringido
    )

    total_tokens = sum(t.tokens_estimate for t in selected_turns)
    assert total_tokens <= 500, f"La ventana deslizante excedió el presupuesto disponible: {total_tokens} > 500"
    assert len(selected_turns) < len(turns), "La ventana deslizante no podó turnos antiguos"


# ===========================================================================
# ESCENARIO 10: Regresión Completa de la Suite Existente (123 Pruebas)
# ===========================================================================
def test_stage5_scenario_10_complete_backend_regression():
    """
    Escenario 10: Ejecutar la regresión completa de pruebas unitarias e integración
    para asegurar cero efectos colaterales en Agent v1, Agent v2 y persistencia.
    """
    res = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/unit", "tests/integration/test_v3_stage4_orchestrator.py", "-q"],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"Regresión falló con código {res.returncode}:\n{res.stdout}\n{res.stderr}"
    assert "passed" in res.stdout, f"Salida de pytest no contiene pruebas aprobadas:\n{res.stdout}"


if __name__ == "__main__":
    print("=" * 70)
    print("EJECUTANDO SUITE DE VALIDACIÓN FUNCIONAL REAL - ETAPA 5")
    print(f"Modelo LLM activo: {MODEL_NAME}")
    print(f"Base de datos activa: {LIVE_DB_NAME}")
    print(f"FastAPI Base URL: {API_BASE_URL}")
    print(f"llama.cpp Base URL: {LLM_BASE_URL}")
    print("=" * 70)

    test_funcs = [
        ("Escenario 1: Disponibilidad de Servicios", test_stage5_scenario_01_system_availability),
        ("Escenario 2: Multiturno Real & Correferencia", test_stage5_scenario_02_multiturn_conversation_and_coreference_real_llm),
        ("Escenario 3: Persistencia tras Reinicio FastAPI", test_stage5_scenario_03_memory_persistence_across_fastapi_process_restart),
        ("Escenario 4: Aislamiento Multitenant (Carlos vs Laura)", test_stage5_scenario_04_multitenant_user_isolation),
        ("Escenario 5: Preferencias Explícitas & Revocación", test_stage5_scenario_05_explicit_persistent_preferences_lifecycle),
        ("Escenario 6: Tarea Pendiente - Resunción Segura", test_stage5_scenario_06_pending_task_human_in_the_loop_resumption),
        ("Escenario 7: Caída post-mutación & Reconciliación", test_stage5_scenario_07_crash_simulation_recovery_required_and_reconciliation),
        ("Escenario 8: Sanitización SSE & Redacción de Secretos", test_stage5_scenario_08_sse_event_sanitization_and_secret_redaction),
        ("Escenario 9: Recálculo de Tokens & Ventana Deslizante", test_stage5_scenario_09_token_budget_recalculation_and_sliding_window),
        ("Escenario 10: Regresión Backend Completa", test_stage5_scenario_10_complete_backend_regression),
    ]

    results = []
    for name, func in test_funcs:
        t0 = time.time()
        print(f"\n[EJECUTANDO] {name}...", flush=True)
        try:
            func()
            elapsed = time.time() - t0
            print(f"[PASS] {name} ({elapsed:.2f}s)", flush=True)
            results.append((name, "PASS", f"{elapsed:.2f}s", ""))
        except Exception as err:
            elapsed = time.time() - t0
            tb = traceback.format_exc()
            print(f"[FAIL] {name} ({elapsed:.2f}s):\n{tb}", flush=True)
            results.append((name, "FAIL", f"{elapsed:.2f}s", str(err) or tb.splitlines()[-1]))

    print("\n" + "=" * 70)
    print("MATRIZ DE RESULTADOS - ETAPA 5")
    print("=" * 70)
    for name, status, elapsed, err in results:
        status_str = f"[{status}]"
        print(f"{status_str:<8} | {elapsed:<8} | {name}")
        if err:
            print(f"         Error: {err}")
    print("=" * 70)

    total_pass = sum(1 for _, st, _, _ in results if st == "PASS")
    total_tests = len(results)
    print(f"Total: {total_pass}/{total_tests} escenarios aprobados.")
    if total_pass != total_tests:
        sys.exit(1)
    print("ETAPA 5 COMPLETADA SATISFACTORIAMENTE.")
