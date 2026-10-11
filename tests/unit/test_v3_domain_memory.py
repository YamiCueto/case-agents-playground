import sys
import pytest
from src.domain.exceptions import (
    DomainError,
    QueryExceedsTokenBudgetError,
    ValidationError,
)
from src.domain.memory.entities import (
    ConversationSession,
    ConversationTurn,
    DecisionRecord,
    PendingDecisionRecord,
)
from src.domain.memory.enums import (
    DecisionStatus,
    MemoryMessageRole,
    MemoryScope,
    ProvenanceType,
)
from src.domain.memory.policy import (
    MemoryPolicy,
    PolicyEvaluationResult,
    calculate_shannon_entropy,
)
from src.domain.memory.token_budget import TokenBudgetManager


# ===========================================================================
# 1. PRUEBAS DE ENTIDADES Y ENUMERACIONES DE DOMINIO
# ===========================================================================

def test_conversation_turn_creation_and_invariants():
    """Valida la creación correcta de ConversationTurn y sus invariantes de dominio."""
    turn = ConversationTurn(
        turn_id="turn-001",
        conversation_id="conv-100",
        user_id=1,
        subject_id="usr_carlos",
        user_query="¿Cuál es el estado de TICK-1001?",
        agent_response="El ticket se encuentra OPEN.",
        tokens_estimate=25,
    )
    assert turn.turn_id == "turn-001"
    assert turn.user_id == 1
    assert turn.subject_id == "usr_carlos"
    assert turn.tokens_estimate == 25

    # Invariantes: user_query no puede ser vacío
    with pytest.raises(ValidationError):
        ConversationTurn(
            turn_id="turn-002",
            conversation_id="conv-100",
            user_id=1,
            subject_id="usr_carlos",
            user_query="",
            agent_response="Respuesta",
        )

    # Invariantes: user_id debe ser positivo
    with pytest.raises(ValidationError):
        ConversationTurn(
            turn_id="turn-003",
            conversation_id="conv-100",
            user_id=-5,
            subject_id="usr_carlos",
            user_query="Consulta",
            agent_response="Respuesta",
        )


def test_conversation_session_aggregate():
    """Valida el agregado de sesión conversacional y la adición de turnos."""
    session = ConversationSession(
        conversation_id="conv-200",
        user_id=1,
        subject_id="usr_carlos",
        title="Sesión de Incidentes",
    )
    assert session.total_turns == 0

    turn1 = ConversationTurn(
        turn_id="t1",
        conversation_id="conv-200",
        user_id=1,
        subject_id="usr_carlos",
        user_query="Consulta 1",
        agent_response="Respuesta 1",
    )
    session.add_turn(turn1)
    assert session.total_turns == 1

    # Rechazar turno perteneciente a otra conversación
    foreign_turn = ConversationTurn(
        turn_id="t2",
        conversation_id="conv-OTHER",
        user_id=1,
        subject_id="usr_carlos",
        user_query="Consulta 2",
        agent_response="Respuesta 2",
    )
    with pytest.raises(ValidationError):
        session.add_turn(foreign_turn)


def test_decision_record_lifecycle_and_revocation():
    """Valida el ciclo de vida de una decisión y su capacidad de revocación explícita."""
    dec = DecisionRecord(
        decision_id="dec-101",
        user_id=1,
        subject_id="usr_carlos",
        scope=MemoryScope.PERSISTENT,
        key="preferred_carrier",
        value="Servientrega",
        rationale="Declaración explícita de preferencia por el usuario",
        provenance=ProvenanceType.USER_EXPLICIT,
    )
    assert dec.is_active is True
    assert dec.status == DecisionStatus.RESOLVED
    assert dec.revoked_at is None

    # Revocar decisión
    dec.revoke()
    assert dec.is_active is False
    assert dec.status == DecisionStatus.REVOKED
    assert dec.revoked_at is not None

    # Invariante: scope SESSION exige session_id
    with pytest.raises(ValidationError):
        DecisionRecord(
            decision_id="dec-102",
            user_id=1,
            subject_id="usr_carlos",
            scope=MemoryScope.SESSION,
            session_id=None,
            key="temp_key",
            value="val",
            rationale="rationale",
            provenance=ProvenanceType.TOOL_OBSERVATION,
        )


