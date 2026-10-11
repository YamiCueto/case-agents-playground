import uuid
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import pytest
from sqlalchemy import select, text
from src.domain.enums import UserRole
from src.domain.exceptions import (
    SensitiveDataPolicyError,
    UnauthorizedActionError,
    ValidationError,
)
from src.domain.memory.entities import (
    ConversationTurn,
    DecisionRecord,
    PendingDecisionRecord,
)
from src.domain.memory.enums import (
    DecisionStatus,
    MemoryScope,
    ProvenanceType,
)
from src.domain.memory.identity import LabSimulatedIdentityResolver
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.database.models import (
    AgentConversationMessageModel,
    AgentConversationModel,
    AgentDecisionModel,
    AgentPendingTaskModel,
)
from src.infrastructure.memory.sql_conversation_memory_store import SqlConversationMemoryStore
from src.infrastructure.memory.sql_decision_memory_store import SqlDecisionMemoryStore


@pytest.fixture
def identity_carlos_and_laura():
    """Obtiene identidades de laboratorio para Carlos y Laura."""
    factory = get_app_session_factory()
    with factory() as session:
        resolver = LabSimulatedIdentityResolver(session)
        carlos = resolver.resolve("usr_carlos")
        laura = resolver.resolve("usr_laura")
        return carlos, laura


def test_conversation_turn_persistence_and_ordering(identity_carlos_and_laura):
    """
    Verifica que SqlConversationMemoryStore persiste turnos completos en MySQL,
    mantiene el orden cronológico y preserva los mensajes en pares usuario-asistente.
    """
    carlos, _ = identity_carlos_and_laura
    conv_store = SqlConversationMemoryStore()
    conv_id = f"conv-persist-{uuid.uuid4().hex[:8]}"

    try:
        # 1. Crear sesión de conversación
        session_obj = conv_store.create_or_get_conversation(
            user_id=carlos.user_id,
            subject_id=carlos.username,
            conversation_id=conv_id,
            title="Soporte de Impresora Carlos",
        )
        assert session_obj.conversation_id == conv_id
        assert session_obj.user_id == carlos.user_id
        assert session_obj.title == "Soporte de Impresora Carlos"

        # 2. Guardar Turno 1
        turn1 = ConversationTurn(
            turn_id=f"turn-1-{uuid.uuid4().hex[:6]}",
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="¿Cuál es el estado del ticket TICK-1001?",
            agent_response="El ticket TICK-1001 se encuentra abierto y asignado a soporte.",
            tokens_estimate=34,
        )
        conv_store.save_turn(turn1)

        # 3. Guardar Turno 2
        turn2 = ConversationTurn(
            turn_id=f"turn-2-{uuid.uuid4().hex[:6]}",
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="¿Quién es el técnico asignado?",
            agent_response="El técnico asignado es Juan Pérez del área de soporte.",
            tokens_estimate=28,
        )
        conv_store.save_turn(turn2)

        # 4. Recuperar conversación completa y verificar turnos
        retrieved_conv = conv_store.get_conversation(conversation_id=conv_id, user_id=carlos.user_id)
        assert retrieved_conv is not None
        assert len(retrieved_conv.turns) == 2

        assert retrieved_conv.turns[0].user_query == "¿Cuál es el estado del ticket TICK-1001?"
        assert retrieved_conv.turns[0].agent_response == "El ticket TICK-1001 se encuentra abierto y asignado a soporte."
        assert retrieved_conv.turns[1].user_query == "¿Quién es el técnico asignado?"
        assert retrieved_conv.turns[1].agent_response == "El técnico asignado es Juan Pérez del área de soporte."

        # 5. Probar límite de turnos recientes
        recent_1 = conv_store.get_recent_turns(conversation_id=conv_id, user_id=carlos.user_id, limit=1)
        assert len(recent_1) == 1
        assert recent_1[0].user_query == "¿Quién es el técnico asignado?"
    finally:
        conv_store.clear_conversation(conversation_id=conv_id, user_id=carlos.user_id)


def test_conversation_isolation_between_carlos_and_laura(identity_carlos_and_laura):
    """
    Verifica el aislamiento estricto por user_id entre Carlos y Laura:
    - Laura no puede leer la conversación de Carlos.
    - Laura no puede listar los turnos de Carlos.
    - Laura no puede eliminar la conversación de Carlos.
    - Se rechaza el acceso con UnauthorizedActionError.
    """
    carlos, laura = identity_carlos_and_laura
    conv_store = SqlConversationMemoryStore()
    carlos_conv_id = f"carlos-priv-{uuid.uuid4().hex[:8]}"
    laura_conv_id = f"laura-priv-{uuid.uuid4().hex[:8]}"

    try:
        # Carlos crea su conversación
        conv_store.create_or_get_conversation(
            user_id=carlos.user_id,
            subject_id=carlos.username,
            conversation_id=carlos_conv_id,
            title="Conversación Privada Carlos",
        )
        conv_store.save_turn(
            ConversationTurn(
                turn_id="turn-carlos",
                conversation_id=carlos_conv_id,
                user_id=carlos.user_id,
                subject_id=carlos.username,
                user_query="Mis datos privados de Carlos",
                agent_response="Respuesta solo para Carlos",
                tokens_estimate=20,
            )
        )

        # 1. Laura intenta leer la conversación de Carlos
        with pytest.raises(UnauthorizedActionError) as exc_get:
            conv_store.get_conversation(conversation_id=carlos_conv_id, user_id=laura.user_id)
        assert f"id={laura.user_id}" in str(exc_get.value)
        assert "no es propietario" in str(exc_get.value)

        # 2. Laura intenta listar los turnos de Carlos
        with pytest.raises(UnauthorizedActionError) as exc_turns:
            conv_store.get_recent_turns(conversation_id=carlos_conv_id, user_id=laura.user_id)
        assert f"id={laura.user_id}" in str(exc_turns.value)

        # 3. Laura intenta eliminar la conversación de Carlos
        with pytest.raises(UnauthorizedActionError) as exc_del:
            conv_store.clear_conversation(conversation_id=carlos_conv_id, user_id=laura.user_id)
        assert f"id={laura.user_id}" in str(exc_del.value)

        # 4. Laura intenta agregar un turno a la conversación de Carlos
        with pytest.raises(UnauthorizedActionError):
            conv_store.save_turn(
                ConversationTurn(
                    turn_id="turn-hack",
                    conversation_id=carlos_conv_id,
                    user_id=laura.user_id,
                    subject_id=laura.username,
                    user_query="Intento de inyección",
                    agent_response="No permitido",
                    tokens_estimate=15,
                )
            )

        # 5. Laura crea su propia conversación sin interferencias
        conv_store.create_or_get_conversation(
            user_id=laura.user_id,
            subject_id=laura.username,
            conversation_id=laura_conv_id,
            title="Conversación de Laura",
        )
        laura_conv = conv_store.get_conversation(conversation_id=laura_conv_id, user_id=laura.user_id)
        assert laura_conv is not None
        assert laura_conv.user_id == laura.user_id

    finally:
        conv_store.clear_conversation(carlos_conv_id, carlos.user_id)
        conv_store.clear_conversation(laura_conv_id, laura.user_id)


