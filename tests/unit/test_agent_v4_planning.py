import pytest
from src.agents.v4_planning.events import (
    event_v4_plan_blocked,
    event_v4_plan_completed,
    event_v4_plan_generated,
    event_v4_plan_revision_created,
    event_v4_plan_validated,
    event_v4_replanning_triggered,
    event_v4_step_completed,
    event_v4_step_failed,
    event_v4_step_started,
)
from src.agents.v4_planning.executor import (
    execute_model_step,
    execute_runtime_step,
    execute_tool_step,
    set_simulate_deployment_service_down,
)
from src.agents.v4_planning.mock_planner import (
    MockPlanner,
    StallMockPlanner,
)
from src.agents.v4_planning.orchestrator import (
    AgentV4Orchestrator,
    run_agent_v4,
)
from src.agents.v4_planning.state import AgentV4ExecutionState
from src.domain.planning.entities import Plan, PlanStep
from src.domain.planning.enums import StepExecutor, StepStatus
from src.domain.planning.validator import PlanValidator, PlanValidationError


# ===========================================================================
# 1. PRUEBAS DE VALIDACIÓN ESTRUCTURAL (VALIDATION-TIME FAILURES)
# ===========================================================================

def test_plan_validator_rejects_empty_goal():
    plan = Plan(goal="   ", steps=[PlanStep(id="S1", action="act", description="desc")])
    with pytest.raises(PlanValidationError, match="carece de una meta"):
        PlanValidator.validate(plan)


def test_plan_validator_rejects_empty_steps():
    plan = Plan(goal="Meta válida", steps=[])
    with pytest.raises(PlanValidationError, match="al menos un paso"):
        PlanValidator.validate(plan)


def test_plan_validator_rejects_empty_step_id():
    plan = Plan(
        goal="Meta válida",
        steps=[PlanStep(id="", action="act", description="desc")]
    )
    with pytest.raises(PlanValidationError, match="sin identificador unívoco"):
        PlanValidator.validate(plan)


def test_plan_validator_rejects_duplicate_step_ids():
    plan = Plan(
        goal="Meta válida",
        steps=[
            PlanStep(id="S1", action="act1", description="desc1"),
            PlanStep(id="S1", action="act2", description="desc2"),
        ]
    )
    with pytest.raises(PlanValidationError, match="Identificador de paso duplicado: 'S1'"):
        PlanValidator.validate(plan)


def test_plan_validator_rejects_nonexistent_dependency():
    plan = Plan(
        goal="Meta válida",
        steps=[
            PlanStep(id="S1", action="act1", description="desc1", depends_on=["S99"]),
        ]
    )
    with pytest.raises(PlanValidationError, match="depende de un paso inexistente: 'S99'"):
        PlanValidator.validate(plan)


def test_plan_validator_rejects_self_dependency():
    plan = Plan(
        goal="Meta válida",
        steps=[
            PlanStep(id="S1", action="act1", description="desc1", depends_on=["S1"]),
        ]
    )
    with pytest.raises(PlanValidationError, match="tiene auto-dependencia"):
        PlanValidator.validate(plan)


def test_plan_validator_rejects_static_cycle_in_dag():
    # Grafo cíclico: C1 -> C2 -> C1
    plan = Plan(
        goal="Meta con ciclo estático",
        steps=[
            PlanStep(id="C1", action="act1", description="Paso 1", executor=StepExecutor.RUNTIME, depends_on=["C2"]),
            PlanStep(id="C2", action="act2", description="Paso 2", executor=StepExecutor.RUNTIME, depends_on=["C1"]),
        ]
    )
    with pytest.raises(PlanValidationError, match="Ciclo estático detectado"):
        PlanValidator.validate(plan)


def test_plan_validator_rejects_three_node_static_cycle():
    # Grafo cíclico: C1 -> C2 -> C3 -> C1
    plan = Plan(
        goal="Meta con ciclo de 3 nodos",
        steps=[
            PlanStep(id="C1", action="act1", description="Paso 1", depends_on=["C3"]),
            PlanStep(id="C2", action="act2", description="Paso 2", depends_on=["C1"]),
            PlanStep(id="C3", action="act3", description="Paso 3", depends_on=["C2"]),
        ]
    )
    with pytest.raises(PlanValidationError, match="Ciclo estático detectado"):
        PlanValidator.validate(plan)


# ===========================================================================
# 2. PRUEBAS DE SEMÁNTICA ESTRICTA DE SKIPPED E INMUTABILIDAD DE SNAPSHOTS
# ===========================================================================