def test_pending_decision_record_lifecycle_and_merge():
    """Valida la pausa, transición a resolving y fusión de argumentos al resolverse."""
    pending = PendingDecisionRecord(
        decision_id="pdec-500",
        user_id=1,
        subject_id="usr_carlos",
        session_id="sess-alpha",
        conversation_id="conv-beta",
        original_query="Asigna el ticket TICK-1002",
        question="¿A cuál cuadrilla deseas asignarlo?",
        options=["Nivel 2", "Infraestructura Cloud"],
        target_tool_name="update_ticket",
        pending_tool_arguments={"ticket_code": "TICK-1002"},
        missing_parameter_name="assignee",
        required_role="AGENT",
    )
    assert pending.is_pending is True

    # No se pueden obtener argumentos combinados mientras esté pendiente
    with pytest.raises(ValidationError):
        pending.get_merged_arguments()

    # Transición atómica a resolving
    pending.mark_resolving()
    assert pending.status == DecisionStatus.RESOLVING

    # Resolver con opción seleccionada
    pending.resolve("Nivel 2")
    assert pending.status == DecisionStatus.RESOLVED
    assert pending.selected_value == "Nivel 2"
    assert pending.resolved_at is not None

    # Fusión limpia de argumentos
    merged = pending.get_merged_arguments()
    assert merged == {"ticket_code": "TICK-1002", "assignee": "Nivel 2"}


# ===========================================================================
# 2. PRUEBAS DE SEGURIDAD Y SANITIZACIÓN EN MEMORY POLICY
# ===========================================================================

def test_memory_policy_detects_secrets():
    """Verifica la detección de JWT, Bearer tokens, credenciales en URLs y private keys."""
    jwt_example = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozG4m1p"
    assert MemoryPolicy.detect_secret_pattern(jwt_example) == "JWT_TOKEN"

    bearer_example = "Bearer 1234567890abcdef1234567890"
    assert MemoryPolicy.detect_secret_pattern(bearer_example) == "BEARER_TOKEN"

    conn_example = "mysql+pymysql://root:SuperSecretPass123!@localhost:3306/db"
    assert MemoryPolicy.detect_secret_pattern(conn_example) == "CONNECTION_STRING_CREDENTIALS"

    privkey_example = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----"
    assert MemoryPolicy.detect_secret_pattern(privkey_example) == "PRIVATE_KEY"

    api_key_example = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
    assert MemoryPolicy.detect_secret_pattern(api_key_example) == "API_KEY_KNOWN_PREFIX"


def test_memory_policy_shannon_entropy_detection():
    """Verifica que cadenas aleatorias de alta entropía sean detectadas como secretos."""
    high_entropy_secret = "K9xP2vL8mQ4zW1yT5jR7bC3dF6hN"  # Random mixed-case alphanumeric string
    assert calculate_shannon_entropy(high_entropy_secret) >= 4.5
    assert MemoryPolicy.detect_secret_pattern(high_entropy_secret) == "HIGH_ENTROPY_RANDOM_SECRET"

    natural_spanish_text = "Esta es una oración normal en español sin secretos"
    assert calculate_shannon_entropy(natural_spanish_text) < 4.5


def test_memory_policy_sanitizes_payloads():
    """Verifica que sanitize_payload redacte recursivamente secretos y campos sensibles."""
    payload = {
        "user": "usr_carlos",
        "password": "MySecretPassword123",
        "api_key": "sk-live-12345678901234567890",
        "config": {
            "token": "secret_token_value",
            "url": "postgres://admin:pass123@db.internal:5432/tickets",
        },
        "public_note": "Nota sin secretos para el ticket TICK-1001",
    }
    sanitized = MemoryPolicy.sanitize_payload(payload)
    assert sanitized["user"] == "usr_carlos"
    assert sanitized["password"] == "***REDACTED***"
    assert sanitized["api_key"] == "***REDACTED***"
    assert sanitized["config"]["token"] == "***REDACTED***"
    assert "***REDACTED_PASSWORD***@" in sanitized["config"]["url"]
    assert sanitized["public_note"] == "Nota sin secretos para el ticket TICK-1001"


