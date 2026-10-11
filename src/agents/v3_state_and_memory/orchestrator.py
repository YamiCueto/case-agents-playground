import asyncio
import json
import re
import time
import uuid
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelProvider
from src.agents.common.providers import OpenAICompatibleProvider
from src.agents.tools.ticket_tools import (
    ARGUMENT_MODELS,
    execute_tool_call,
    validate_tool_arguments,
)
from src.agents.v2_agent_loop.engine import AgentLoopEngine
from src.agents.v2_agent_loop.idempotency import IdempotencyRegistry
from src.agents.v2_agent_loop.state import AgentExecutionState, ExecutionStatus, StopReason
from src.agents.v3_state_and_memory.events import (
    event_v3_decision_revoked,
    event_v3_decision_saved,
    event_v3_memory_hydrated,
    event_v3_pending_task_proposed,
    event_v3_pending_task_resolved,
    event_v3_recovery_alert,
    event_v3_turn_persisted,
)
from src.api.schemas import ChatRequest, StreamEvent
from src.application.memory.context_builder import ContextBuilder
from src.application.memory.ports import ConversationMemoryStore, DecisionMemoryStore
from src.domain.enums import UserRole
from src.domain.exceptions import (
    EntityNotFoundError,
    UnauthorizedActionError,
    ValidationError,
)
from src.domain.memory.entities import (
    ConversationTurn,
    DecisionRecord,
    PendingDecisionRecord,
)
from src.domain.memory.enums import DecisionStatus, MemoryScope, ProvenanceType
from src.domain.memory.identity import LabSimulatedIdentityResolver, SimulatedIdentity
from src.domain.memory.policy import MemoryPolicy
from src.domain.memory.token_budget import TokenBudgetManager
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.database.models import AgentConversationModel, TicketModel
from src.infrastructure.memory.sql_conversation_memory_store import SqlConversationMemoryStore
from src.infrastructure.memory.sql_decision_memory_store import SqlDecisionMemoryStore