def test_conversation_sanitizes_secrets_before_mysql_write(identity_carlos_and_laura):
    """
    Verifica que SqlConversationMemoryStore sanitiza cualquier token, Bearer o API key
    antes de escribir en la base de datos MySQL.
    """
    carlos, _ = identity_carlos_and_laura
    conv_store = SqlConversationMemoryStore()
    conv_id = f"conv-sec-{uuid.uuid4().hex[:8]}"

    raw_api_key = "sk-proj-supersecret998877665544332211"
    raw_bearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    raw_query = f"Por favor usa mi token {raw_api_key} y autorización {raw_bearer} para conectar."
    raw_response = f"Operación registrada con clave {raw_api_key} exitosamente."

    try:
        conv_store.create_or_get_conversation(
            user_id=carlos.user_id,
            subject_id=carlos.username,
            conversation_id=conv_id,
            title="Sesión con secretos",
        )
        turn = ConversationTurn(
            turn_id="turn-secret-test",
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query=raw_query,
            agent_response=raw_response,
            tokens_estimate=40,
        )
        conv_store.save_turn(turn)

        # Inspección directa con raw SQL en MySQL
        factory = get_app_session_factory()
        with factory() as session:
            rows = session.execute(
                text("SELECT content FROM agent_conversation_messages WHERE conversation_id = :cid"),
                {"cid": conv_id},
            ).fetchall()

            assert len(rows) == 2
            for row in rows:
                content = row[0]
                # Ningún secreto en texto plano en la base de datos
                assert raw_api_key not in content, "Fallo de seguridad: la API key persistió sin sanitizar en MySQL."
                assert "eyJhbGciOi" not in content, "Fallo de seguridad: el JWT persistió sin sanitizar en MySQL."
                # Debe contener los placeholders de sanitización
                assert "***REDACTED" in content

    finally:
        conv_store.clear_conversation(conv_id, carlos.user_id)


def test_conversation_idempotency_prevents_duplicate_messages(identity_carlos_and_laura):
    """
    Verifica que la idempotencia se base exclusivamente en turn_id / request_id estable:
    1. Guardar el mismo turn_id dos veces no duplica mensajes en MySQL (reintento idempotente).
    2. Guardar turnos legítimos con contenido idéntico pero diferente turn_id NO se descarta.
    """

    carlos, _ = identity_carlos_and_laura
    conv_store = SqlConversationMemoryStore()
    conv_id = f"conv-idemp-{uuid.uuid4().hex[:8]}"

    try:
        conv_store.create_or_get_conversation(
            user_id=carlos.user_id,
            subject_id=carlos.username,
            conversation_id=conv_id,
            title="Prueba Idempotencia Estable",
        )
        turn_1 = ConversationTurn(
            turn_id="turn-estable-001",
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="¿Cuál es el estado del ticket TICK-1002?",
            agent_response="El ticket TICK-1002 se encuentra en progreso.",
            tokens_estimate=24,
        )

        # 1. Guardar por primera vez
        conv_store.save_turn(turn_1)

        # 2. Reintento de la misma solicitud con el mismo turn_id -> No debe duplicarse
        conv_store.save_turn(turn_1)

        factory = get_app_session_factory()
        with factory() as session:
            count = session.execute(
                text("SELECT COUNT(*) FROM agent_conversation_messages WHERE conversation_id = :cid"),
                {"cid": conv_id},
            ).scalar()
            assert count == 2, f"Se esperaban 2 mensajes tras reintento, pero se encontraron {count}."

        # 3. Nuevo turno legítimo con contenido IDÉNTICO pero turn_id diferente
        turn_2 = ConversationTurn(
            turn_id="turn-estable-002",
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="¿Cuál es el estado del ticket TICK-1002?",  # Contenido idéntico
            agent_response="El ticket TICK-1002 se encuentra en progreso.",  # Contenido idéntico
            tokens_estimate=24,
        )
        conv_store.save_turn(turn_2)

        # Ambos turnos legítimos deben coexistir en MySQL sin ser descartados
        with factory() as session:
            count_after = session.execute(
                text("SELECT COUNT(*) FROM agent_conversation_messages WHERE conversation_id = :cid"),
                {"cid": conv_id},
            ).scalar()
            assert count_after == 4, f"Se esperaban 4 mensajes (2 turnos legítimos), pero se encontraron {count_after}."

        # Verificar recuperación con turn_id estable
        retrieved = conv_store.get_conversation(conversation_id=conv_id, user_id=carlos.user_id)
        assert retrieved is not None
        assert len(retrieved.turns) == 2
        assert retrieved.turns[0].turn_id == "turn-estable-001"
        assert retrieved.turns[1].turn_id == "turn-estable-002"

    finally:
        conv_store.clear_conversation(conv_id, carlos.user_id)



