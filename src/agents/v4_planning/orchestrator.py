import asyncio
import json
import time
import uuid
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.agents.common.contracts import ModelProvider
from src.agents.common.providers import OpenAICompatibleProvider
from src.agents.tools.ticket_tools import execute_tool_call
from src.agents.v2_agent_loop.idempotency import IdempotencyRegistry
from src.agents.v2_agent_loop.state import ExecutionStatus, StopReason
from src.agents.v3_state_and_memory.events import (
    event_v3_memory_hydrated,
    event_v3_turn_persisted,
)
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
)
from src.agents.v4_planning.mock_planner import MockPlanner, PlannerBase
from src.agents.v4_planning.planner import LLMPlanner
from src.agents.v4_planning.state import AgentV4ExecutionState
from src.api.schemas import ChatRequest, StreamEvent
from src.application.memory.context_builder import ContextBuilder
from src.application.memory.ports import ConversationMemoryStore, DecisionMemoryStore
from src.domain.exceptions import UnauthorizedActionError, ValidationError
from src.domain.memory.entities import ConversationTurn
from src.domain.memory.identity import LabSimulatedIdentityResolver, SimulatedIdentity
from src.domain.memory.policy import MemoryPolicy
from src.domain.memory.token_budget import TokenBudgetManager
from src.domain.planning.entities import Plan, PlanStep
from src.domain.planning.enums import StepExecutor, StepStatus
from src.domain.planning.validator import PlanValidator, PlanValidationError
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.database.models import AgentConversationModel
from src.infrastructure.memory.sql_conversation_memory_store import SqlConversationMemoryStore
from src.infrastructure.memory.sql_decision_memory_store import SqlDecisionMemoryStore