class AgentV3Orchestrator:
    """
    Orquestador de Estado y Memoria (Agent v3).

    Responsabilidades de Integración:
    1. Resolver la identidad simulada en MySQL y validar aislamiento por usuario.
    2. Validar propiedad estricta de conversation_id (prevención de accesos cruzados).
    3. Hidratar historial conversacional y decisiones activas autorizadas desde MySQL.
    4. Construir contexto mediante ContextBuilder y TokenBudgetManager recalculando presupuesto.
    5. Reutilizar AgentLoopEngine v2 mediante composición (cero duplicación de motor).
    6. Persistir turnos mediante turn_id estable con idempotencia.
    7. Gestionar el ciclo de vida de tareas pendientes (propuesta, adquisición, revalidación, ejecución y resolución).
    8. Respetar leases, vencimiento y requerimiento de reconciliación en tareas mutativas.
    9. Aplicar directiva de frescura: reconsultar MySQL para datos operativos de tickets.
    10. Exponer eventos SSE de memoria, decisiones y tareas sanitizados sin secretos.
    """

    def __init__(
        self,
        provider: Optional[ModelProvider] = None,
        session_factory: Optional[Callable[[], Session]] = None,
        conv_store: Optional[ConversationMemoryStore] = None,
        decision_store: Optional[DecisionMemoryStore] = None,
        token_budget_manager: Optional[TokenBudgetManager] = None,
        idempotency_registry: Optional[IdempotencyRegistry] = None,
    ) -> None:
        self.provider = provider or OpenAICompatibleProvider()
        self.session_factory = session_factory or get_app_session_factory()
        self.conv_store = conv_store or SqlConversationMemoryStore(session_factory=self.session_factory)
        self.decision_store = decision_store or SqlDecisionMemoryStore(session_factory=self.session_factory)
        self.budget_manager = token_budget_manager or TokenBudgetManager.from_provider_config(self.provider)
        self.context_builder = ContextBuilder(self.budget_manager)
        self.idempotency = idempotency_registry or IdempotencyRegistry()

        # Reutilización directa de AgentLoopEngine v2
        self.engine = AgentLoopEngine(
            provider=self.provider,
            session_factory=self.session_factory,
            idempotency_registry=self.idempotency,
        )

    def _resolve_identity(self, username: str) -> SimulatedIdentity:
        with self.session_factory() as session:
            resolver = LabSimulatedIdentityResolver(session)
            return resolver.resolve(username)

    def _ensure_conversation_ownership(
        self,
        conversation_id: Optional[str],
        identity: SimulatedIdentity,
    ) -> str:
        cid = conversation_id or f"conv-{uuid.uuid4().hex[:8]}"
        with self.session_factory() as session:
            existing = session.scalar(
                select(AgentConversationModel).where(
                    AgentConversationModel.conversation_id == cid
                )
            )
            if existing is not None and existing.user_id != identity.user_id:
                raise UnauthorizedActionError(
                    user_role=identity.role.value,
                    action=f"El usuario '{identity.username}' (id={identity.user_id}) no tiene acceso a la conversación '{cid}' de otro usuario.",
                )

        # Crear o recuperar en store
        self.conv_store.create_or_get_conversation(
            user_id=identity.user_id,
            subject_id=identity.username,
            conversation_id=cid,
            title="Conversación de Soporte",
        )
        return cid

    def _detect_and_handle_preference_intent(
        self,
        query: str,
        identity: SimulatedIdentity,
        session_id: Optional[str] = None,
    ) -> Optional[DecisionRecord]:
        """Detecta intenciones explícitas de persistencia de preferencias o decisiones."""
        if not MemoryPolicy.has_explicit_preference_intent(query):
            return None

        # Heurísticas de extracción de preferencias explícitas comunes
        q_lower = query.lower()
        extracted_key: Optional[str] = None
        extracted_val: Optional[Any] = None
        rationale: str = query

        # Patrón directo clave-valor: "preferencia [es] [key]: [value]" o "preferencia [es] [key] = [value]"
        gen_match = re.search(r"(?i)preferencia\s+(?:es\s+)?([a-zA-Z0-9_]+)\s*[:=]\s*['\"]?([a-zA-Z0-9_]+)['\"]?", query)
        if gen_match:
            extracted_key = gen_match.group(1).strip()
            extracted_val = gen_match.group(2).strip()

        if not extracted_key:
            if "prioridad" in q_lower or "priority" in q_lower:
                for p in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
                    if p.lower() in q_lower:
                        extracted_key = "default_priority"
                        extracted_val = p
                        break
            elif "canal" in q_lower or "channel" in q_lower or "notificaci" in q_lower:
                for ch in ["EMAIL", "SMS", "SLACK", "PUSH_NOTIFICATION", "TEAMS"]:
                    if ch.lower() in q_lower:
                        extracted_key = "preferred_channel"
                        extracted_val = ch
                        break
            elif "tema" in q_lower or "theme" in q_lower:
                for th in ["dark", "light", "oscuro", "claro"]:
                    if th in q_lower:
                        extracted_key = "theme_mode"
                        extracted_val = "dark" if th in ("dark", "oscuro") else "light"
                        break
            elif "idioma" in q_lower or "language" in q_lower:
                for lang in ["es", "en", "pt"]:
                    if lang in q_lower:
                        extracted_key = "preferred_language"
                        extracted_val = lang
                        break

        if not extracted_key or extracted_val is None:
            return None

        dec_id = f"dec-{extracted_key}-{uuid.uuid4().hex[:6]}"
        rec = DecisionRecord(
            decision_id=dec_id,
            user_id=identity.user_id,
            subject_id=identity.username,
            session_id=session_id,
            scope=MemoryScope.PERSISTENT,
            key=extracted_key,
            value=extracted_val,
            rationale=rationale,
            provenance=ProvenanceType.USER_EXPLICIT,
        )

        return self.decision_store.save_decision(rec, explicit_user_confirmation=True)

    def _detect_and_handle_preference_revocation(
        self,
        query: str,
        identity: SimulatedIdentity,
    ) -> Optional[str]:
        """Detecta intenciones explícitas de revocación de preferencias."""
        q_lower = query.lower()
        if not any(w in q_lower for w in ["olvida", "revoca", "elimina", "borra", "descarta"]):
            return None

        # Identificar qué clave de preferencia se pide revocar
        active_decs = self.decision_store.get_active_decisions(
            user_id=identity.user_id, subject_id=identity.username
        )
        for dec in active_decs:
            if dec.key.lower() in q_lower or (isinstance(dec.value, str) and dec.value.lower() in q_lower):
                self.decision_store.revoke_decision(dec.decision_id, identity.user_id)
                return dec.key

        return None

    def _validate_pending_task_for_resumption(
        self,
        task: PendingDecisionRecord,
        identity: SimulatedIdentity,
        cid: str,
        selected_value: Optional[str],
        conversation_id_provided: Optional[str] = None,
    ) -> None:
        """
        Valida que una tarea pendiente cumpla todos los criterios de seguridad e integridad
        para ser reanudada en HITL:
        1. Bloqueo de reejecución en recovery_required.
        2. Estado pendiente.
        3. Presencia de valor seleccionado.
        4. Coincidencia de conversación de origen.
        5. Validación estricta contra opciones permitidas.
        6. Permisos de rol para la herramienta objetivo.
        """
        if task.status == DecisionStatus.RECOVERY_REQUIRED:
            raise ValidationError(
                f"La tarea pendiente '{task.decision_id}' está en estado 'recovery_required' y requiere reconciliación manual. No se permite reanudación automática."
            )
        if task.status != DecisionStatus.PENDING:
            raise ValidationError(
                f"La tarea pendiente '{task.decision_id}' ya no se encuentra en estado 'pending' (estado actual: '{task.status.value}')."
            )
        if not selected_value or not str(selected_value).strip():
            raise ValidationError(
                f"Se requiere proporcionar 'selected_value' para resolver la tarea pendiente '{task.decision_id}'."
            )
        if conversation_id_provided and task.conversation_id != conversation_id_provided:
            raise ValidationError(
                f"La tarea pendiente '{task.decision_id}' pertenece a la conversación '{task.conversation_id}', no a '{conversation_id_provided}'."
            )
        if task.options and selected_value not in task.options:
            raise ValidationError(
                f"El valor '{selected_value}' no es una opción válida para la tarea '{task.decision_id}'. Opciones permitidas: {task.options}."
            )
        if task.required_role:
            user_role_str = identity.role.value.upper()
            required_role_str = task.required_role.upper()
            role_ranks = {"USER": 1, "AGENT": 2, "ADMIN": 3}
            if role_ranks.get(user_role_str, 1) < role_ranks.get(required_role_str, 1):
                raise UnauthorizedActionError(
                    user_role=identity.role.value,
                    action=f"Ejecución de la herramienta '{task.target_tool_name}' (requiere rol {required_role_str})",
                )

    def _handle_pending_task_resumption(
        self,
        task: PendingDecisionRecord,
        identity: SimulatedIdentity,
        selected_value: str,
        execution_id: str,
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Reanuda una tarea pendiente de forma segura:
        1. Adquisición atómica con lease.
        2. Revalidación Pydantic de argumentos fusionados.
        3. Comprobación de estado fresco en MySQL.
        4. Checkpoint de ejecución.
        5. Ejecución y resolución atómica.
        """
        # 1. Adquirir tarea
        self.decision_store.atomic_acquire_for_resolving(
            decision_id=task.decision_id,
            user_id=identity.user_id,
            lease_owner=f"v3-orchestrator-{execution_id}",
            lease_seconds=60,
        )

        # 2. Revalidar argumentos fusionados
        merged_args = dict(task.pending_tool_arguments)
        merged_args[task.missing_parameter_name] = selected_value
        tool_name = task.target_tool_name

        try:
            validated_args = validate_tool_arguments(tool_name, merged_args)
        except Exception as val_err:
            self.decision_store.atomic_fail_task(
                decision_id=task.decision_id,
                user_id=identity.user_id,
                reason=f"Fallo de revalidación Pydantic: {str(val_err)}",
            )
            raise ValidationError(f"Argumentos inválidos para {tool_name}: {str(val_err)}")

        # 3. Reconsultar MySQL para verificar datos vivos de la entidad objetivo
        if "ticket_code" in validated_args or "ticket_id" in validated_args:
            target_code = validated_args.get("ticket_code") or validated_args.get("ticket_id")
            with self.session_factory() as session:
                t = session.scalar(
                    select(TicketModel).where(
                        (TicketModel.code == str(target_code))
                        | (TicketModel.id == (int(target_code) if str(target_code).isdigit() else -1))
                    )
                )
                if t is not None and t.status.upper() in ("CLOSED", "RESOLVED"):
                    self.decision_store.atomic_fail_task(
                        decision_id=task.decision_id,
                        user_id=identity.user_id,
                        reason=f"Ticket {target_code} ya está cerrado o resuelto en MySQL.",
                    )
                    raise ValidationError(f"El ticket {target_code} se encuentra en estado '{t.status}' y no permite mutaciones.")

        # 4. Checkpoint
        checkpoint_data = {
            "execution_id": execution_id,
            "tool": tool_name,
            "args": validated_args,
            "timestamp": time.time(),
        }
        self.decision_store.record_execution_checkpoint(
            decision_id=task.decision_id,
            user_id=identity.user_id,
            checkpoint=checkpoint_data,
        )

        # 5. Ejecutar herramienta
        with self.session_factory() as session:
            from src.agents.common.contracts import ToolCall
            tc = ToolCall(id=f"tc-res-{task.decision_id}", name=tool_name, arguments=validated_args)
            result = execute_tool_call(tc, session, identity.username)

        # 6. Resolución atómica
        if result.get("status") in ("success", "ok") or "error" not in result.get("status", ""):
            self.decision_store.atomic_resolve_task(
                decision_id=task.decision_id,
                user_id=identity.user_id,
                selected_value=selected_value,
            )
            task.selected_value = selected_value
            task.status = DecisionStatus.RESOLVED
            return result, True
        else:
            self.decision_store.atomic_fail_task(
                decision_id=task.decision_id,
                user_id=identity.user_id,
                reason=result.get("message", "Error en ejecución de herramienta"),
            )
            return result, False

    def run(
        self,
        query: str,
        user_persona: str = "usr_carlos",
        conversation_id: Optional[str] = None,
        turn_id: Optional[str] = None,
        session_id: Optional[str] = None,
        selected_value: Optional[str] = None,
        decision_id: Optional[str] = None,
        max_iterations: int = 5,
        global_timeout_seconds: float = 60.0,
        inference_timeout_seconds: float = 30.0,
        tool_timeout_seconds: float = 15.0,
    ) -> AgentExecutionState:
        """Ejecuta el ciclo de Agent v3 de forma síncrona."""
        # 1. Resolver identidad y validar ownership
        identity = self._resolve_identity(user_persona)
        cid = self._ensure_conversation_ownership(conversation_id, identity)
        tid = turn_id or f"turn-{uuid.uuid4().hex[:8]}"
        execution_id = f"v3-exec-{uuid.uuid4().hex[:8]}"

        # 2. Comprobar si hay una tarea pendiente a resolver
        target_pending: Optional[PendingDecisionRecord] = None
        if decision_id:
            target_pending = self.decision_store.get_pending_task(decision_id, identity.user_id)
            if target_pending is None:
                raise ValidationError(f"La tarea pendiente '{decision_id}' no existe o no pertenece al usuario.")
            self._validate_pending_task_for_resumption(
                task=target_pending,
                identity=identity,
                cid=cid,
                selected_value=selected_value,
                conversation_id_provided=conversation_id,
            )
            if not conversation_id and target_pending.conversation_id:
                cid = target_pending.conversation_id
        elif session_id:
            target_pending = self.decision_store.get_active_pending_task_by_session(identity.user_id, session_id)
            if target_pending and selected_value:
                self._validate_pending_task_for_resumption(
                    task=target_pending,
                    identity=identity,
                    cid=cid,
                    selected_value=selected_value,
                    conversation_id_provided=conversation_id,
                )
                if not conversation_id and target_pending.conversation_id:
                    cid = target_pending.conversation_id

        if target_pending and target_pending.status == DecisionStatus.PENDING and selected_value:
            tool_res, success = self._handle_pending_task_resumption(
                task=target_pending,
                identity=identity,
                selected_value=selected_value,
                execution_id=execution_id,
            )
            # Construir respuesta de resolución
            state = self.engine.init_state(
                query=query or f"Reanudar {target_pending.decision_id}",
                operator_username=identity.username,
                max_iterations=1,
            )
            state.final_answer = (
                f"La tarea '{target_pending.decision_id}' ({target_pending.target_tool_name}) "
                f"ha sido reanudada y resuelta con el valor '{selected_value}'. "
                f"Resultado de la operación: {json.dumps(tool_res, ensure_ascii=False)}"
            )
            state.status = ExecutionStatus.COMPLETED

            # Persistir turno
            turn = ConversationTurn(
                turn_id=tid,
                conversation_id=cid,
                user_id=identity.user_id,
                subject_id=identity.username,
                user_query=query or f"Opción seleccionada: {selected_value}",
                agent_response=state.final_answer,
                tokens_estimate=self.budget_manager.estimate_tokens(state.final_answer),
            )
            self.conv_store.save_turn(turn)
            return state

        # 3. Detectar preferencias explícitas o revocaciones en la consulta
        saved_dec = self._detect_and_handle_preference_intent(query, identity, session_id)
        revoked_key = self._detect_and_handle_preference_revocation(query, identity)

        # 4. Hidratar memoria desde MySQL
        active_decisions = self.decision_store.get_active_decisions(
            user_id=identity.user_id, subject_id=identity.username, session_id=session_id
        )
        recent_turns = self.conv_store.get_recent_turns(
            conversation_id=cid, user_id=identity.user_id, limit=20
        )

        # 5. Construir contexto cognitivo con TokenBudgetManager
        initial_messages, stats = self.context_builder.build_initial_messages(
            query=query,
            identity=identity,
            active_decisions=active_decisions,
            recent_turns=recent_turns,
            pending_task=target_pending,
        )

        # 6. Inicializar estado del motor v2 y asignar mensajes hidratados
        state = self.engine.init_state(
            query=query,
            operator_username=identity.username,
            max_iterations=max_iterations,
            global_timeout_seconds=global_timeout_seconds,
            inference_timeout_seconds=inference_timeout_seconds,
            tool_timeout_seconds=tool_timeout_seconds,
        )
        state.execution_id = execution_id
        state.messages = list(initial_messages)

        # 7. Ejecutar bucle reutilizando AgentLoopEngine v2
        state = self.engine.execute_sync(state)

        # 8. Si hubo respuesta final, persistir turno en MySQL de forma idempotente
        if state.final_answer:
            turn = ConversationTurn(
                turn_id=tid,
                conversation_id=cid,
                user_id=identity.user_id,
                subject_id=identity.username,
                user_query=query,
                agent_response=state.final_answer,
                tokens_estimate=stats.get("query_tokens", 0) + self.budget_manager.estimate_tokens(state.final_answer),
            )
            self.conv_store.save_turn(turn)

        return state

    async def run_stream(
        self,
        query: str,
        user_persona: str = "usr_carlos",
        conversation_id: Optional[str] = None,
        turn_id: Optional[str] = None,
        session_id: Optional[str] = None,
        selected_value: Optional[str] = None,
        decision_id: Optional[str] = None,
        max_iterations: int = 5,
        global_timeout_seconds: float = 60.0,
        inference_timeout_seconds: float = 30.0,
        tool_timeout_seconds: float = 15.0,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Ejecuta el ciclo de Agent v3 emitiendo eventos SSE en tiempo real."""
        # 1. Resolver identidad y validar ownership
        identity = self._resolve_identity(user_persona)
        cid = self._ensure_conversation_ownership(conversation_id, identity)
        tid = turn_id or f"turn-{uuid.uuid4().hex[:8]}"
        execution_id = f"v3-exec-{uuid.uuid4().hex[:8]}"
        correlation_id = f"corr-{uuid.uuid4().hex[:8]}"

        # 2. Comprobar reanudación de tarea pendiente
        target_pending: Optional[PendingDecisionRecord] = None
        if decision_id:
            target_pending = self.decision_store.get_pending_task(decision_id, identity.user_id)
            if target_pending is None:
                raise ValidationError(f"La tarea pendiente '{decision_id}' no existe o no pertenece al usuario.")
            self._validate_pending_task_for_resumption(
                task=target_pending,
                identity=identity,
                cid=cid,
                selected_value=selected_value,
                conversation_id_provided=conversation_id,
            )
            if not conversation_id and target_pending.conversation_id:
                cid = target_pending.conversation_id
        elif session_id:
            target_pending = self.decision_store.get_active_pending_task_by_session(identity.user_id, session_id)
            if target_pending and selected_value:
                self._validate_pending_task_for_resumption(
                    task=target_pending,
                    identity=identity,
                    cid=cid,
                    selected_value=selected_value,
                    conversation_id_provided=conversation_id,
                )
                if not conversation_id and target_pending.conversation_id:
                    cid = target_pending.conversation_id

        if target_pending and target_pending.status == DecisionStatus.PENDING and selected_value:
            # 1. USER_REQUEST: notificación inicial de reanudación
            yield StreamEvent(
                event_id=f"evt-v3-{uuid.uuid4().hex[:10]}",
                agent_version="v3",
                execution_id=execution_id,
                iteration_index=0,
                phase="init",
                correlation_id=correlation_id,
                type="USER_REQUEST",
                payload={
                    "query": query or f"Reanudación HITL: {selected_value}",
                    "persona": identity.username,
                    "operator": identity.username,
                    "conversation_id": cid,
                    "decision_id": target_pending.decision_id,
                    "selected_value": selected_value,
                    "resuming_hitl": True,
                },
            )

            # 2. Herramienta reanudada: emitir TOOL_EXECUTION_STARTED para la proyección dual (V2LoopFlowComponent)
            tool_name = target_pending.target_tool_name
            merged_args = dict(target_pending.pending_tool_arguments)
            merged_args[target_pending.missing_parameter_name] = selected_value
            from src.agents.common.contracts import ToolCall
            tc = ToolCall(id=f"tc-res-{target_pending.decision_id}", name=tool_name, arguments=merged_args)

            yield StreamEvent(
                event_id=f"evt-v3-{uuid.uuid4().hex[:10]}",
                agent_version="v3",
                execution_id=execution_id,
                iteration_index=1,
                phase="execution",
                correlation_id=correlation_id,
                type="TOOL_EXECUTION_STARTED",
                payload={
                    "tool_call_id": tc.id,
                    "tool_name": tool_name,
                    "operator": identity.username,
                    "is_mutative": True,
                    "policy": "hitl_resumption",
                },
            )

            # 3. Adquisición atómica, comprobación MySQL, checkpoint y ejecución
            tool_res, success = self._handle_pending_task_resumption(
                task=target_pending,
                identity=identity,
                selected_value=selected_value,
                execution_id=execution_id,
            )

            # 4. TOOL_EXECUTION_COMPLETED para reflejar observación en V2LoopFlowComponent
            yield StreamEvent(
                event_id=f"evt-v3-{uuid.uuid4().hex[:10]}",
                agent_version="v3",
                execution_id=execution_id,
                iteration_index=1,
                phase="execution",
                correlation_id=correlation_id,
                type="TOOL_EXECUTION_COMPLETED",
                payload={
                    "tool_call_id": tc.id,
                    "tool_name": tool_name,
                    "execution_status": "success" if success else "failed",
                    "duration_ms": 18.0,
                    "is_mutative": True,
                    "idempotency_hit": False,
                    "result": tool_res,
                },
            )

            # 5. PENDING_TASK_RESOLVED para V3MemoryInspectorComponent
            yield event_v3_pending_task_resolved(execution_id, correlation_id, target_pending)

            # 6. FINAL_SYNTHESIS para ChatPanel y Runtime Inspector
            final_answer = (
                f"La tarea pendiente '{target_pending.decision_id}' ({target_pending.target_tool_name}) "
                f"ha sido reanudada y resuelta con el valor '{selected_value}'. "
                f"Resultado de la operación: {json.dumps(tool_res, ensure_ascii=False)}"
            )

            yield StreamEvent(
                event_id=f"evt-v3-{uuid.uuid4().hex[:10]}",
                agent_version="v3",
                execution_id=execution_id,
                iteration_index=1,
                phase="synthesis",
                correlation_id=correlation_id,
                type="FINAL_SYNTHESIS",
                payload={
                    "answer": final_answer,
                    "content": final_answer,
                    "message": final_answer,
                    "total_iterations": 1,
                },
            )

            # 7. RUN_COMPLETED para finalizar ciclo y remover loading en chat
            yield StreamEvent(
                event_id=f"evt-v3-{uuid.uuid4().hex[:10]}",
                agent_version="v3",
                execution_id=execution_id,
                iteration_index=1,
                phase="complete",
                correlation_id=correlation_id,
                type="RUN_COMPLETED",
                payload={
                    "status": "completed",
                    "stop_reason": "hitl_resumed",
                    "total_iterations": 1,
                    "total_tools_executed": 1,
                    "total_duration_ms": 35.0,
                },
            )

            # 8. Persistir turno y emitir TURN_PERSISTED
            turn = ConversationTurn(
                turn_id=tid,
                conversation_id=cid,
                user_id=identity.user_id,
                subject_id=identity.username,
                user_query=query or f"Opción seleccionada: {selected_value}",
                agent_response=final_answer,
                tokens_estimate=self.budget_manager.estimate_tokens(final_answer),
            )
            self.conv_store.save_turn(turn)
            yield event_v3_turn_persisted(execution_id, correlation_id, tid, cid)
            return

        # 3. Detectar preferencias explícitas y revocaciones
        saved_dec = self._detect_and_handle_preference_intent(query, identity, session_id)
        if saved_dec:
            yield event_v3_decision_saved(execution_id, correlation_id, saved_dec)

        revoked_key = self._detect_and_handle_preference_revocation(query, identity)
        if revoked_key:
            yield event_v3_decision_revoked(execution_id, correlation_id, revoked_key)

        # 4. Hidratar memoria desde MySQL
        active_decisions = self.decision_store.get_active_decisions(
            user_id=identity.user_id, subject_id=identity.username, session_id=session_id
        )
        recent_turns = self.conv_store.get_recent_turns(
            conversation_id=cid, user_id=identity.user_id, limit=20
        )

        # 5. Construir contexto cognitivo
        initial_messages, stats = self.context_builder.build_initial_messages(
            query=query,
            identity=identity,
            active_decisions=active_decisions,
            recent_turns=recent_turns,
            pending_task=target_pending,
        )

        # Emitir evento SSE de hidratación de memoria
        yield event_v3_memory_hydrated(execution_id, correlation_id, cid, stats, active_decisions)

        # 6. Inicializar estado del motor v2
        state = self.engine.init_state(
            query=query,
            operator_username=identity.username,
            max_iterations=max_iterations,
            global_timeout_seconds=global_timeout_seconds,
            inference_timeout_seconds=inference_timeout_seconds,
            tool_timeout_seconds=tool_timeout_seconds,
        )
        state.execution_id = execution_id
        state.correlation_id = correlation_id
        state.messages = list(initial_messages)

        # 7. Ejecutar stream de AgentLoopEngine v2 (reutilización por composición)
        async for evt in self.engine.execute_stream(state):
            evt.agent_version = "v3"
            yield evt

        # 8. Persistir turno al finalizar
        if state.final_answer:
            turn = ConversationTurn(
                turn_id=tid,
                conversation_id=cid,
                user_id=identity.user_id,
                subject_id=identity.username,
                user_query=query,
                agent_response=state.final_answer,
                tokens_estimate=stats.get("query_tokens", 0) + self.budget_manager.estimate_tokens(state.final_answer),
            )
            self.conv_store.save_turn(turn)
            yield event_v3_turn_persisted(execution_id, correlation_id, tid, cid)


def run_agent_v3(
    user_query: str,
    user_persona: str = "usr_carlos",
    conversation_id: Optional[str] = None,
    turn_id: Optional[str] = None,
    session_id: Optional[str] = None,
    selected_value: Optional[str] = None,
    decision_id: Optional[str] = None,
    provider: Optional[ModelProvider] = None,
) -> str:
    """Función de conveniencia para invocar Agent v3 de forma síncrona."""
    orchestrator = AgentV3Orchestrator(provider=provider)
    state = orchestrator.run(
        query=user_query,
        user_persona=user_persona,
        conversation_id=conversation_id,
        turn_id=turn_id,
        session_id=session_id,
        selected_value=selected_value,
        decision_id=decision_id,
    )
    return state.final_answer or state.error_message or "Sin respuesta."


async def run_agent_v3_stream(
    request: ChatRequest,
) -> AsyncGenerator[StreamEvent, None]:
    """Despachador SSE registrado para Agent v3."""
    orchestrator = AgentV3Orchestrator()
    # Extraer campos opcionales si vienen en ChatRequest
    cid = getattr(request, "conversation_id", None)
    tid = getattr(request, "turn_id", None)
    sid = getattr(request, "session_id", None)
    sel = getattr(request, "selected_value", None)
    did = getattr(request, "decision_id", None)

    async for evt in orchestrator.run_stream(
        query=request.query,
        user_persona=request.user_persona,
        conversation_id=cid,
        turn_id=tid,
        session_id=sid,
        selected_value=sel,
        decision_id=did,
    ):
        yield evt