def test_decision_persistence_and_policy_rules(identity_carlos_and_laura):
    """
    Verifica las reglas de persistencia de decisiones en SqlDecisionMemoryStore:
    1. Bloqueo de inferencias del LLM para alcance PERSISTENT.
    2. Bloqueo de decisiones persistentes sin intención explícita ni confirmación.
    3. Permisión de decisiones persistentes con confirmación explícita del operador.
    4. Upsert idempotente de preferencias activas.
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    dec_id_inferred = f"dec-inf-{uuid.uuid4().hex[:6]}"
    dec_id_no_intent = f"dec-noint-{uuid.uuid4().hex[:6]}"
    dec_id_explicit = f"dec-exp-{uuid.uuid4().hex[:6]}"

    # 1. Inferido por LLM hacia alcance PERSISTENT -> Debe rechazarse
    inferred_rec = DecisionRecord(
        decision_id=dec_id_inferred,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        scope=MemoryScope.PERSISTENT,
        key="preferred_language",
        value="es",
        rationale="El LLM dedujo que prefiere español por su nombre",
        provenance=ProvenanceType.AGENT_PROPOSED_RESOLVED,
    )
    with pytest.raises(SensitiveDataPolicyError) as exc_inf:
        decision_store.save_decision(inferred_rec)
    assert "UNAUTHORIZED_INFERRED_PREFERENCE" in str(exc_inf.value)

    # 2. Scope PERSISTENT sin confirmación explícita -> Debe rechazarse
    no_intent_rec = DecisionRecord(
        decision_id=dec_id_no_intent,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        scope=MemoryScope.PERSISTENT,
        key="ticket_sort_order",
        value="asc",
        rationale="Ordenación",
        provenance=ProvenanceType.USER_EXPLICIT,
    )
    with pytest.raises(SensitiveDataPolicyError) as exc_no_intent:
        decision_store.save_decision(no_intent_rec, explicit_user_confirmation=False)
    assert "MISSING_EXPLICIT_PREFERENCE_INTENT" in str(exc_no_intent.value)


    # 3. Scope PERSISTENT con confirmación explícita -> Debe persistirse exitosamente con version = 1
    pref_key = f"preferred_priority_{uuid.uuid4().hex[:6]}"
    explicit_rec = DecisionRecord(
        decision_id=dec_id_explicit,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        scope=MemoryScope.PERSISTENT,
        key=pref_key,
        value={"priority": "HIGH"},
        rationale="Confirmación explícita por el usuario en el panel",
        provenance=ProvenanceType.USER_EXPLICIT,
    )
    saved = decision_store.save_decision(explicit_rec, explicit_user_confirmation=True)
    assert saved.decision_id == dec_id_explicit
    assert saved.status == DecisionStatus.RESOLVED
    assert saved.version == 1
    assert saved.supersedes_decision_id is None

    try:
        # Reintento con exactamente el mismo decision_id (idempotencia inmutable) -> no debe mutar auditoría
        replayed = decision_store.save_decision(explicit_rec, explicit_user_confirmation=True)
        assert replayed.decision_id == dec_id_explicit
        assert replayed.version == 1

        # Verificar recuperación de decisión activa
        active = decision_store.get_active_decisions(user_id=carlos.user_id, subject_id=carlos.username)
        assert any(d.key == pref_key and d.value == {"priority": "HIGH"} and d.version == 1 for d in active)

        # 4. Actualización de preferencia: crea una nueva versión (v2), revoca v1 con timestamp y vincula supersedes_decision_id
        dec_id_update = f"dec-update-{uuid.uuid4().hex[:6]}"
        updated_rec = DecisionRecord(
            decision_id=dec_id_update,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            scope=MemoryScope.PERSISTENT,
            key=pref_key,
            value={"priority": "CRITICAL"},
            rationale="Actualización de preferencia explícita a crítica",
            provenance=ProvenanceType.USER_EXPLICIT,
        )
        saved_v2 = decision_store.save_decision(updated_rec, explicit_user_confirmation=True)
        assert saved_v2.decision_id == dec_id_update
        assert saved_v2.version == 2
        assert saved_v2.supersedes_decision_id == dec_id_explicit

        # Sólo la versión v2 debe estar activa
        active_after = decision_store.get_active_decisions(user_id=carlos.user_id, subject_id=carlos.username)
        matching = [d for d in active_after if d.key == pref_key]
        assert len(matching) == 1, "Debe existir exactamente 1 decisión activa tras el versionado."
        assert matching[0].value == {"priority": "CRITICAL"}
        assert matching[0].version == 2

        # 5. Trazabilidad completa mediante historial de decisiones
        history = decision_store.get_decision_history(decision_key=pref_key, user_id=carlos.user_id)
        assert len(history) == 2, f"Se esperaban 2 versiones en la auditoría, encontradas {len(history)}."
        assert history[0].version == 1
        assert history[0].decision_id == dec_id_explicit
        assert history[0].status == DecisionStatus.REVOKED
        assert history[0].revoked_at is not None
        assert history[0].value == {"priority": "HIGH"}

        assert history[1].version == 2
        assert history[1].decision_id == dec_id_update
        assert history[1].status == DecisionStatus.RESOLVED
        assert history[1].revoked_at is None
        assert history[1].supersedes_decision_id == dec_id_explicit
        assert history[1].value == {"priority": "CRITICAL"}

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_decisions WHERE decision_key = :k"),
                {"k": pref_key},
            )
            session.commit()



def test_decision_sanitizes_secrets_and_rejects_credentials(identity_carlos_and_laura):
    """
    Verifica que SqlDecisionMemoryStore rechace el almacenamiento de credenciales
    o secretos en claves y valores, y sanitice el campo rationale.
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()

    # 1. Rechazar clave con nombre de contraseña
    bad_key_rec = DecisionRecord(
        decision_id=f"dec-badkey-{uuid.uuid4().hex[:6]}",
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id="sess-badkey-1",
        scope=MemoryScope.SESSION,
        key="user_password",
        value="Password123!",
        rationale="Clave prohibida",
        provenance=ProvenanceType.USER_EXPLICIT,
    )
    with pytest.raises(SensitiveDataPolicyError) as exc_k:
        decision_store.save_decision(bad_key_rec)
    assert "SENSITIVE_KEY_NAME" in str(exc_k.value)

    # 2. Rechazar valor con cadena de conexión que expone credenciales
    bad_val_rec = DecisionRecord(
        decision_id=f"dec-badval-{uuid.uuid4().hex[:6]}",
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id="sess-badval-1",
        scope=MemoryScope.SESSION,
        key="database_url",
        value="mysql+pymysql://root:supersecret123@localhost:3306/db",
        rationale="Cadena sensible",
        provenance=ProvenanceType.USER_EXPLICIT,
    )
    with pytest.raises(SensitiveDataPolicyError) as exc_v:
        decision_store.save_decision(bad_val_rec)
    assert "CONNECTION_STRING_CREDENTIALS" in str(exc_v.value)


    # 3. Sanitizar rationale si contiene token
    dec_clean_rat_id = f"dec-rat-{uuid.uuid4().hex[:6]}"
    clean_rat_rec = DecisionRecord(
        decision_id=dec_clean_rat_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id="sess-cleanrat-1",
        scope=MemoryScope.SESSION,
        key="theme_mode",
        value="dark",
        rationale="Usuario autenticado con sk-proj-1234567890abcdef1234567890abcdef solicitó modo oscuro",
        provenance=ProvenanceType.USER_EXPLICIT,
    )

    decision_store.save_decision(clean_rat_rec)

    try:
        factory = get_app_session_factory()
        with factory() as session:
            model = session.scalar(
                select(AgentDecisionModel).where(AgentDecisionModel.decision_id == dec_clean_rat_id)
            )
            assert model is not None
            assert "sk-proj-1234567890abcdef" not in model.rationale
            assert "***REDACTED_API_KEY***" in model.rationale
    finally:
        decision_store.revoke_decision(dec_clean_rat_id, carlos.user_id)


def test_decision_isolation_and_revocation(identity_carlos_and_laura):
    """
    Verifica el aislamiento de decisiones entre Carlos y Laura:
    - Laura no ve las decisiones de Carlos.
    - Laura no puede revocar las decisiones de Carlos (UnauthorizedActionError).
    - Carlos puede revocar su propia decisión transaccionalmente.
    """
    carlos, laura = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    carlos_dec_id = f"dec-carlos-{uuid.uuid4().hex[:6]}"

    rec_carlos = DecisionRecord(
        decision_id=carlos_dec_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        scope=MemoryScope.PERSISTENT,
        key="editor_theme",
        value="solarized",
        rationale="Confirmado por Carlos",
        provenance=ProvenanceType.USER_EXPLICIT,
    )
    decision_store.save_decision(rec_carlos, explicit_user_confirmation=True)

    try:
        # 1. Laura consulta sus decisiones activas -> Debe ser vacía
        laura_decisions = decision_store.get_active_decisions(user_id=laura.user_id, subject_id=laura.username)
        assert not any(d.decision_id == carlos_dec_id for d in laura_decisions)

        # 2. Laura intenta revocar la decisión de Carlos -> UnauthorizedActionError
        with pytest.raises(UnauthorizedActionError) as exc_rev:
            decision_store.revoke_decision(decision_id=carlos_dec_id, user_id=laura.user_id)
        assert f"id={laura.user_id}" in str(exc_rev.value)
        assert "no es propietario" in str(exc_rev.value)

        # 3. Carlos revoca su propia decisión
        revoked = decision_store.revoke_decision(decision_id=carlos_dec_id, user_id=carlos.user_id)
        assert revoked is True

        # Verificar que ya no está activa
        active_after = decision_store.get_active_decisions(user_id=carlos.user_id, subject_id=carlos.username)
        assert not any(d.decision_id == carlos_dec_id for d in active_after)

        # Verificar registro en base de datos: status 'revoked' y revoked_at no nulo
        factory = get_app_session_factory()
        with factory() as session:
            model = session.scalar(
                select(AgentDecisionModel).where(AgentDecisionModel.decision_id == carlos_dec_id)
            )
            assert model is not None
            assert model.status == "revoked"
            assert model.revoked_at is not None

    finally:
        # Cleanup
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_decisions WHERE decision_id = :did"),
                {"did": carlos_dec_id},
            )
            session.commit()