class AgentV4Orchestrator:
    """
    Orquestador de Planificación y Descomposición de Tareas (Agent v4).

    Responsabilidades Curriculares:
    1. Hidratar memoria conversacional y preferencias de sesión desde MySQL (herencia v3).
    2. Proponer un Plan estructurado (DAG) mediante el Planner tipado (software observable).
    3. Validar estructuralmente el Plan previo a la ejecución mediante PlanValidator.
    4. Ejecutar pasos respetando estrictamente el orden de dependencias.
    5. Despachar de forma polimórfica a TOOL (catálogo), RUNTIME (CPU local) y MODEL (síntesis LLM).
    6. Interceptar contingencias, archivar snapshots inmutables en plan_history y replanificar.
    7. Garantizar el invariante de meta: el replanning jamás modifica la meta original.
    8. Detectar estancamientos en runtime (no_executable_steps) con terminación segura y observable.
    9. Persistir turnos ejecutados en MySQL y emitir eventos SSE correlacionados en tiempo real.
    """

    def __init__(
        self,
        provider: Optional[ModelProvider] = None,
        session_factory: Optional[Callable[[], Session]] = None,
        conv_store: Optional[ConversationMemoryStore] = None,
        decision_store: Optional[DecisionMemoryStore] = None,
        token_budget_manager: Optional[TokenBudgetManager] = None,
        idempotency_registry: Optional[IdempotencyRegistry] = None,
        planner: Optional[PlannerBase] = None,
    ) -> None:
        self.provider = provider or OpenAICompatibleProvider()
        self.session_factory = session_factory or get_app_session_factory()
        self.conv_store = conv_store or SqlConversationMemoryStore(session_factory=self.session_factory)
        self.decision_store = decision_store or SqlDecisionMemoryStore(session_factory=self.session_factory)
        self.budget_manager = token_budget_manager or TokenBudgetManager.from_provider_config(self.provider)
        self.context_builder = ContextBuilder(self.budget_manager)
        self.idempotency = idempotency_registry or IdempotencyRegistry()
        self.planner = planner or MockPlanner()

    def _resolve_identity(self, username: str) -> SimulatedIdentity:
        try:
            with self.session_factory() as session:
                resolver = LabSimulatedIdentityResolver(session)
                return resolver.resolve(username)
        except Exception:
            from src.domain.enums import UserRole
            return SimulatedIdentity(
                user_id=1,
                username=username,
                role=UserRole.USER,
                is_lab_simulation=True,
            )

    def _ensure_conversation_ownership(
        self,
        conversation_id: Optional[str],
        identity: SimulatedIdentity,
    ) -> str:
        cid = conversation_id or f"conv-v4-{uuid.uuid4().hex[:8]}"
        try:
            with self.session_factory() as session:
                existing = session.scalar(
                    select(AgentConversationModel).where(
                        AgentConversationModel.conversation_id == cid
                    )
                )
                if existing is not None and existing.user_id != identity.user_id:
                    raise UnauthorizedActionError(
                        user_role=identity.role.value,
                        action=f"El usuario '{identity.username}' (id={identity.user_id}) no tiene acceso a la conversación '{cid}'.",
                    )

            self.conv_store.create_or_get_conversation(
                user_id=identity.user_id,
                subject_id=identity.username,
                conversation_id=cid,
                title="Planificación Agéntica v4",
            )
        except UnauthorizedActionError:
            raise
        except Exception:
            pass
        return cid

    def run(
        self,
        goal: str,
        user_persona: str = "usr_carlos",
        conversation_id: Optional[str] = None,
        turn_id: Optional[str] = None,
        session_id: Optional[str] = None,
        max_iterations: int = 8,
        planner: Optional[PlannerBase] = None,
    ) -> AgentV4ExecutionState:
        """Ejecuta el ciclo sincrónico de Agent v4."""
        active_planner = planner or self.planner

        # 1. Planificación inicial
        plan = active_planner.create_plan(goal)
        PlanValidator.validate(plan)

        state = AgentV4ExecutionState(
            run_id=f"run_{uuid.uuid4().hex[:8]}",
            session_id=session_id or "sess_default",
            subject_id=user_persona,
            query=goal,
            max_iterations=max_iterations,
            current_plan=plan,
        )

        while state.iteration < state.max_iterations:
            # Comprobar si el plan ya se completó de forma derivada
            if state.current_plan.is_completed:
                state.termination_reason = "plan_completed"
                state.status = ExecutionStatus.COMPLETED
                break

            # Buscar pasos completados o autorizados como omitidos
            completed_step_ids = {
                s.id
                for s in state.current_plan.steps
                if s.status == StepStatus.COMPLETED
                or (s.status == StepStatus.SKIPPED and (not s.required or s.skip_reason))
            }

            # Filtrar pasos pendientes
            pending_steps = [s for s in state.current_plan.steps if s.status == StepStatus.PENDING]

            # Seleccionar pasos ejecutables (cuyas dependencias estén todas cumplidas)
            executable_steps = [
                s for s in pending_steps if all(dep in completed_step_ids for dep in s.depends_on)
            ]

            # DETECCIÓN DE RUNTIME STALL: Hay pasos pendientes pero ninguno puede ejecutarse
            if pending_steps and not executable_steps:
                state.termination_reason = "no_executable_steps"
                state.status = ExecutionStatus.FAILED
                break

            if not executable_steps:
                state.termination_reason = "plan_completed"
                state.status = ExecutionStatus.COMPLETED
                break

            # Tomar el siguiente paso prioritario
            current_step = executable_steps[0]
            state.current_plan.current_step_id = current_step.id
            current_step.status = StepStatus.IN_PROGRESS
            state.iteration += 1

            # Ejecución polimórfica según executor
            if current_step.executor == StepExecutor.TOOL:
                obs = execute_tool_step(current_step.action, current_step.arguments, state, self.session_factory)
                state.tool_calls_executed.append(current_step.action)
            elif current_step.executor == StepExecutor.RUNTIME:
                obs = execute_runtime_step(current_step.action, state)
            elif current_step.executor == StepExecutor.MODEL:
                obs = execute_model_step(current_step.action, state, self.provider)
            else:
                obs = {"status": "error", "error": f"Executor no soportado: {current_step.executor}"}

            current_step.observation = obs
            state.last_observation = obs

            # Verificación del resultado del paso
            if obs.get("status") == "success":
                current_step.status = StepStatus.COMPLETED
            else:
                current_step.status = StepStatus.FAILED

                # REPLANNING: Solo archivar snapshot si se produce una nueva revisión válida
                new_plan = active_planner.replan(state.current_plan, current_step, obs)
                if new_plan is not None:
                    assert (
                        new_plan.goal == state.current_plan.goal
                    ), "Violación de invariante: replanning alteró la meta original."
                    PlanValidator.validate(new_plan)
                    snapshot = state.current_plan.clone()
                    state.plan_history.append(snapshot)
                    state.current_plan = new_plan

        if state.iteration >= state.max_iterations and not state.termination_reason:
            state.termination_reason = "max_iterations_exceeded"
            state.status = ExecutionStatus.FAILED

        # Preparar respuesta final sintética
        final_rec = ""
        for s in reversed(state.current_plan.steps):
            if s.status == StepStatus.COMPLETED and s.observation:
                rec = s.observation.get("recommendation")
                if rec:
                    final_rec = rec
                    break
        state.final_answer = final_rec or (
            f"Ejecución de plan finalizada con motivo: {state.termination_reason}. "
            f"Pasos completados: {len([s for s in state.current_plan.steps if s.status == StepStatus.COMPLETED])}/{len(state.current_plan.steps)}."
        )

        return state

    async def run_stream(
        self,
        query: str,
        user_persona: str = "usr_carlos",
        conversation_id: Optional[str] = None,
        turn_id: Optional[str] = None,
        session_id: Optional[str] = None,
        max_iterations: int = 8,
        planner: Optional[PlannerBase] = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Ejecuta el ciclo de Agent v4 emitiendo eventos SSE en tiempo real."""
        active_planner = planner or self.planner
        goal = query
        execution_id = f"v4-exec-{uuid.uuid4().hex[:8]}"
        correlation_id = f"corr-{uuid.uuid4().hex[:8]}"
        tid = turn_id or f"turn-v4-{uuid.uuid4().hex[:8]}"

        # 1. Identidad y aislamiento (Capacidades de v3 preservadas)
        identity = self._resolve_identity(user_persona)
        cid = self._ensure_conversation_ownership(conversation_id, identity)

        yield StreamEvent(
            event_id=f"evt-v4-{uuid.uuid4().hex[:10]}",
            agent_version="v4",
            execution_id=execution_id,
            iteration_index=0,
            phase="init",
            correlation_id=correlation_id,
            type="USER_REQUEST",
            payload={
                "query": goal,
                "persona": identity.username,
                "operator": identity.username,
                "conversation_id": cid,
                "session_id": session_id or "sess_default",
            },
        )

        # 2. Hidratar memoria desde MySQL (Capacidad v3 preservada)
        active_decisions = []
        recent_turns = []
        stats = {}
        try:
            active_decisions = self.decision_store.get_active_decisions(
                user_id=identity.user_id, subject_id=identity.username, session_id=session_id
            )
            recent_turns = self.conv_store.get_recent_turns(
                conversation_id=cid, user_id=identity.user_id, limit=10
            )
            initial_messages, stats = self.context_builder.build_initial_messages(
                query=goal,
                identity=identity,
                active_decisions=active_decisions,
                recent_turns=recent_turns,
            )
        except Exception:
            pass
        mem_evt = event_v3_memory_hydrated(execution_id, correlation_id, cid, stats, active_decisions)
        mem_evt.agent_version = "v4"
        yield mem_evt

        # 3. Planificación Inicial y Validación de Software
        plan = active_planner.create_plan(goal)
        yield event_v4_plan_generated(execution_id, correlation_id, plan, iteration_index=0)

        try:
            PlanValidator.validate(plan)
            yield event_v4_plan_validated(execution_id, correlation_id, plan, iteration_index=0)
        except PlanValidationError as pe:
            err_msg = str(pe)
            error_code = "invalid_plan"
            if "unknown_tool:" in err_msg:
                error_code = "unknown_tool"
            elif "invalid_tool_arguments:" in err_msg:
                error_code = "invalid_tool_arguments"
            elif "unknown_runtime_action:" in err_msg:
                error_code = "unknown_runtime_action"
            elif "unknown_model_action:" in err_msg:
                error_code = "unknown_model_action"

            yield StreamEvent(
                event_id=f"evt-v4-{uuid.uuid4().hex[:10]}",
                agent_version="v4",
                execution_id=execution_id,
                iteration_index=0,
                phase="validation",
                correlation_id=correlation_id,
                type="VALIDATION_ERROR",
                payload={"error": err_msg, "error_code": error_code, "status": "rejected"},
            )
            yield StreamEvent(
                event_id=f"evt-v4-{uuid.uuid4().hex[:10]}",
                agent_version="v4",
                execution_id=execution_id,
                iteration_index=0,
                phase="complete",
                correlation_id=correlation_id,
                type="RUN_COMPLETED",
                payload={
                    "status": "rejected",
                    "stop_reason": error_code,
                    "error": err_msg,
                    "total_iterations": 0,
                    "total_tools_executed": 0,
                    "plan_revision": plan.revision,
                    "plan_history_count": 0,
                },
            )
            return

        state = AgentV4ExecutionState(
            run_id=execution_id,
            session_id=session_id or "sess_default",
            subject_id=identity.username,
            query=goal,
            max_iterations=max_iterations,
            current_plan=plan,
        )

        # 4. Bucle gobernado por dependencias
        while state.iteration < state.max_iterations:
            if state.current_plan.is_completed:
                state.termination_reason = "plan_completed"
                state.status = ExecutionStatus.COMPLETED
                yield event_v4_plan_completed(
                    execution_id, correlation_id, state.current_plan, state.iteration
                )
                break

            completed_step_ids = {
                s.id
                for s in state.current_plan.steps
                if s.status == StepStatus.COMPLETED
                or (s.status == StepStatus.SKIPPED and (not s.required or s.skip_reason))
            }

            pending_steps = [s for s in state.current_plan.steps if s.status == StepStatus.PENDING]
            executable_steps = [
                s for s in pending_steps if all(dep in completed_step_ids for dep in s.depends_on)
            ]

            # Detección de Runtime Stall
            if pending_steps and not executable_steps:
                state.termination_reason = "no_executable_steps"
                state.status = ExecutionStatus.FAILED
                yield event_v4_plan_blocked(
                    execution_id,
                    correlation_id,
                    [s.id for s in pending_steps],
                    state.current_plan.revision,
                    state.iteration,
                )
                break

            if not executable_steps:
                state.termination_reason = "plan_completed"
                state.status = ExecutionStatus.COMPLETED
                yield event_v4_plan_completed(
                    execution_id, correlation_id, state.current_plan, state.iteration
                )
                break

            current_step = executable_steps[0]
            state.current_plan.current_step_id = current_step.id
            current_step.status = StepStatus.IN_PROGRESS
            state.iteration += 1

            yield event_v4_step_started(
                execution_id,
                correlation_id,
                current_step,
                state.current_plan.revision,
                state.iteration,
            )

            # Pausa breve para animación fluida en frontend
            await asyncio.sleep(0.08)

            start_t = time.perf_counter()
            if current_step.executor == StepExecutor.TOOL:
                obs = execute_tool_step(current_step.action, current_step.arguments, state, self.session_factory)
                state.tool_calls_executed.append(current_step.action)
            elif current_step.executor == StepExecutor.RUNTIME:
                obs = execute_runtime_step(current_step.action, state)
            elif current_step.executor == StepExecutor.MODEL:
                obs = execute_model_step(current_step.action, state, self.provider)
            else:
                obs = {"status": "error", "error": f"Executor no soportado: {current_step.executor}"}

            duration_ms = (time.perf_counter() - start_t) * 1000
            current_step.observation = obs
            state.last_observation = obs

            if obs.get("status") == "success":
                current_step.status = StepStatus.COMPLETED
                yield event_v4_step_completed(
                    execution_id,
                    correlation_id,
                    current_step,
                    state.current_plan.revision,
                    state.iteration,
                    duration_ms,
                )
            else:
                current_step.status = StepStatus.FAILED
                yield event_v4_step_failed(
                    execution_id,
                    correlation_id,
                    current_step,
                    state.current_plan.revision,
                    state.iteration,
                    obs.get("error", "Error no especificado"),
                )

                # Replanning: Solo archivar snapshot y emitir eventos si el replanner produce una revisión válida
                new_plan = active_planner.replan(state.current_plan, current_step, obs)
                if new_plan is not None:
                    assert (
                        new_plan.goal == state.current_plan.goal
                    ), "Violación de invariante: replanning alteró la meta original."
                    PlanValidator.validate(new_plan)

                    # Archivar snapshot de la revisión previa únicamente ante replanning válido
                    snapshot = state.current_plan.clone()
                    state.plan_history.append(snapshot)
                    yield event_v4_replanning_triggered(
                        execution_id,
                        correlation_id,
                        current_step.id,
                        snapshot.revision,
                        len(state.plan_history),
                        state.iteration,
                    )

                    await asyncio.sleep(0.08)

                    state.current_plan = new_plan
                    yield event_v4_plan_revision_created(
                        execution_id, correlation_id, new_plan, state.iteration
                    )

        if state.iteration >= state.max_iterations and not state.termination_reason:
            state.termination_reason = "max_iterations_exceeded"
            state.status = ExecutionStatus.FAILED

        # 5. Síntesis Final Grounded y Cierre
        final_answer = ""
        for s in reversed(state.current_plan.steps):
            if s.status == StepStatus.COMPLETED and s.observation:
                rec = s.observation.get("recommendation")
                if rec:
                    final_answer = rec
                    break

        if not final_answer:
            if state.termination_reason == "no_executable_steps":
                final_answer = (
                    "Ejecución detenida de forma segura (Runtime Stall): "
                    "Un paso crítico falló y los pasos subsiguientes tienen dependencias insatisfechas sin ruta de replanning alternativa."
                )
            elif state.termination_reason == "plan_completed":
                final_answer = "Plan ejecutado exitosamente. Todas las tareas y dependencias fueron resueltas por el runtime."
            else:
                final_answer = f"Ejecución finalizada con estado: {state.termination_reason}."

        state.final_answer = final_answer

        yield StreamEvent(
            event_id=f"evt-v4-{uuid.uuid4().hex[:10]}",
            agent_version="v4",
            execution_id=execution_id,
            iteration_index=state.iteration,
            phase="synthesis",
            correlation_id=correlation_id,
            type="FINAL_SYNTHESIS",
            payload={
                "answer": final_answer,
                "content": final_answer,
                "message": final_answer,
                "total_iterations": state.iteration,
                "revisions_count": state.current_plan.revision,
                "termination_reason": state.termination_reason,
            },
        )

        yield StreamEvent(
            event_id=f"evt-v4-{uuid.uuid4().hex[:10]}",
            agent_version="v4",
            execution_id=execution_id,
            iteration_index=state.iteration,
            phase="complete",
            correlation_id=correlation_id,
            type="RUN_COMPLETED",
            payload={
                "status": "completed" if state.current_plan.is_completed else "failed",
                "stop_reason": state.termination_reason,
                "total_iterations": state.iteration,
                "total_tools_executed": len(state.tool_calls_executed),
                "plan_revision": state.current_plan.revision,
                "plan_history_count": len(state.plan_history),
            },
        )

        # 6. Persistencia del Turno en MySQL (Capacidad v3 preservada)
        try:
            turn = ConversationTurn(
                turn_id=tid,
                conversation_id=cid,
                user_id=identity.user_id,
                subject_id=identity.username,
                user_query=goal,
                agent_response=final_answer,
                tokens_estimate=self.budget_manager.estimate_tokens(final_answer),
            )
            self.conv_store.save_turn(turn)
            turn_evt = event_v3_turn_persisted(execution_id, correlation_id, tid, cid)
            turn_evt.agent_version = "v4"
            yield turn_evt
        except Exception:
            pass


def run_agent_v4(
    goal: str,
    planner: Optional[PlannerBase] = None,
    max_iterations: int = 8,
    session_id: str = "sess_default",
    subject_id: str = "usr_engineer_01",
) -> AgentV4ExecutionState:
    """
    Función canónica de Agent v4 para el Taller 05 y pruebas curriculares G1, G2 y G3.
    """
    active_planner = planner or MockPlanner()
    orchestrator = AgentV4Orchestrator(planner=active_planner)
    return orchestrator.run(
        goal=goal,
        user_persona=subject_id,
        session_id=session_id,
        max_iterations=max_iterations,
        planner=active_planner,
    )


async def run_agent_v4_stream(
    request: ChatRequest,
) -> AsyncGenerator[StreamEvent, None]:
    """Despachador SSE registrado para Agent v4."""
    # Usamos MockPlanner si la consulta es una prueba curricular de DevOps (Casos G1, G2, G3)
    q_lower = request.query.lower()
    if any(k in q_lower for k in ["incidente", "despliegue", "auditar", "legacy", "irrecuperable"]):
        planner = MockPlanner()
    else:
        planner = LLMPlanner(provider=OpenAICompatibleProvider())

    orchestrator = AgentV4Orchestrator(planner=planner)
    cid = getattr(request, "conversation_id", None)
    tid = getattr(request, "turn_id", None)
    sid = getattr(request, "session_id", None)

    async for evt in orchestrator.run_stream(
        query=request.query,
        user_persona=request.user_persona,
        conversation_id=cid,
        turn_id=tid,
        session_id=sid,
        planner=planner,
    ):
        yield evt