def test_skipped_semantic_unjustified_does_not_complete_plan():
    plan = Plan(
        goal="Auditoría",
        steps=[
            PlanStep(id="S1", action="act1", description="Paso 1", status=StepStatus.COMPLETED),
            PlanStep(id="S2", action="act2", description="Paso 2", status=StepStatus.SKIPPED, required=True, skip_reason=None),
        ]
    )
    assert plan.is_completed is False, "Paso required omitido sin skip_reason formal NO debe completar el plan"


def test_skipped_semantic_justified_completes_plan():
    plan = Plan(
        goal="Auditoría",
        steps=[
            PlanStep(id="S1", action="act1", description="Paso 1", status=StepStatus.COMPLETED),
            PlanStep(
                id="S2",
                action="act2",
                description="Paso 2",
                status=StepStatus.SKIPPED,
                required=True,
                skip_reason="Sustituido formalmente por S2b en Revisión 2",
            ),
        ]
    )
    assert plan.is_completed is True, "Paso con skip_reason formal autorizado sí satisface la completitud derivada"


def test_plan_clone_creates_independent_snapshot():
    step1 = PlanStep(id="S1", action="act1", description="desc1", status=StepStatus.COMPLETED)
    original = Plan(goal="Meta original", steps=[step1], revision=1)

    snapshot = original.clone()
    assert snapshot.goal == original.goal
    assert snapshot.revision == 1
    assert snapshot.steps[0].id == "S1"

    # Modificar clon no afecta al original
    snapshot.revision = 2
    snapshot.steps[0].status = StepStatus.FAILED
    assert original.revision == 1
    assert original.steps[0].status == StepStatus.COMPLETED


# ===========================================================================
# 3. CASO G1: STRUCTURED PLANNING (Meta de 4 pasos dependientes)
# ===========================================================================

def test_caso_g1_structured_planning_success():
    set_simulate_deployment_service_down(False)
    planner = MockPlanner()

    state = run_agent_v4(
        goal="Auditar incidentes recientes y correlacionar con último despliegue",
        planner=planner,
    )

    assert state.termination_reason == "plan_completed"
    assert state.current_plan is not None
    assert state.current_plan.is_completed is True
    assert state.current_plan.revision == 1
    assert len(state.plan_history) == 0, "No debe haber replanes en ejecución limpia G1"
    assert len(state.current_plan.steps) == 4

    step_ids = [s.id for s in state.current_plan.steps]
    assert step_ids == ["S1", "S2", "S3", "S4"]
    assert all(s.status == StepStatus.COMPLETED for s in state.current_plan.steps)

    # Verificar que S3 se ejecutó después de S1 y S2 y correlacionó los datos
    s3 = next(s for s in state.current_plan.steps if s.id == "S3")
    assert s3.observation is not None
    assert s3.observation.get("correlation_found") is True
    assert s3.observation.get("suspect_deployment") == "v3.1.2"

    # Verificar recomendación final sintetizada en S4
    s4 = next(s for s in state.current_plan.steps if s.id == "S4")
    assert s4.observation is not None
    assert "rollback" in s4.observation.get("recommendation", "").lower()


# ===========================================================================
# 4. CASO G2: REPLANNING CON HISTORIAL E INVARIANTE DE META
# ===========================================================================

def test_caso_g2_replanning_and_goal_invariant():
    set_simulate_deployment_service_down(True)
    planner = MockPlanner()

    state = run_agent_v4(
        goal="Auditar incidentes recientes y correlacionar con último despliegue",
        planner=planner,
    )

    try:
        # 1. Terminación exitosa final tras replanning adaptativo
        assert state.termination_reason == "plan_completed"
        assert state.current_plan is not None
        assert state.current_plan.is_completed is True

        # 2. Conservación del historial (Revisión 1)
        assert len(state.plan_history) == 1, "Debe existir exactamente 1 snapshot archivado en plan_history"
        rev1 = state.plan_history[0]
        assert rev1.revision == 1, "El snapshot archivado debe ser la Revisión 1"

        step_s1_r1 = next(s for s in rev1.steps if s.id == "S1")
        step_s2_r1 = next(s for s in rev1.steps if s.id == "S2")
        assert step_s1_r1.status == StepStatus.COMPLETED, "En Revisión 1 S1 debe figurar completado"
        assert step_s2_r1.status == StepStatus.FAILED, "En Revisión 1 S2 debe figurar fallido"

        # 3. Revisión 2 activa
        rev2 = state.current_plan
        assert rev2.revision == 2, "El plan activo debe ser la Revisión 2"
        assert "S2b" in [s.id for s in rev2.steps], "Revisión 2 debe incluir el paso alternativo S2b"

        step_s1_r2 = next(s for s in rev2.steps if s.id == "S1")
        step_s2_r2 = next(s for s in rev2.steps if s.id == "S2")
        step_s2b_r2 = next(s for s in rev2.steps if s.id == "S2b")

        assert step_s1_r2.status == StepStatus.COMPLETED, "S1 no debe haberse re-ejecutado"
        assert step_s2_r2.status == StepStatus.SKIPPED, "S2 debe figurar como SKIPPED justificado en Revisión 2"
        assert step_s2_r2.skip_reason is not None
        assert step_s2b_r2.status == StepStatus.COMPLETED, "S2b debió ejecutarse y completarse exitosamente"

        # 4. Invariante estricto de meta
        assert rev1.goal == rev2.goal, "INVARIANTE VIOLADA: El replanning alteró la meta original"
    finally:
        set_simulate_deployment_service_down(False)