def test_pending_task_atomic_acquisition_and_concurrency(identity_carlos_and_laura):
    """
    Verifica la máquina de estados y adquisición atómica condicional de tareas pendientes:
    - Transición 'pending' -> 'resolving' (acquire) o 'resolved' (resolve).
    - En caso de concurrencia, el segundo intento falla atómicamente con ValidationError.
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    task_id = f"task-atomic-{uuid.uuid4().hex[:6]}"

    pending_rec = PendingDecisionRecord(
        decision_id=task_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=f"conv-{uuid.uuid4().hex[:4]}",
        original_query="Por favor asigna el ticket a la categoría de redes",
        question="¿Desea asignar a 'Redes e Infraestructura' o 'Telefonía'?",
        options=["Redes e Infraestructura", "Telefonía"],
        target_tool_name="assign_ticket",
        pending_tool_arguments={"ticket_id": "TICK-1003"},
        missing_parameter_name="category",
    )
    decision_store.save_pending_task(pending_rec)

    try:
        # 0. Transición inválida: intentar resolver directamente desde 'pending' sin adquisición previa -> DEBE FALLAR
        with pytest.raises(ValidationError) as exc_invalid_trans:
            decision_store.atomic_resolve_task(
                decision_id=task_id,
                user_id=carlos.user_id,
                selected_value="Redes e Infraestructura",
            )
        assert "Transición de estado inválida" in str(exc_invalid_trans.value)
        assert "se encuentra en estado 'pending'" in str(exc_invalid_trans.value)

        # 1. Proceso A adquiere la tarea atómicamente ('pending' -> 'resolving')
        acquired_task = decision_store.atomic_acquire_for_resolving(
            decision_id=task_id,
            user_id=carlos.user_id,
        )
        assert acquired_task.status == DecisionStatus.RESOLVING

        # 2. Proceso B intenta adquirir la misma tarea concurrentemente -> Falla
        with pytest.raises(ValidationError) as exc_conflict:
            decision_store.atomic_acquire_for_resolving(
                decision_id=task_id,
                user_id=carlos.user_id,
            )
        assert "ya no se encuentra en estado 'pending'" in str(exc_conflict.value)

        # 3. Proceso A resuelve la tarea tras ejecución ('resolving' -> 'resolved')
        resolved_task = decision_store.atomic_resolve_task(
            decision_id=task_id,
            user_id=carlos.user_id,
            selected_value="Redes e Infraestructura",
        )
        assert resolved_task.status == DecisionStatus.RESOLVED
        assert resolved_task.selected_value == "Redes e Infraestructura"
        assert resolved_task.resolved_at is not None

        # 4. Proceso B intenta resolver la tarea nuevamente -> Falla
        with pytest.raises(ValidationError) as exc_already_res:
            decision_store.atomic_resolve_task(
                decision_id=task_id,
                user_id=carlos.user_id,
                selected_value="Telefonía",
            )
        assert "Transición de estado inválida" in str(exc_already_res.value)

    finally:

        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"),
                {"did": task_id},
            )
            session.commit()


def test_pending_task_isolation_and_sanitization(identity_carlos_and_laura):
    """
    Verifica que las tareas pendientes saniticen argumentos sensibles (ej. contraseñas)
    y mantengan aislamiento estricto por user_id frente a otros usuarios.
    """
    carlos, laura = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    task_id = f"task-sec-{uuid.uuid4().hex[:6]}"

    pending_rec = PendingDecisionRecord(
        decision_id=task_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id="sess-carlos-sec",
        conversation_id="conv-carlos-sec",
        original_query="Configurar contraseña de router con secret_key_123",
        question="Confirme la clave",
        options=["Confirmar", "Cancelar"],
        target_tool_name="configure_network_device",
        pending_tool_arguments={
            "device_id": "RTR-01",
            "admin_password": "supersecretpassword123!",
            "auth_token": "sk-proj-999888777666",
            "custom_note": "Conectar usando sk-proj-111222333444555666777888",
        },
        missing_parameter_name="confirmation",
    )
    decision_store.save_pending_task(pending_rec)

    try:
        # 1. Comprobar sanitización en base de datos
        factory = get_app_session_factory()
        with factory() as session:
            model = session.scalar(
                select(AgentPendingTaskModel).where(AgentPendingTaskModel.decision_id == task_id)
            )
            assert model is not None
            assert model.pending_tool_arguments["admin_password"] == "***REDACTED***"
            assert model.pending_tool_arguments["auth_token"] == "***REDACTED***"
            assert "***REDACTED_API_KEY***" in model.pending_tool_arguments["custom_note"]


        # 2. Laura intenta leer la tarea de Carlos -> UnauthorizedActionError
        with pytest.raises(UnauthorizedActionError) as exc_read:
            decision_store.get_pending_task(decision_id=task_id, user_id=laura.user_id)
        assert f"id={laura.user_id}" in str(exc_read.value)

        # 3. Laura intenta cancelar la tarea de Carlos -> UnauthorizedActionError
        with pytest.raises(UnauthorizedActionError) as exc_cancel:
            decision_store.cancel_pending_task(decision_id=task_id, user_id=laura.user_id)
        assert f"id={laura.user_id}" in str(exc_cancel.value)

        # 4. Carlos cancela su propia tarea -> Exitoso
        cancelled = decision_store.cancel_pending_task(decision_id=task_id, user_id=carlos.user_id)
        assert cancelled is True

        # Verificar estado en MySQL
        with factory() as session:
            model_after = session.scalar(
                select(AgentPendingTaskModel).where(AgentPendingTaskModel.decision_id == task_id)
            )
            assert model_after.status == "cancelled"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"),
                {"did": task_id},
            )
            session.commit()


def test_transactional_rollback_on_failure(identity_carlos_and_laura):
    """
    Verifica que las operaciones transaccionales apliquen rollback automático ante errores,
    evitando escrituras parciales o registros huérfanos.
    """
    carlos, _ = identity_carlos_and_laura
    conv_store = SqlConversationMemoryStore()
    conv_id = f"conv-rollback-{uuid.uuid4().hex[:8]}"

    # Turno con tokens_estimate inválido o foreign key inexistente que fuerce error
    invalid_turn = ConversationTurn(
        turn_id="turn-fail",
        conversation_id=conv_id,
        user_id=999999,  # user_id que no existe en tabla users
        subject_id="usuario_fantasma",
        user_query="Consulta que debe fallar",
        agent_response="Respuesta que no debe persistir",
        tokens_estimate=10,
    )

    with pytest.raises(Exception):
        conv_store.save_turn(invalid_turn)

    # Verificar que no quedó ningún registro en agent_conversations ni agent_conversation_messages
    factory = get_app_session_factory()
    with factory() as session:
        conv_in_db = session.scalar(
            select(AgentConversationModel).where(AgentConversationModel.conversation_id == conv_id)
        )
        assert conv_in_db is None

        msgs_count = session.execute(
            text("SELECT COUNT(*) FROM agent_conversation_messages WHERE conversation_id = :cid"),
            {"cid": conv_id},
        ).scalar()
        assert msgs_count == 0


def test_persistence_recovery_after_session_restart(identity_carlos_and_laura):
    """
    Verifica que los datos persisten de manera duradera en MySQL y se recuperan intactos
    después de cerrar completamente la sesión SQLAlchemy y reiniciar una nueva conexión.
    """
    carlos, _ = identity_carlos_and_laura
    conv_id = f"conv-restart-{uuid.uuid4().hex[:8]}"
    dec_id = f"dec-restart-{uuid.uuid4().hex[:6]}"

    # Sesión 1: Escribir datos
    conv_store_1 = SqlConversationMemoryStore()
    conv_store_1.create_or_get_conversation(
        user_id=carlos.user_id,
        subject_id=carlos.username,
        conversation_id=conv_id,
        title="Sesión Antes de Reinicio",
    )
    conv_store_1.save_turn(
        ConversationTurn(
            turn_id="turn-restart-1",
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="Recuerda que mi impresora es HP LaserJet",
            agent_response="Entendido, registraré tu modelo de impresora HP LaserJet.",
            tokens_estimate=30,
        )
    )

    dec_store_1 = SqlDecisionMemoryStore()
    dec_store_1.save_decision(
        DecisionRecord(
            decision_id=dec_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            scope=MemoryScope.PERSISTENT,
            key="printer_model",
            value="HP LaserJet",
            rationale="Preferencia explícita persistente",
            provenance=ProvenanceType.USER_EXPLICIT,
        ),
        explicit_user_confirmation=True,
    )

    # Cerrar referencias / Simular nuevo contexto de sesión SQLAlchemy
    del conv_store_1
    del dec_store_1

    # Sesión 2: Crear nuevas instancias y recuperar desde MySQL
    conv_store_2 = SqlConversationMemoryStore()
    dec_store_2 = SqlDecisionMemoryStore()

    try:
        # 1. Recuperar conversación y turnos desde MySQL
        recovered_conv = conv_store_2.get_conversation(conversation_id=conv_id, user_id=carlos.user_id)
        assert recovered_conv is not None
        assert recovered_conv.title == "Sesión Antes de Reinicio"
        assert len(recovered_conv.turns) == 1
        assert recovered_conv.turns[0].user_query == "Recuerda que mi impresora es HP LaserJet"
        assert recovered_conv.turns[0].agent_response == "Entendido, registraré tu modelo de impresora HP LaserJet."

        # 2. Recuperar decisión desde MySQL
        active_decisions = dec_store_2.get_active_decisions(user_id=carlos.user_id, subject_id=carlos.username)
        matching = [d for d in active_decisions if d.decision_id == dec_id]
        assert len(matching) == 1
        assert matching[0].key == "printer_model"
        assert matching[0].value == "HP LaserJet"

    finally:
        conv_store_2.clear_conversation(conversation_id=conv_id, user_id=carlos.user_id)
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_decisions WHERE decision_id = :did"),
                {"did": dec_id},
            )
            session.commit()


def test_concurrent_turn_insertion_and_race_conditions(identity_carlos_and_laura):
    """
    Verifica comportamiento bajo concurrencia y tormenta de reintentos:
    1. Tormenta de reintentos: 5 hilos intentan guardar simultáneamente el MISMO turn_id.
       - La restricción UNIQUE y la idempotencia deben manejarlo limpiamente sin errores al caller.
       - Exactamente 1 par de mensajes (user + assistant) debe quedar en la base de datos.
    2. Turnos independientes concurrentes: 5 hilos guardan turnos con distintos turn_id.
       - Todos se insertan y conservan correctamente.
    """
    carlos, _ = identity_carlos_and_laura
    conv_id = f"conv-conc-{uuid.uuid4().hex[:8]}"
    conv_store = SqlConversationMemoryStore()

    try:
        conv_store.create_or_get_conversation(
            user_id=carlos.user_id,
            subject_id=carlos.username,
            conversation_id=conv_id,
            title="Prueba Concurrencia Turnos",
        )

        # 1. Tormenta de reintentos concurrentes con el mismo turn_id
        storm_turn_id = f"turn-storm-{uuid.uuid4().hex[:6]}"
        turn_storm = ConversationTurn(
            turn_id=storm_turn_id,
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="Consulta reintentada concurrentemente",
            agent_response="Respuesta consistente del agente",
            tokens_estimate=20,
        )

        def worker_save_storm():
            local_store = SqlConversationMemoryStore()
            local_store.save_turn(turn_storm)
            return True

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(worker_save_storm) for _ in range(5)]
            results = [f.result() for f in as_completed(futures)]

        assert len(results) == 5
        assert all(r is True for r in results)

        factory = get_app_session_factory()
        with factory() as session:
            count = session.execute(
                text("SELECT COUNT(*) FROM agent_conversation_messages WHERE conversation_id = :cid AND turn_id = :tid"),
                {"cid": conv_id, "tid": storm_turn_id},
            ).scalar()
            assert count == 2, f"Se esperaban exactamente 2 mensajes para la tormenta de reintentos, pero se encontraron {count}."

        # 2. Inserción concurrente de turnos legítimos con distintos turn_id
        def worker_save_unique(idx: int):
            local_store = SqlConversationMemoryStore()
            turn = ConversationTurn(
                turn_id=f"turn-uniq-{idx}-{uuid.uuid4().hex[:4]}",
                conversation_id=conv_id,
                user_id=carlos.user_id,
                subject_id=carlos.username,
                user_query=f"Consulta única {idx}",
                agent_response=f"Respuesta única {idx}",
                tokens_estimate=15,
            )
            local_store.save_turn(turn)
            return turn.turn_id

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(worker_save_unique, i) for i in range(5)]
            turn_ids = [f.result() for f in as_completed(futures)]

        assert len(turn_ids) == 5

        with factory() as session:
            total_count = session.execute(
                text("SELECT COUNT(*) FROM agent_conversation_messages WHERE conversation_id = :cid"),
                {"cid": conv_id},
            ).scalar()
            # 2 mensajes de la tormenta + 10 mensajes de los 5 turnos concurrentes = 12 mensajes
            assert total_count == 12, f"Se esperaban 12 mensajes en total, pero se encontraron {total_count}."

    finally:
        conv_store.clear_conversation(conv_id, carlos.user_id)


def test_concurrent_pending_task_acquisition_race(identity_carlos_and_laura):
    """
    Verifica que ante adquisición concurrente ('pending' -> 'resolving') de la misma tarea:
    - Exactamente 1 hilo gana la adquisición atómica condicional.
    - Los demás 4 hilos son rechazados atómicamente con ValidationError.
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    task_id = f"task-race-{uuid.uuid4().hex[:6]}"

    pending_rec = PendingDecisionRecord(
        decision_id=task_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=f"conv-{uuid.uuid4().hex[:4]}",
        original_query="Escalar ticket al tier 3",
        question="Confirme el equipo de soporte",
        options=["Tier 3 Cloud", "Tier 3 On-Prem"],
        target_tool_name="escalate_ticket",
        pending_tool_arguments={"ticket_id": "TICK-1004"},
        missing_parameter_name="tier",
    )
    decision_store.save_pending_task(pending_rec)

    try:
        successes = []
        failures = []

        def acquire_worker():
            local_store = SqlDecisionMemoryStore()
            try:
                task = local_store.atomic_acquire_for_resolving(
                    decision_id=task_id,
                    user_id=carlos.user_id,
                )
                return ("SUCCESS", task)
            except ValidationError as e:
                return ("FAILED", str(e))

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(acquire_worker) for _ in range(5)]
            for f in as_completed(futures):
                status, payload = f.result()
                if status == "SUCCESS":
                    successes.append(payload)
                else:
                    failures.append(payload)

        # Exactamente 1 ganador
        assert len(successes) == 1, f"Se esperaba exactamente 1 ganador, pero hubo {len(successes)}."
        assert successes[0].status == DecisionStatus.RESOLVING

        # Exactamente 4 perdedores con mensaje de que ya no está en estado 'pending'
        assert len(failures) == 4, f"Se esperaban 4 rechazos, pero hubo {len(failures)}."
        for err_msg in failures:
            assert "ya no se encuentra en estado 'pending'" in err_msg

        # El ganador procede a resolver la tarea exitosamente tras ejecución
        resolved = decision_store.atomic_resolve_task(
            decision_id=task_id,
            user_id=carlos.user_id,
            selected_value="Tier 3 Cloud",
        )
        assert resolved.status == DecisionStatus.RESOLVED
        assert resolved.selected_value == "Tier 3 Cloud"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"),
                {"did": task_id},
            )
            session.commit()