def test_memory_policy_preserves_token_budget_metrics_while_sanitizing_secrets():
    """
    REQUISITO CRÍTICO FASE 6.4 (Context Budget):
    Preservar métricas numéricas seguras de presupuesto de contexto (query_tokens,
    system_prompt_tokens, decisions_tokens, history_tokens, total_initial_tokens,
    available_history_budget, tokens_estimate, etc.) sin redactarlas a ***REDACTED***,
    mientras se bloquean de manera estricta contraseñas, tokens de autenticación (auth_token,
    access_token, token, bearer) y credenciales reales.
    """
    stats_payload = {
        "query_tokens": 42,
        "system_prompt_tokens": 180,
        "decisions_tokens": 30,
        "history_tokens": 150,
        "total_initial_tokens": 402,
        "available_history_budget": 800,
        "tokens_estimate": 25,
        "history_turns_count": 3,
        "decisions_count": 1,
        "max_context_budget": 4096,
        "password": "db_super_password_123",
        "auth_token": "secret_oauth_token",
        "access_token": "sk-proj-super-secret-token",
        "api_key": "AIzaSyD-secret-api-key",
        "token": "raw_auth_token",
        "nested": {
            "query_tokens": 10,
            "secret": "very_secret",
            "bearer_token": "Bearer abc123xyz789",
        },
    }

    sanitized = MemoryPolicy.sanitize_payload(stats_payload)

    # Métricas preservadas numéricamente
    assert sanitized["query_tokens"] == 42
    assert sanitized["system_prompt_tokens"] == 180
    assert sanitized["decisions_tokens"] == 30
    assert sanitized["history_tokens"] == 150
    assert sanitized["total_initial_tokens"] == 402
    assert sanitized["available_history_budget"] == 800
    assert sanitized["tokens_estimate"] == 25
    assert sanitized["history_turns_count"] == 3
    assert sanitized["decisions_count"] == 1
    assert sanitized["max_context_budget"] == 4096
    assert sanitized["nested"]["query_tokens"] == 10

    # Secretos rigurosamente redactados
    assert sanitized["password"] == "***REDACTED***"
    assert sanitized["auth_token"] == "***REDACTED***"
    assert sanitized["access_token"] == "***REDACTED***"
    assert sanitized["api_key"] == "***REDACTED***"
    assert sanitized["token"] == "***REDACTED***"
    assert sanitized["nested"]["secret"] == "***REDACTED***"
    assert sanitized["nested"]["bearer_token"] == "***REDACTED***"


# ===========================================================================
# 3. PRUEBAS DE AUTORIZACIÓN DE PERSISTENCIA Y NO EXTRAPOLACIÓN DE LLM
# ===========================================================================

def test_memory_policy_blocks_llm_inferred_preferences():
    """
    REQUISITO CRÍTICO:
    El modelo nunca puede inventar o deducir una preferencia y persistirla como PERSISTENT.
    Solo procedencia USER_EXPLICIT es autorizada para scope PERSISTENT.
    """
    # 1. El LLM sugiere una preferencia -> RECHAZADA
    res_llm = MemoryPolicy.evaluate_decision_persistence(
        key="preferred_priority",
        value="CRITICAL",
        scope=MemoryScope.PERSISTENT,
        provenance=ProvenanceType.AGENT_PROPOSED_RESOLVED,
        user_query="Crea un ticket",
    )
    assert res_llm.is_allowed is False
    assert res_llm.detected_violation == "UNAUTHORIZED_INFERRED_PREFERENCE"

    # 2. Una observación de herramienta intenta fijar preferencia persistente -> RECHAZADA
    res_tool = MemoryPolicy.evaluate_decision_persistence(
        key="preferred_carrier",
        value="Servientrega",
        scope=MemoryScope.PERSISTENT,
        provenance=ProvenanceType.TOOL_OBSERVATION,
        user_query="Consulta el envío",
    )
    assert res_tool.is_allowed is False
    assert res_tool.detected_violation == "UNAUTHORIZED_INFERRED_PREFERENCE"

    # 3. Usuario sin frase de intención explícita -> RECHAZADA
    res_vague = MemoryPolicy.evaluate_decision_persistence(
        key="preferred_priority",
        value="HIGH",
        scope=MemoryScope.PERSISTENT,
        provenance=ProvenanceType.USER_EXPLICIT,
        user_query="Por favor ponle prioridad alta a este ticket.",
    )
    assert res_vague.is_allowed is False
    assert res_vague.detected_violation == "MISSING_EXPLICIT_PREFERENCE_INTENT"

    # 4. Usuario con frase explícita ('prioriza siempre') -> APROBADA
    res_valid = MemoryPolicy.evaluate_decision_persistence(
        key="preferred_priority",
        value="HIGH",
        scope=MemoryScope.PERSISTENT,
        provenance=ProvenanceType.USER_EXPLICIT,
        user_query="Para todos mis futuros pedidos, prioriza siempre Servientrega.",
    )
    assert res_valid.is_allowed is True
    assert res_valid.sanitized_value == "HIGH"


def test_memory_policy_blocks_secrets_in_decision_values():
    """Verifica que si una decisión intenta guardar un token o password, sea bloqueada."""
    res = MemoryPolicy.evaluate_decision_persistence(
        key="db_password",
        value="postgres://admin:pass123@db:5432/db",
        scope=MemoryScope.SESSION,
        provenance=ProvenanceType.USER_EXPLICIT,
    )
    assert res.is_allowed is False


# ===========================================================================
# 4. PRUEBAS DE TOKEN BUDGET MANAGER
# ===========================================================================