# ===========================================================================
# 5. CASO G3: RUNTIME STALL / no_executable_steps
# ===========================================================================

def test_caso_g3_runtime_stall_no_executable_steps():
    stall_planner = StallMockPlanner()

    state = run_agent_v4(
        goal="Auditoría con herramienta heredada no recuperable",
        planner=stall_planner,
    )

    # 1. Detección limpia de bloqueo durante ejecución
    assert state.termination_reason == "no_executable_steps"
    assert state.current_plan is not None
    assert state.current_plan.is_completed is False

    # 2. Paso 1 completado, Paso 2 fallido, Paso 3 permanece PENDING sin ejecutarse
    s1 = next(s for s in state.current_plan.steps if s.id == "S1")
    s2 = next(s for s in state.current_plan.steps if s.id == "S2")
    s3 = next(s for s in state.current_plan.steps if s.id == "S3")

    assert s1.status == StepStatus.COMPLETED
    assert s2.status == StepStatus.FAILED
    assert s3.status == StepStatus.PENDING, "S3 debió quedar PENDING porque sus dependencias nunca se cumplieron"
    assert s3.observation is None, "S3 nunca debió ejecutarse"


# ===========================================================================
# 6. OBSERVABILIDAD SSE STREAMING DE AGENT V4
# ===========================================================================

def test_agent_v4_stream_observability():
    import asyncio

    async def _collect():
        orchestrator = AgentV4Orchestrator(planner=MockPlanner())
        evts = []
        async for evt in orchestrator.run_stream(
            query="Auditar incidentes recientes y correlacionar con último despliegue",
            user_persona="usr_carlos",
        ):
            evts.append(evt)
        return evts

    events = asyncio.run(_collect())

    types = [e.type for e in events]
    assert "USER_REQUEST" in types
    assert "MEMORY_HYDRATED" in types
    assert "PLAN_GENERATED" in types
    assert "PLAN_VALIDATED" in types
    assert "STEP_STARTED" in types
    assert "STEP_COMPLETED" in types
    assert "PLAN_COMPLETED" in types
    assert "FINAL_SYNTHESIS" in types
    assert "RUN_COMPLETED" in types

    # Validar que todos los eventos tienen agent_version="v4"
    for e in events:
        assert e.agent_version == "v4"


# ===========================================================================
# 7. PRUEBAS DE ACEPTACIÓN HOTFIX AGENT V4 (LIVE A, LIVE B, NEGATIVOS C Y D)
# ===========================================================================

def test_hotfix_live_a_ticket_especifico_diagnostico_y_plan():
    """
    Caso Live A: 'Diagnosticar ticket TICK-1001 y proponer plan'
    Verifica:
    - Plan generado con herramientas reales (get_ticket_by_id con ticket_code='TICK-1001')
    - Validación semántica previa PASS
    - Ejecución real contra MySQL (TICK-1001)
    - Observaciones fácticas y respuesta sintetizada grounded
    - PLAN_COMPLETED alcanzado limpiamente sin no_executable_steps
    """
    planner = MockPlanner()
    goal = "Diagnosticar ticket TICK-1001 y proponer plan"
    plan = planner.create_plan(goal)

    # 1. Validación semántica y estructural
    PlanValidator.validate(plan)
    assert plan.steps[0].action == "get_ticket_by_id"
    assert plan.steps[0].arguments == {"ticket_code": "TICK-1001"}
    assert plan.steps[1].action == "analyze_ticket_data"
    assert plan.steps[2].action == "synthesize_response"

    # 2. Ejecución con orchestrator
    orchestrator = AgentV4Orchestrator(planner=planner)
    state = orchestrator.run(goal=goal, user_persona="usr_carlos")

    # 3. Verificación de terminación exitosa
    assert state.status.value == "completed"
    assert state.termination_reason == "plan_completed"
    assert state.current_plan.is_completed is True
    assert len(state.plan_history) == 0, "No debe haber replanning en ejecución exitosa"

    # 4. Verificación de evidencia real recuperada de MySQL
    s1 = next(s for s in state.current_plan.steps if s.id == "S1")
    assert s1.status == StepStatus.COMPLETED
    assert s1.observation is not None
    assert s1.observation.get("status") == "success"
    data = s1.observation.get("data")
    assert data["code"] == "TICK-1001"
    assert "Bloqueo" in data["title"]
    assert data["status"] == "OPEN"
    assert data["priority"] == "HIGH"

    # 5. Verificación de respuesta final grounded
    assert "TICK-1001" in state.final_answer
    assert "Plan de Acción" in state.final_answer