def test_pending_task_failure_recovery_flow(identity_carlos_and_laura):
    """
    Verifica el ciclo de recuperación ante fallos durante la ejecución de tareas:
    1. Transición inválida directa ('pending' -> 'resolved') es rechazada.
    2. Adquisición obligatoria ('pending' -> 'resolving').
    3. Si la herramienta falla, transición a 'failed' mediante atomic_fail_task.
    4. Tarea fallida no puede resolverse ('failed' -> 'resolved' debe fallar).
    5. Auditoría del fallo queda persistida en MySQL.
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    task_id = f"task-fail-rec-{uuid.uuid4().hex[:6]}"

    pending_rec = PendingDecisionRecord(
        decision_id=task_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=f"conv-{uuid.uuid4().hex[:4]}",
        original_query="Reasignar ticket con herramienta remota",
        question="Seleccione la región",
        options=["US-EAST", "EU-CENTRAL"],
        target_tool_name="remote_ticket_dispatcher",
        pending_tool_arguments={"ticket_id": "TICK-1005"},
        missing_parameter_name="region",
    )
    decision_store.save_pending_task(pending_rec)

    try:
        # 1. Transición inválida directa desde pending
        with pytest.raises(ValidationError) as exc_invalid:
            decision_store.atomic_resolve_task(
                decision_id=task_id,
                user_id=carlos.user_id,
                selected_value="US-EAST",
            )
        assert "Transición de estado inválida" in str(exc_invalid.value)
        assert "se encuentra en estado 'pending'" in str(exc_invalid.value)

        # 2. Adquirir tarea para resolución
        acquired = decision_store.atomic_acquire_for_resolving(
            decision_id=task_id,
            user_id=carlos.user_id,
        )
        assert acquired.status == DecisionStatus.RESOLVING

        # 3. Simular fallo de ejecución de herramienta y recuperación a estado 'failed'
        failed_task = decision_store.atomic_fail_task(
            decision_id=task_id,
            user_id=carlos.user_id,
            reason="Timeout de 30s al conectar al servicio remoto",
        )
        assert failed_task.status == DecisionStatus.FAILED
        assert failed_task.resolved_at is not None

        # 4. Intentar resolver una tarea fallida debe rechazarse
        with pytest.raises(ValidationError) as exc_failed_res:
            decision_store.atomic_resolve_task(
                decision_id=task_id,
                user_id=carlos.user_id,
                selected_value="US-EAST",
            )
        assert "Transición de estado inválida" in str(exc_failed_res.value)
        assert "no está en estado 'resolving'" in str(exc_failed_res.value)

        # 5. Verificar estado en base de datos MySQL
        factory = get_app_session_factory()
        with factory() as session:
            model = session.scalar(
                select(AgentPendingTaskModel).where(AgentPendingTaskModel.decision_id == task_id)
            )
            assert model is not None
            assert model.status == "failed"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"),
                {"did": task_id},
            )
            session.commit()


def test_preference_versioning_and_superseding_chain(identity_carlos_and_laura):
    """
    Verifica la trazabilidad inmutable de preferencias con cadena de versiones y revocación:
    - Versión 1 creada inicialmente (status=resolved, version=1, supersedes=None).
    - Versión 2 actualiza la preferencia (v1 revocada con timestamp, v2 activa con version=2, supersedes=v1).
    - Versión 3 actualiza la preferencia nuevamente (v2 revocada con timestamp, v3 activa con version=3, supersedes=v2).
    - get_decision_history retorna la cadena cronológica inmutable completa.
    - get_active_decisions retorna exclusivamente la versión activa más reciente (v3).
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    pref_key = f"pref_channel_{uuid.uuid4().hex[:6]}"

    dec_id_v1 = f"dec-ch-v1-{uuid.uuid4().hex[:6]}"
    dec_id_v2 = f"dec-ch-v2-{uuid.uuid4().hex[:6]}"
    dec_id_v3 = f"dec-ch-v3-{uuid.uuid4().hex[:6]}"

    try:
        # 1. Versión 1
        rec_v1 = DecisionRecord(
            decision_id=dec_id_v1,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            scope=MemoryScope.PERSISTENT,
            key=pref_key,
            value="EMAIL",
            rationale="Preferencia inicial canal correo",
            provenance=ProvenanceType.USER_EXPLICIT,
        )
        saved_1 = decision_store.save_decision(rec_v1, explicit_user_confirmation=True)
        assert saved_1.version == 1
        assert saved_1.status == DecisionStatus.RESOLVED
        assert saved_1.supersedes_decision_id is None

        # 2. Versión 2
        rec_v2 = DecisionRecord(
            decision_id=dec_id_v2,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            scope=MemoryScope.PERSISTENT,
            key=pref_key,
            value="SMS",
            rationale="Cambio de preferencia a SMS",
            provenance=ProvenanceType.USER_EXPLICIT,
        )
        saved_2 = decision_store.save_decision(rec_v2, explicit_user_confirmation=True)
        assert saved_2.version == 2
        assert saved_2.status == DecisionStatus.RESOLVED
        assert saved_2.supersedes_decision_id == dec_id_v1

        # 3. Versión 3
        rec_v3 = DecisionRecord(
            decision_id=dec_id_v3,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            scope=MemoryScope.PERSISTENT,
            key=pref_key,
            value="PUSH_NOTIFICATION",
            rationale="Cambio final a notificaciones Push",
            provenance=ProvenanceType.USER_EXPLICIT,
        )
        saved_3 = decision_store.save_decision(rec_v3, explicit_user_confirmation=True)
        assert saved_3.version == 3
        assert saved_3.status == DecisionStatus.RESOLVED
        assert saved_3.supersedes_decision_id == dec_id_v2

        # 4. get_active_decisions debe retornar únicamente la versión activa (v3)
        active_list = decision_store.get_active_decisions(user_id=carlos.user_id, subject_id=carlos.username)
        active_pref = [d for d in active_list if d.key == pref_key]
        assert len(active_pref) == 1, "Debe haber exactamente 1 decisión activa."
        assert active_pref[0].decision_id == dec_id_v3
        assert active_pref[0].version == 3
        assert active_pref[0].value == "PUSH_NOTIFICATION"

        # 5. get_decision_history debe retornar la auditoría completa de 3 versiones ordenadas
        history = decision_store.get_decision_history(decision_key=pref_key, user_id=carlos.user_id)
        assert len(history) == 3, f"Se esperaban 3 versiones en el historial, pero se obtuvieron {len(history)}."

        # Verificación versión 1 (revocada)
        assert history[0].decision_id == dec_id_v1
        assert history[0].version == 1
        assert history[0].value == "EMAIL"
        assert history[0].status == DecisionStatus.REVOKED
        assert history[0].revoked_at is not None
        assert history[0].supersedes_decision_id is None

        # Verificación versión 2 (revocada, supersedes v1)
        assert history[1].decision_id == dec_id_v2
        assert history[1].version == 2
        assert history[1].value == "SMS"
        assert history[1].status == DecisionStatus.REVOKED
        assert history[1].revoked_at is not None
        assert history[1].supersedes_decision_id == dec_id_v1

        # Verificación versión 3 (resuelta, activa, supersedes v2)
        assert history[2].decision_id == dec_id_v3
        assert history[2].version == 3
        assert history[2].value == "PUSH_NOTIFICATION"
        assert history[2].status == DecisionStatus.RESOLVED
        assert history[2].revoked_at is None
        assert history[2].supersedes_decision_id == dec_id_v2

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_decisions WHERE decision_key = :k"),
                {"k": pref_key},
            )
            session.commit()