def test_token_budget_manager_validates_user_query_no_silent_truncation():
    """
    REQUISITO CRÍTICO:
    No truncar silenciosamente la consulta del usuario.
    Si excede el límite asignado, levantar QueryExceedsTokenBudgetError con detalles.
    """
    manager = TokenBudgetManager(max_user_query_tokens=50)

    # Consulta normal cabe sin problemas
    tokens = manager.validate_user_query("Consulta el ticket TICK-1001")
    assert tokens > 0 and tokens <= 50

    # Consulta gigantesca que excede el límite de 50 tokens
    huge_query = "Por favor investiga el problema con el ticket " * 20
    with pytest.raises(QueryExceedsTokenBudgetError) as exc_info:
        manager.validate_user_query(huge_query)

    assert exc_info.value.max_tokens == 50
    assert exc_info.value.estimated_tokens > 50
    assert "excede el presupuesto máximo asignado" in str(exc_info.value)


def test_token_budget_manager_configurable_from_provider():
    """Verifica que el límite de contexto se tome de la configuración del proveedor."""
    class MockCustomProvider:
        max_context_tokens = 16384

    manager = TokenBudgetManager.from_provider_config(provider=MockCustomProvider())
    assert manager.total_context_limit == 16384

    # Default a 4096 si el proveedor no tiene atributo específico
    manager_default = TokenBudgetManager.from_provider_config(provider=None)
    assert manager_default.total_context_limit == 4096


def test_token_budget_manager_history_sliding_window():
    """Valida que la selección de turnos previos respete el presupuesto sin cortar turnos a la mitad."""
    manager = TokenBudgetManager(
        total_context_limit=4096,
        output_reserve=800,
        tools_schemas_reserve=600,
        system_prompt_reserve=350,
        loop_margin_reserve=850,
    )
    # Presupuesto disponible para contexto previo = 4096 - (800+600+350+850) - 100(mem) - 100(query)
    # = 4096 - 2600 - 200 = 1296 tokens
    available_budget = manager.calculate_available_history_budget(
        active_memory_tokens=100,
        user_query_tokens=100,
    )
    assert available_budget == 1296

    # Crear lista de 5 turnos de 400 tokens cada uno
    turns = [
        ConversationTurn(
            turn_id=f"t_{i}",
            conversation_id="c1",
            user_id=1,
            subject_id="usr_carlos",
            user_query=f"Pregunta {i}",
            agent_response=f"Respuesta {i}",
            tokens_estimate=400,
        )
        for i in range(1, 6)
    ]

    # Con 1296 tokens solo caben 3 turnos completos (3 * 400 = 1200 <= 1296)
    selected = manager.select_history_turns(turns, available_budget=available_budget)
    assert len(selected) == 3
    # Deben ser los 3 turnos más recientes: t_3, t_4, t_5 en orden cronológico
    assert [t.turn_id for t in selected] == ["t_3", "t_4", "t_5"]


def test_token_budget_manager_truncates_large_tool_observation():
    """
    REQUISITO CRÍTICO:
    Definir qué sucede cuando una observación de herramienta supera el presupuesto disponible:
    Se trunca de forma estructurada conservando metadatos sin desbordar el contexto.
    """
    manager = TokenBudgetManager(max_observation_tokens=80)

    # Observación grande con lista de 50 tickets
    large_obs = {
        "status": "success",
        "tool_name": "list_tickets",
        "data": [{"code": f"TICK-{1000+i}", "title": f"Incidente número {i}"} for i in range(50)],
    }

    truncated = manager.truncate_tool_observation(large_obs)
    assert truncated.get("_budget_truncated") is True
    assert "_omitted_items_count" in truncated
    assert len(truncated["data"]) < 50
    assert truncated["status"] == "success"
    assert truncated["tool_name"] == "list_tickets"


# ===========================================================================
# 5. INDEPENDENCIA DEL DOMINIO DE FRAMEWORKS
# ===========================================================================

def test_domain_memory_is_framework_agnostic():
    """Verifica que el dominio no dependa de SQLAlchemy, FastAPI ni Angular."""
    import src.domain.memory.entities as ent
    import src.domain.memory.policy as pol
    import src.domain.memory.token_budget as tb

    modules = [ent, pol, tb]
    for mod in modules:
        for imported_name, mod_obj in mod.__dict__.items():
            if hasattr(mod_obj, "__name__"):
                mod_name = mod_obj.__name__
                assert "sqlalchemy" not in mod_name, f"Violación de Clean Architecture: {mod_name} importado en {mod.__name__}"
                assert "fastapi" not in mod_name, f"Violación de Clean Architecture: {mod_name} importado en {mod.__name__}"