def test_hotfix_live_b_tickets_vencidos_sla():
    """
    Caso Live B: 'Identifica los tickets vencidos según SLA'
    Verifica que se utilice la herramienta autorizada identify_overdue_tickets y complete exitosamente.
    """
    planner = MockPlanner()
    goal = "Identifica los tickets vencidos según SLA"
    plan = planner.create_plan(goal)

    PlanValidator.validate(plan)
    assert plan.steps[0].action == "identify_overdue_tickets"

    orchestrator = AgentV4Orchestrator(planner=planner)
    state = orchestrator.run(goal=goal, user_persona="usr_carlos")

    assert state.status.value == "completed"
    assert state.termination_reason == "plan_completed"
    assert state.current_plan.is_completed is True


def test_hotfix_negativo_c_rechazo_herramienta_inexistente_antes_de_ejecutar():
    """
    Caso Negativo C: Un plan con action='get_customer_tickets' debe ser rechazado
    por PlanValidator ANTES de ejecutar cualquier paso con código de error 'unknown_tool'.
    """
    plan = Plan(
        goal="Diagnosticar ticket TICK-1001 y proponer plan",
        steps=[
            PlanStep(
                id="S1",
                action="get_customer_tickets",
                description="Herramienta ficticia no existente",
                executor=StepExecutor.TOOL,
                depends_on=[],
                required=True,
            ),
        ],
        revision=1,
    )

    with pytest.raises(PlanValidationError) as exc_info:
        PlanValidator.validate(plan)

    err_str = str(exc_info.value)
    assert "unknown_tool:" in err_str
    assert "get_customer_tickets" in err_str


def test_hotfix_negativo_d_rechazo_argumentos_invalidos_pydantic():
    """
    Caso Negativo D: Un plan con get_ticket_by_id pero sin argumentos requeridos (ticket_code)
    debe ser rechazado por PlanValidator con 'invalid_tool_arguments'.
    """
    plan = Plan(
        goal="Diagnosticar ticket",
        steps=[
            PlanStep(
                id="S1",
                action="get_ticket_by_id",
                description="Consulta sin ticket_code",
                executor=StepExecutor.TOOL,
                arguments={},  # Falta ticket_code requerido
                depends_on=[],
                required=True,
            ),
        ],
        revision=1,
    )

    with pytest.raises(PlanValidationError) as exc_info:
        PlanValidator.validate(plan)

    err_str = str(exc_info.value)
    assert "invalid_tool_arguments:" in err_str


def test_hotfix_streaming_rechaza_plan_invalido_sin_emitir_plan_validated():
    """
    Verifica que en streaming un plan con herramienta inexistente emita VALIDATION_ERROR
    y RUN_COMPLETED(status='rejected', stop_reason='unknown_tool') y NO emita PLAN_VALIDATED.
    """
    import asyncio

    class BadToolPlanner(MockPlanner):
        def create_plan(self, goal: str, context_memories: str = "") -> Plan:
            return Plan(
                goal=goal,
                steps=[
                    PlanStep(
                        id="S1",
                        action="get_customer_tickets",
                        description="Herramienta no registrada",
                        executor=StepExecutor.TOOL,
                        depends_on=[],
                    )
                ],
                revision=1,
            )

    async def _collect():
        orchestrator = AgentV4Orchestrator(planner=BadToolPlanner())
        evts = []
        async for evt in orchestrator.run_stream(
            query="Consulta con herramienta ficticia",
            user_persona="usr_carlos",
        ):
            evts.append(evt)
        return evts

    events = asyncio.run(_collect())
    types = [e.type for e in events]

    assert "PLAN_GENERATED" in types
    assert "PLAN_VALIDATED" not in types, "NO se debe emitir PLAN_VALIDATED para un plan con herramientas desconocidas"
    assert "VALIDATION_ERROR" in types

    val_evt = next(e for e in events if e.type == "VALIDATION_ERROR")
    assert val_evt.payload.get("error_code") == "unknown_tool"

    comp_evt = next(e for e in events if e.type == "RUN_COMPLETED")
    assert comp_evt.payload.get("status") == "rejected"
    assert comp_evt.payload.get("stop_reason") == "unknown_tool"