def test_aud01_concurrent_initial_creation_guarantees_single_active_version(identity_carlos_and_laura):
    """
    AUD-01: Garantiza exactamente una versión activa por clave lógica de preferencia,
    incluso en creación inicial concurrente.
    
    Verifica:
    - 6 hilos concurrentes intentan crear la primera versión de la misma preferencia (sin filas previas en MySQL).
    - El candado físico único uq_active_decision_lock (active_lock_key) junto al bucle de reintento
      garantiza que todas las transacciones completan con éxito.
    - Exactamente 1 versión queda como activa (status='resolved', active_lock_key no nulo).
    - Las demás 5 versiones quedan revocadas (status='revoked', active_lock_key nulo, revoked_at no nulo).
    - Se conserva la totalidad del historial inmutable (6 versiones encadenadas).
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    pref_key = f"pref_locale_{uuid.uuid4().hex[:6]}"
    locales = ["es_CO", "en_US", "pt_BR", "fr_FR", "de_DE", "ja_JP"]

    def worker_create(locale_val: str) -> DecisionRecord:
        dec_id = f"dec-loc-{locale_val}-{uuid.uuid4().hex[:4]}"
        rec = DecisionRecord(
            decision_id=dec_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            scope=MemoryScope.PERSISTENT,
            key=pref_key,
            value=locale_val,
            rationale=f"Configuración regional concurrente {locale_val}",
            provenance=ProvenanceType.USER_EXPLICIT,
        )
        return decision_store.save_decision(rec, explicit_user_confirmation=True)

    try:
        # Ejecución simultánea con ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = [executor.submit(worker_create, loc) for loc in locales]
            results = [f.result() for f in as_completed(futures)]

        assert len(results) == 6

        # 1. Verificar directamente en MySQL mediante SQL crudo
        factory = get_app_session_factory()
        with factory() as session:
            rows = session.execute(
                text("SELECT id, decision_id, version, status, active_lock_key, revoked_at FROM agent_decisions WHERE decision_key = :k ORDER BY version ASC"),
                {"k": pref_key},
            ).fetchall()

            assert len(rows) == 6, f"Se esperaban 6 versiones en la base de datos, se encontraron {len(rows)}"

            active_rows = [r for r in rows if r.active_lock_key is not None]
            assert len(active_rows) == 1, f"AUD-01 VIOLADO: Se encontraron {len(active_rows)} filas activas simultáneas."
            assert active_rows[0].status == "resolved"
            assert active_rows[0].revoked_at is None

            revoked_rows = [r for r in rows if r.active_lock_key is None]
            assert len(revoked_rows) == 5
            for r in revoked_rows:
                assert r.status == "revoked"
                assert r.revoked_at is not None

        # 2. Verificar vía API del repositorio
        active_decisions = decision_store.get_active_decisions(user_id=carlos.user_id, subject_id=carlos.username)
        matching = [d for d in active_decisions if d.key == pref_key]
        assert len(matching) == 1, "get_active_decisions debe retornar exactamente 1 versión."
        assert matching[0].version == 6

        history = decision_store.get_decision_history(decision_key=pref_key, user_id=carlos.user_id)
        assert len(history) == 6, "El historial inmutable completo debe contener todas las 6 versiones."
        for idx, h in enumerate(history, start=1):
            assert h.version == idx
            if idx < 6:
                assert h.status == DecisionStatus.REVOKED
                assert h.revoked_at is not None
            else:
                assert h.status == DecisionStatus.RESOLVED
                assert h.revoked_at is None

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_decisions WHERE decision_key = :k"),
                {"k": pref_key},
            )
            session.commit()


def test_aud02_conversation_turn_multi_sequence_and_idempotency_contract(identity_carlos_and_laura):
    """
    AUD-02: Revisa el contrato de mensajes persistidos.
    - Soporta secuencias multi-mensaje por turno (user, tool, tool, assistant) sin colisión por rol.
    - Idempotencia estricta por turn_id estable (reintentar el mismo turno no duplica mensajes).
    - Preserva turnos legítimos repetidos con idéntico texto cuando tienen diferente turn_id.
    """
    carlos, _ = identity_carlos_and_laura
    conv_store = SqlConversationMemoryStore()
    conv_id = f"conv-aud02-{uuid.uuid4().hex[:6]}"

    try:
        conv_store.create_or_get_conversation(
            user_id=carlos.user_id,
            subject_id=carlos.username,
            conversation_id=conv_id,
            title="Prueba Contrato AUD-02",
        )

        # 1. Probar soporte de secuencias multi-mensaje en agent_conversation_messages
        # (ej. múltiples mensajes de herramientas o asistente dentro del mismo turno)
        turn_multi_id = f"turn-seq-{uuid.uuid4().hex[:6]}"
        factory = get_app_session_factory()
        with factory() as session:
            m0 = AgentConversationMessageModel(
                conversation_id=conv_id,
                turn_id=turn_multi_id,
                sequence_id=0,
                role="user",
                content="Consultar tickets abiertos",
                tokens_count=10,
            )
            m1 = AgentConversationMessageModel(
                conversation_id=conv_id,
                turn_id=turn_multi_id,
                sequence_id=1,
                role="tool",
                content="Llamada a get_tickets(status='OPEN')",
                tokens_count=15,
            )
            m2 = AgentConversationMessageModel(
                conversation_id=conv_id,
                turn_id=turn_multi_id,
                sequence_id=2,
                role="tool",
                content="Resultado: [TICK-1001, TICK-1002]",
                tokens_count=20,
            )
            m3 = AgentConversationMessageModel(
                conversation_id=conv_id,
                turn_id=turn_multi_id,
                sequence_id=3,
                role="assistant",
                content="Tienes 2 tickets abiertos: TICK-1001 y TICK-1002.",
                tokens_count=18,
            )
            session.add_all([m0, m1, m2, m3])
            session.commit()

        # Verificar que los 4 mensajes coexisten bajo la restricción uq_conv_turn_seq
        with factory() as session:
            rows = session.execute(
                text("SELECT sequence_id, role, content FROM agent_conversation_messages WHERE turn_id = :tid ORDER BY sequence_id ASC"),
                {"tid": turn_multi_id},
            ).fetchall()
            assert len(rows) == 4
            assert [r.role for r in rows] == ["user", "tool", "tool", "assistant"]
            assert [r.sequence_id for r in rows] == [0, 1, 2, 3]

        # 2. Probar idempotencia por turn_id
        stable_turn_id = f"turn-idemp-{uuid.uuid4().hex[:6]}"
        turn_obj = ConversationTurn(
            turn_id=stable_turn_id,
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="¿Cuál es el horario de atención?",
            agent_response="El horario de atención es de 8:00 AM a 6:00 PM.",
            tokens_estimate=25,
        )
        # Primer guardado
        conv_store.save_turn(turn_obj)

        # Reintento idéntico (simulación de reintento de red o cliente)
        conv_store.save_turn(turn_obj)
        conv_store.save_turn(turn_obj)

        with factory() as session:
            idemp_rows = session.execute(
                text("SELECT id, role, sequence_id FROM agent_conversation_messages WHERE turn_id = :tid"),
                {"tid": stable_turn_id},
            ).fetchall()
            assert len(idemp_rows) == 2, "Idempotencia fallida: se duplicaron los mensajes para el mismo turn_id."

        # 3. Probar que turnos con contenido idéntico pero distinto turn_id SÍ se persisten
        # (no se suprimen turnos legítimos repetidos)
        second_identical_turn = ConversationTurn(
            turn_id=f"turn-second-{uuid.uuid4().hex[:6]}",
            conversation_id=conv_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            user_query="¿Cuál es el horario de atención?",
            agent_response="El horario de atención es de 8:00 AM a 6:00 PM.",
            tokens_estimate=25,
        )
        conv_store.save_turn(second_identical_turn)

        retrieved = conv_store.get_conversation(conv_id, carlos.user_id)
        assert retrieved is not None
        # Debe contener: el turno stable_turn_id y el segundo turno idéntico
        queries = [t.user_query for t in retrieved.turns]
        assert queries.count("¿Cuál es el horario de atención?") == 2

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_conversation_messages WHERE conversation_id = :cid"),
                {"cid": conv_id},
            )
            session.execute(
                text("DELETE FROM agent_conversations WHERE conversation_id = :cid"),
                {"cid": conv_id},
            )
            session.commit()


def test_aud04_task_lease_expiration_and_recovery_required_state(identity_carlos_and_laura):
    """
    AUD-04: Implementa un mecanismo de recuperación de tareas en resolving mediante lease,
    vencimiento y estado de recuperación.
    Nunca reejecuta automáticamente una mutación cuyo resultado sea incierto.
    
    Verifica:
    1. Worker-1 adquiere tarea con lease y vencimiento explícito.
    2. Worker-2 no puede adquirir la tarea mientras el lease está vigente.
    3. Si el lease expira (simulando timeout o caída de Worker-1), atomic_reclaim_expired_task
       transiciona la tarea a 'recovery_required' con motivo documentado.
    4. En estado 'recovery_required', se rechaza la adquisición ciega y se bloquea atomic_resolve_task.
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()
    task_id = f"task-lease-{uuid.uuid4().hex[:6]}"

    pending_rec = PendingDecisionRecord(
        decision_id=task_id,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=f"conv-{uuid.uuid4().hex[:4]}",
        original_query="Escalar ticket con proveedor externo",
        question="Confirmar escalamiento",
        options=["SI", "NO"],
        target_tool_name="escalate_ticket",
        pending_tool_arguments={"ticket_id": "TICK-1002"},
        missing_parameter_name="confirm",
    )
    decision_store.save_pending_task(pending_rec)

    try:
        # 1. Worker-1 adquiere con lease de 2 segundos
        acquired = decision_store.atomic_acquire_for_resolving(
            decision_id=task_id,
            user_id=carlos.user_id,
            lease_owner="worker-cluster-node-1",
            lease_seconds=2,
        )
        assert acquired.status == DecisionStatus.RESOLVING
        assert acquired.lease_owner == "worker-cluster-node-1"
        assert acquired.lease_expires_at is not None

        # 2. Worker-2 intenta adquirir simultáneamente -> Rechazado
        with pytest.raises(ValidationError) as exc_acquire:
            decision_store.atomic_acquire_for_resolving(
                decision_id=task_id,
                user_id=carlos.user_id,
                lease_owner="worker-cluster-node-2",
            )
        assert "ya no se encuentra en estado 'pending'" in str(exc_acquire.value)

        # 3. Simular expiración de lease actualizando lease_expires_at al pasado en MySQL
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("UPDATE agent_pending_tasks SET lease_expires_at = NOW() - INTERVAL 10 SECOND WHERE decision_id = :did"),
                {"did": task_id},
            )
            session.commit()

        # 4. Proceso reaper/monitor detecta lease vencido y ejecuta atomic_reclaim_expired_task
        reclaimed = decision_store.atomic_reclaim_expired_task(
            decision_id=task_id,
            user_id=carlos.user_id,
        )
        assert reclaimed.status == DecisionStatus.RECOVERY_REQUIRED
        assert reclaimed.lease_owner is None
        assert reclaimed.lease_expires_at is None
        assert "Lease expirado" in reclaimed.recovery_reason

        # 5. Intentos de resolver ciegamente o re-adquirir deben ser bloqueados
        with pytest.raises(ValidationError) as exc_blind_resolve:
            decision_store.atomic_resolve_task(
                decision_id=task_id,
                user_id=carlos.user_id,
                selected_value="SI",
            )
        assert "no está en estado 'resolving'" in str(exc_blind_resolve.value)

        with pytest.raises(ValidationError) as exc_blind_acquire:
            decision_store.atomic_acquire_for_resolving(
                decision_id=task_id,
                user_id=carlos.user_id,
            )
        assert "ya no se encuentra en estado 'pending'" in str(exc_blind_acquire.value)

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"),
                {"did": task_id},
            )
            session.commit()


def test_aud05_mutative_tool_checkpointing_and_explicit_reconciliation(identity_carlos_and_laura):
    """
    AUD-05: Estrategia de idempotencia de extremo a extremo para herramientas mutativas.
    - Registro de execution_checkpoint antes de invocar la mutación remota.
    - Ante caída o lease vencido, el estado recovery_required exige reconciliación antes de reintentar:
      a) Caso Éxito Externo Confirmado: reconcile_and_resolve marca la tarea como resuelta.
      b) Caso Ausencia de Mutación Confirmada: reconcile_and_reset_to_pending restablece a pending de forma segura.
    """
    carlos, _ = identity_carlos_and_laura
    decision_store = SqlDecisionMemoryStore()

    # --- Escenario A: Reconciliación con Éxito (reconcile_and_resolve) ---
    task_id_a = f"task-rec-res-{uuid.uuid4().hex[:6]}"
    task_a = PendingDecisionRecord(
        decision_id=task_id_a,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=f"conv-{uuid.uuid4().hex[:4]}",
        original_query="Cerrar ticket con API externa",
        question="Confirmar cierre",
        options=["SI", "NO"],
        target_tool_name="close_ticket_api",
        pending_tool_arguments={"ticket_id": "TICK-1003"},
        missing_parameter_name="confirm",
    )
    decision_store.save_pending_task(task_a)

    try:
        # 1. Adquisición y registro de checkpoint
        decision_store.atomic_acquire_for_resolving(task_id_a, carlos.user_id, lease_seconds=1)
        checkpoint_data = {
            "tool": "close_ticket_api",
            "external_idempotency_key": f"idem-key-{uuid.uuid4().hex[:8]}",
            "attempted_at": datetime.now(timezone.utc).isoformat(),
            "payload": {"ticket_id": "TICK-1003", "reason": "Resuelto"},
        }
        decision_store.record_execution_checkpoint(task_id_a, carlos.user_id, checkpoint_data)

        # 2. Expirar lease y recuperar a recovery_required
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("UPDATE agent_pending_tasks SET lease_expires_at = NOW() - INTERVAL 5 SECOND WHERE decision_id = :did"),
                {"did": task_id_a},
            )
            session.commit()

        decision_store.atomic_reclaim_expired_task(task_id_a, carlos.user_id)

        # 3. Operador o proceso de reconciliación comprueba la API externa y confirma que la mutación SÍ se ejecutó
        reconciled_a = decision_store.reconcile_and_resolve(
            decision_id=task_id_a,
            user_id=carlos.user_id,
            selected_value="SI",
            reconciliation_note="Inspección remota confirmó ticket TICK-1003 cerrado con idempotency_key.",
        )
        assert reconciled_a.status == DecisionStatus.RESOLVED
        assert reconciled_a.selected_value == "SI"
        assert "Reconciliado con éxito" in reconciled_a.recovery_reason
        assert reconciled_a.execution_checkpoint["tool"] == "close_ticket_api"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"),
                {"did": task_id_a},
            )
            session.commit()

    # --- Escenario B: Reconciliación con Rearmado (reconcile_and_reset_to_pending) ---
    task_id_b = f"task-rec-rst-{uuid.uuid4().hex[:6]}"
    task_b = PendingDecisionRecord(
        decision_id=task_id_b,
        user_id=carlos.user_id,
        subject_id=carlos.username,
        session_id=f"sess-{uuid.uuid4().hex[:4]}",
        conversation_id=f"conv-{uuid.uuid4().hex[:4]}",
        original_query="Asignar especialista",
        question="Seleccionar especialista",
        options=["JUAN", "MARIA"],
        target_tool_name="assign_specialist",
        pending_tool_arguments={"ticket_id": "TICK-1004"},
        missing_parameter_name="specialist",
    )
    decision_store.save_pending_task(task_b)

    try:
        # 1. Adquisición y registro de checkpoint
        decision_store.atomic_acquire_for_resolving(task_id_b, carlos.user_id, lease_seconds=1)
        checkpoint_data_b = {
            "tool": "assign_specialist",
            "external_idempotency_key": f"idem-key-{uuid.uuid4().hex[:8]}",
            "network_status": "connection_timeout_before_payload_sent",
        }
        decision_store.record_execution_checkpoint(task_id_b, carlos.user_id, checkpoint_data_b)

        # 2. Expirar lease y transicionar a recovery_required
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("UPDATE agent_pending_tasks SET lease_expires_at = NOW() - INTERVAL 5 SECOND WHERE decision_id = :did"),
                {"did": task_id_b},
            )
            session.commit()

        decision_store.atomic_reclaim_expired_task(task_id_b, carlos.user_id)

        # 3. Operador o reconciliador verifica que la petición falló antes de enviarse al especialista:
        reconciled_b = decision_store.reconcile_and_reset_to_pending(
            decision_id=task_id_b,
            user_id=carlos.user_id,
            reconciliation_note="Verificado que el proveedor nunca recibió la petición. Seguro para reintentar.",
        )
        assert reconciled_b.status == DecisionStatus.PENDING
        assert "Reconciliado y rearmado" in reconciled_b.recovery_reason
        assert reconciled_b.lease_owner is None
        assert reconciled_b.lease_expires_at is None

        # 4. Ahora la tarea puede ser legítimamente re-adquirida y resuelta
        re_acquired = decision_store.atomic_acquire_for_resolving(
            decision_id=task_id_b,
            user_id=carlos.user_id,
            lease_owner="worker-retry-node-3",
        )
        assert re_acquired.status == DecisionStatus.RESOLVING

        final_res = decision_store.atomic_resolve_task(
            decision_id=task_id_b,
            user_id=carlos.user_id,
            selected_value="MARIA",
        )
        assert final_res.status == DecisionStatus.RESOLVED
        assert final_res.selected_value == "MARIA"

    finally:
        factory = get_app_session_factory()
        with factory() as session:
            session.execute(
                text("DELETE FROM agent_pending_tasks WHERE decision_id = :did"),
                {"did": task_id_b},
            )
            session.commit()


