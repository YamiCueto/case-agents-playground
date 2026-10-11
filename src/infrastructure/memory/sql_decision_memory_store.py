import random
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from src.application.memory.ports import DecisionMemoryStore
from src.domain.exceptions import SensitiveDataPolicyError, UnauthorizedActionError, ValidationError
from src.domain.memory.entities import DecisionRecord, PendingDecisionRecord
from src.domain.memory.enums import DecisionStatus, MemoryScope, ProvenanceType
from src.domain.memory.policy import MemoryPolicy
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.database.models import (
    AgentDecisionModel,
    AgentPendingTaskModel,
)


class SqlDecisionMemoryStore(DecisionMemoryStore):
    """
    Implementación en MySQL para el almacenamiento y gestión de decisiones,
    preferencias y tareas pendientes (pausa y reanudación segura).

    Garantías:
    1. Aislamiento estricto por user_id.
    2. Evaluación obligatoria de MemoryPolicy antes de persistir (cero secretos, no inferencias de LLM).
    3. Transición atómica en MySQL para evitar doble ejecución de tareas concurrentes.
    4. Idempotencia y actualización limpia (upsert) de preferencias existentes.
    """

    def __init__(
        self,
        session_factory: Optional[Callable[[], Session]] = None,
        session: Optional[Session] = None,
    ) -> None:
        self.session_factory = session_factory or get_app_session_factory()
        self._session = session

    def _get_session(self) -> Session:
        return self._session if self._session is not None else self.session_factory()

    def _should_close(self) -> bool:
        return self._session is None

    def save_decision(
        self,
        record: DecisionRecord,
        explicit_user_confirmation: bool = False,
    ) -> DecisionRecord:
        """
        Guarda o actualiza una decisión previa evaluación de MemoryPolicy.
        Garantiza atómicamente exactamente una versión activa por clave de preferencia
        a nivel de motor MySQL mediante active_lock_key y reintentos ante colisiones concurrentes.
        """
        # 1. Evaluar política de seguridad y procedencia antes de cualquier escritura
        eval_res = MemoryPolicy.evaluate_decision_persistence(
            key=record.key,
            value=record.value,
            scope=record.scope,
            provenance=record.provenance,
            rationale=record.rationale,
            explicit_user_confirmation=explicit_user_confirmation,
        )

        if not eval_res.is_allowed:
            raise SensitiveDataPolicyError(
                pattern_detected=eval_res.detected_violation or eval_res.reason,
                field_name=record.key,
            )

        sanitized_val = eval_res.sanitized_value
        clean_rationale = MemoryPolicy.sanitize_text(record.rationale)

        # Candado lógico único para el estado activo:
        lock_key = f"usr_{record.user_id}:{record.scope.value}:{record.key}:{record.session_id or 'global'}"

        max_attempts = 8
        for attempt in range(max_attempts):
            session = self._get_session()
            should_close = self._should_close()
            try:
                # 2. Idempotencia: si ya existe exactamente esta decisión por decision_id,
                # retornar el registro existente de forma inmutable sin mutar la auditoría histórica.
                existing_by_id = session.scalar(
                    select(AgentDecisionModel).where(
                        AgentDecisionModel.decision_id == record.decision_id
                    )
                )
                if existing_by_id is not None:
                    if existing_by_id.user_id != record.user_id:
                        raise UnauthorizedActionError(
                            user_role="USER",
                            action=f"El usuario id={record.user_id} no puede modificar la decisión '{record.decision_id}' de otro usuario.",
                        )
                    return DecisionRecord(
                        decision_id=existing_by_id.decision_id,
                        user_id=existing_by_id.user_id,
                        subject_id=existing_by_id.subject_id,
                        scope=record.scope,
                        key=existing_by_id.decision_key,
                        value=existing_by_id.decision_value,
                        rationale=existing_by_id.rationale,
                        provenance=ProvenanceType(existing_by_id.provenance),
                        session_id=existing_by_id.session_id,
                        status=DecisionStatus(existing_by_id.status),
                        version=existing_by_id.version,
                        supersedes_decision_id=existing_by_id.supersedes_decision_id,
                        active_lock_key=existing_by_id.active_lock_key,
                        created_at=existing_by_id.created_at,
                        revoked_at=existing_by_id.revoked_at,
                    )

                # 3. Localizar versión activa existente mediante lock_key con SELECT FOR UPDATE
                existing_active = session.scalar(
                    select(AgentDecisionModel)
                    .where(AgentDecisionModel.active_lock_key == lock_key)
                    .with_for_update()
                )
                next_version = 1
                superseded_id = None
                if existing_active is not None:
                    existing_active.status = "revoked"
                    existing_active.revoked_at = func.now()
                    existing_active.active_lock_key = None  # Liberar candado físico para la nueva versión
                    next_version = existing_active.version + 1
                    superseded_id = existing_active.decision_id
                    session.flush()

                # 4. Inserción de nueva decisión versionada con candado activo único
                new_decision = AgentDecisionModel(
                    decision_id=record.decision_id,
                    user_id=record.user_id,
                    subject_id=record.subject_id,
                    session_id=record.session_id,
                    scope=record.scope.value,
                    decision_key=record.key,
                    decision_value=sanitized_val,
                    rationale=clean_rationale,
                    provenance=record.provenance.value,
                    status=DecisionStatus.RESOLVED.value,
                    version=next_version,
                    supersedes_decision_id=superseded_id,
                    active_lock_key=lock_key,
                )
                session.add(new_decision)
                session.commit()

                return DecisionRecord(
                    decision_id=new_decision.decision_id,
                    user_id=new_decision.user_id,
                    subject_id=new_decision.subject_id,
                    scope=record.scope,
                    key=new_decision.decision_key,
                    value=new_decision.decision_value,
                    rationale=new_decision.rationale,
                    provenance=record.provenance,
                    session_id=new_decision.session_id,
                    status=DecisionStatus.RESOLVED,
                    version=new_decision.version,
                    supersedes_decision_id=new_decision.supersedes_decision_id,
                    active_lock_key=new_decision.active_lock_key,
                    created_at=new_decision.created_at,
                )
            except (IntegrityError, OperationalError):
                session.rollback()
                if attempt == max_attempts - 1:
                    raise
                time.sleep(0.02 * (attempt + 1) + random.uniform(0.005, 0.025))
            except Exception:
                session.rollback()
                raise
            finally:
                if should_close:
                    session.close()

    def get_active_decisions(
        self,
        user_id: int,
        subject_id: str,
        session_id: Optional[str] = None,
    ) -> List[DecisionRecord]:
        """
        Recupera decisiones activas autorizadas aisladas estrictamente por user_id.
        Garantiza que sólo aquellas con active_lock_key no nulo y revoked_at nulo son retornadas.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            stmt = select(AgentDecisionModel).where(
                AgentDecisionModel.user_id == user_id,
                AgentDecisionModel.status == "resolved",
                AgentDecisionModel.revoked_at.is_(None),
                AgentDecisionModel.active_lock_key.is_not(None),
            )
            models = session.scalars(stmt).all()
            results: List[DecisionRecord] = []

            for m in models:
                m_scope = MemoryScope(m.scope)
                if m_scope == MemoryScope.PERSISTENT:
                    results.append(
                        DecisionRecord(
                            decision_id=m.decision_id,
                            user_id=m.user_id,
                            subject_id=m.subject_id,
                            scope=m_scope,
                            key=m.decision_key,
                            value=m.decision_value,
                            rationale=m.rationale,
                            provenance=ProvenanceType(m.provenance),
                            session_id=m.session_id,
                            status=DecisionStatus.RESOLVED,
                            version=m.version,
                            supersedes_decision_id=m.supersedes_decision_id,
                            active_lock_key=m.active_lock_key,
                            created_at=m.created_at,
                        )
                    )
                elif m_scope == MemoryScope.SESSION and session_id and m.session_id == session_id:
                    results.append(
                        DecisionRecord(
                            decision_id=m.decision_id,
                            user_id=m.user_id,
                            subject_id=m.subject_id,
                            scope=m_scope,
                            key=m.decision_key,
                            value=m.decision_value,
                            rationale=m.rationale,
                            provenance=ProvenanceType(m.provenance),
                            session_id=m.session_id,
                            status=DecisionStatus.RESOLVED,
                            version=m.version,
                            supersedes_decision_id=m.supersedes_decision_id,
                            active_lock_key=m.active_lock_key,
                            created_at=m.created_at,
                        )
                    )

            return results
        finally:
            if should_close:
                session.close()

    def get_decision_history(self, decision_key: str, user_id: int) -> List[DecisionRecord]:
        """
        Recupera la cadena histórica completa de versiones y revocaciones para una clave de decisión.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            stmt = (
                select(AgentDecisionModel)
                .where(
                    AgentDecisionModel.user_id == user_id,
                    AgentDecisionModel.decision_key == decision_key,
                )
                .order_by(AgentDecisionModel.version.asc(), AgentDecisionModel.created_at.asc())
            )
            models = session.scalars(stmt).all()
            return [
                DecisionRecord(
                    decision_id=m.decision_id,
                    user_id=m.user_id,
                    subject_id=m.subject_id,
                    scope=MemoryScope(m.scope),
                    key=m.decision_key,
                    value=m.decision_value,
                    rationale=m.rationale,
                    provenance=ProvenanceType(m.provenance),
                    session_id=m.session_id,
                    status=DecisionStatus(m.status),
                    version=m.version,
                    supersedes_decision_id=m.supersedes_decision_id,
                    active_lock_key=m.active_lock_key,
                    created_at=m.created_at,
                    revoked_at=m.revoked_at,
                )
                for m in models
            ]
        finally:
            if should_close:
                session.close()


    def revoke_decision(self, decision_id: str, user_id: int) -> bool:
        """
        Revoca transaccionalmente una decisión verificando aislamiento por user_id y liberando active_lock_key.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            existing = session.scalar(
                select(AgentDecisionModel).where(
                    AgentDecisionModel.decision_id == decision_id
                )
            )
            if existing is None:
                return False

            if existing.user_id != user_id:
                raise UnauthorizedActionError(
                    user_role="USER",
                    action=f"El usuario id={user_id} no es propietario de la decisión '{decision_id}'.",
                )

            existing.status = DecisionStatus.REVOKED.value
            existing.revoked_at = func.now()
            existing.active_lock_key = None
            session.commit()
            return True
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()


    def save_pending_task(self, task: PendingDecisionRecord) -> PendingDecisionRecord:
        """
        Registra una tarea pendiente de resolución tras sanitizar sus argumentos y consultas.
        """
        clean_query = MemoryPolicy.sanitize_text(task.original_query)
        clean_question = MemoryPolicy.sanitize_text(task.question)
        clean_options = [MemoryPolicy.sanitize_text(str(opt)) for opt in task.options] if isinstance(task.options, list) else task.options
        clean_args = MemoryPolicy.sanitize_payload(task.pending_tool_arguments)

        session = self._get_session()
        should_close = self._should_close()
        try:
            # Comprobar si ya existe
            existing = session.scalar(
                select(AgentPendingTaskModel).where(
                    AgentPendingTaskModel.decision_id == task.decision_id
                )
            )
            if existing is not None:
                if existing.user_id != task.user_id:
                    raise UnauthorizedActionError(
                        user_role="USER",
                        action=f"El usuario id={task.user_id} no puede modificar la tarea '{task.decision_id}' de otro usuario.",
                    )
                existing.original_query = clean_query
                existing.question = clean_question
                existing.options = clean_options
                existing.pending_tool_arguments = clean_args
                existing.status = task.status.value
                existing.lease_owner = task.lease_owner
                existing.lease_expires_at = task.lease_expires_at
                existing.idempotency_token = task.idempotency_token or f"idem-{task.decision_id}"
                existing.execution_checkpoint = task.execution_checkpoint
                existing.recovery_reason = task.recovery_reason
                session.commit()
                return task

            new_task = AgentPendingTaskModel(
                decision_id=task.decision_id,
                user_id=task.user_id,
                subject_id=task.subject_id,
                session_id=task.session_id,
                conversation_id=task.conversation_id,
                original_query=clean_query,
                question=clean_question,
                options=clean_options,
                allow_custom_answer=task.allow_custom_answer,
                target_tool_name=task.target_tool_name,
                pending_tool_arguments=clean_args,
                missing_parameter_name=task.missing_parameter_name,
                required_role=task.required_role,
                status=task.status.value,
                lease_owner=task.lease_owner,
                lease_expires_at=task.lease_expires_at,
                idempotency_token=task.idempotency_token or f"idem-{task.decision_id}",
                execution_checkpoint=task.execution_checkpoint,
                recovery_reason=task.recovery_reason,
            )
            session.add(new_task)
            session.commit()
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def get_pending_task(self, decision_id: str, user_id: int) -> Optional[PendingDecisionRecord]:
        session = self._get_session()
        should_close = self._should_close()
        try:
            model = session.scalar(
                select(AgentPendingTaskModel).where(
                    AgentPendingTaskModel.decision_id == decision_id
                )
            )
            if model is None:
                return None

            if model.user_id != user_id:
                raise UnauthorizedActionError(
                    user_role="USER",
                    action=f"El usuario id={user_id} no tiene permiso para consultar la tarea '{decision_id}'.",
                )

            return PendingDecisionRecord(
                decision_id=model.decision_id,
                user_id=model.user_id,
                subject_id=model.subject_id,
                session_id=model.session_id,
                conversation_id=model.conversation_id,
                original_query=model.original_query,
                question=model.question,
                options=model.options,
                allow_custom_answer=model.allow_custom_answer,
                target_tool_name=model.target_tool_name,
                pending_tool_arguments=model.pending_tool_arguments,
                missing_parameter_name=model.missing_parameter_name,
                required_role=model.required_role,
                status=DecisionStatus(model.status),
                selected_value=model.selected_value,
                lease_owner=model.lease_owner,
                lease_expires_at=model.lease_expires_at,
                idempotency_token=model.idempotency_token,
                execution_checkpoint=model.execution_checkpoint,
                recovery_reason=model.recovery_reason,
                created_at=model.created_at,
                resolved_at=model.resolved_at,
            )
        finally:
            if should_close:
                session.close()

    def get_active_pending_task_by_session(
        self, user_id: int, session_id: str
    ) -> Optional[PendingDecisionRecord]:
        session = self._get_session()
        should_close = self._should_close()
        try:
            model = session.scalar(
                select(AgentPendingTaskModel).where(
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.session_id == session_id,
                    AgentPendingTaskModel.status == "pending",
                )
            )
            if model is None:
                return None

            return PendingDecisionRecord(
                decision_id=model.decision_id,
                user_id=model.user_id,
                subject_id=model.subject_id,
                session_id=model.session_id,
                conversation_id=model.conversation_id,
                original_query=model.original_query,
                question=model.question,
                options=model.options,
                allow_custom_answer=model.allow_custom_answer,
                target_tool_name=model.target_tool_name,
                pending_tool_arguments=model.pending_tool_arguments,
                missing_parameter_name=model.missing_parameter_name,
                required_role=model.required_role,
                status=DecisionStatus(model.status),
                selected_value=model.selected_value,
                lease_owner=model.lease_owner,
                lease_expires_at=model.lease_expires_at,
                idempotency_token=model.idempotency_token,
                execution_checkpoint=model.execution_checkpoint,
                recovery_reason=model.recovery_reason,
                created_at=model.created_at,
                resolved_at=model.resolved_at,
            )
        finally:
            if should_close:
                session.close()

    def atomic_acquire_for_resolving(
        self,
        decision_id: str,
        user_id: int,
        lease_owner: Optional[str] = None,
        lease_seconds: int = 300,
    ) -> PendingDecisionRecord:
        """
        Adquisición atómica condicional: transición 'pending' -> 'resolving' con lease y vencimiento.
        Garantiza que sólo un hilo o proceso en ejecución tome la tarea pendiente.
        """
        session = self._get_session()
        should_close = self._should_close()
        owner = lease_owner or str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc)
        expires_at = now_utc + timedelta(seconds=lease_seconds)
        try:
            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.status == "pending",
                )
                .values(
                    status="resolving",
                    lease_owner=owner,
                    lease_expires_at=expires_at,
                )
            )
            result = session.execute(stmt)
            if result.rowcount == 0:
                existing = session.scalar(
                    select(AgentPendingTaskModel).where(
                        AgentPendingTaskModel.decision_id == decision_id
                    )
                )
                if existing is None:
                    raise ValidationError(f"La tarea pendiente '{decision_id}' no existe.")
                if existing.user_id != user_id:
                    raise UnauthorizedActionError(
                        user_role="USER",
                        action=f"El usuario id={user_id} no es propietario de la tarea '{decision_id}'.",
                    )
                raise ValidationError(
                    f"La tarea pendiente '{decision_id}' ya no se encuentra en estado 'pending' (estado actual: '{existing.status}')."
                )

            session.commit()
            task = self.get_pending_task(decision_id=decision_id, user_id=user_id)
            if task is None:
                raise ValidationError(f"No se pudo recuperar la tarea '{decision_id}'.")
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def atomic_reclaim_expired_task(
        self, decision_id: str, user_id: int
    ) -> PendingDecisionRecord:
        """
        Transiciona tareas con lease vencido desde 'resolving' a 'recovery_required'.
        Cumple AUD-04: Nunca reejecuta automáticamente una mutación cuyo resultado sea incierto.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            now_utc = datetime.now(timezone.utc)
            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.status == "resolving",
                    AgentPendingTaskModel.lease_expires_at <= now_utc,
                )
                .values(
                    status="recovery_required",
                    recovery_reason="Lease expirado durante resolving. Resultado de herramienta potencialmente incierto.",
                    lease_owner=None,
                    lease_expires_at=None,
                )
            )
            res = session.execute(stmt)
            if res.rowcount == 0:
                existing = session.scalar(
                    select(AgentPendingTaskModel).where(
                        AgentPendingTaskModel.decision_id == decision_id
                    )
                )
                if existing is None:
                    raise ValidationError(f"La tarea pendiente '{decision_id}' no existe.")
                if existing.user_id != user_id:
                    raise UnauthorizedActionError(
                        user_role="USER",
                        action=f"El usuario id={user_id} no es propietario de la tarea '{decision_id}'.",
                    )
                raise ValidationError(
                    f"No se puede recuperar la tarea '{decision_id}': su lease no ha expirado o su estado no es 'resolving' (estado actual: '{existing.status}')."
                )
            session.commit()
            task = self.get_pending_task(decision_id, user_id)
            if task is None:
                raise ValidationError(f"No se pudo recuperar la tarea '{decision_id}'.")
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def record_execution_checkpoint(
        self, decision_id: str, user_id: int, checkpoint: dict
    ) -> PendingDecisionRecord:
        """
        Registra un punto de control de ejecución externa para idempotencia end-to-end.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                )
                .values(
                    execution_checkpoint=checkpoint,
                )
            )
            res = session.execute(stmt)
            if res.rowcount == 0:
                raise ValidationError(f"La tarea '{decision_id}' no existe o no pertenece al usuario.")
            session.commit()
            task = self.get_pending_task(decision_id, user_id)
            if task is None:
                raise ValidationError(f"No se pudo recuperar la tarea '{decision_id}'.")
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def reconcile_and_resolve(
        self, decision_id: str, user_id: int, selected_value: str, reconciliation_note: str
    ) -> PendingDecisionRecord:
        """
        Reconciliación explícita tras verificar que la mutación externa SÍ tuvo éxito:
        Transición 'recovery_required' -> 'resolved'.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            clean_val = MemoryPolicy.sanitize_text(str(selected_value).strip())
            clean_note = MemoryPolicy.sanitize_text(str(reconciliation_note).strip())
            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.status == "recovery_required",
                )
                .values(
                    status="resolved",
                    selected_value=clean_val,
                    recovery_reason=f"Reconciliado con éxito: {clean_note}",
                    resolved_at=func.now(),
                )
            )
            res = session.execute(stmt)
            if res.rowcount == 0:
                raise ValidationError(f"La tarea '{decision_id}' no está en estado 'recovery_required'.")
            session.commit()
            task = self.get_pending_task(decision_id, user_id)
            if task is None:
                raise ValidationError(f"No se pudo recuperar la tarea '{decision_id}'.")
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def reconcile_and_reset_to_pending(
        self, decision_id: str, user_id: int, reconciliation_note: str
    ) -> PendingDecisionRecord:
        """
        Reconciliación explícita tras verificar que la mutación externa NO se ejecutó:
        Transición segura 'recovery_required' -> 'pending'.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            clean_note = MemoryPolicy.sanitize_text(str(reconciliation_note).strip())
            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.status == "recovery_required",
                )
                .values(
                    status="pending",
                    recovery_reason=f"Reconciliado y rearmado: {clean_note}",
                    lease_owner=None,
                    lease_expires_at=None,
                )
            )
            res = session.execute(stmt)
            if res.rowcount == 0:
                raise ValidationError(f"La tarea '{decision_id}' no está en estado 'recovery_required'.")
            session.commit()
            task = self.get_pending_task(decision_id, user_id)
            if task is None:
                raise ValidationError(f"No se pudo recuperar la tarea '{decision_id}'.")
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def atomic_resolve_task(
        self,
        decision_id: str,
        user_id: int,
        selected_value: str,
    ) -> PendingDecisionRecord:
        """
        Transición atómica condicional: EXCLUSIVAMENTE 'resolving' -> 'resolved'.
        Requiere que la tarea haya sido adquirida previamente tras la ejecución exitosa de la herramienta.
        Sanitiza el valor seleccionado antes de persistir en MySQL.
        """
        if not selected_value or not str(selected_value).strip():
            raise ValidationError("El valor seleccionado no puede ser vacío.")

        clean_value = MemoryPolicy.sanitize_text(str(selected_value).strip())
        session = self._get_session()
        should_close = self._should_close()
        try:
            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.status == "resolving",
                )
                .values(
                    status="resolved",
                    selected_value=clean_value,
                    lease_owner=None,
                    lease_expires_at=None,
                    resolved_at=func.now(),
                )
            )
            result = session.execute(stmt)
            if result.rowcount == 0:
                existing = session.scalar(
                    select(AgentPendingTaskModel).where(
                        AgentPendingTaskModel.decision_id == decision_id
                    )
                )
                if existing is None:
                    raise ValidationError(f"La tarea pendiente '{decision_id}' no existe.")
                if existing.user_id != user_id:
                    raise UnauthorizedActionError(
                        user_role="USER",
                        action=f"El usuario id={user_id} no es propietario de la tarea '{decision_id}'.",
                    )
                if existing.status == "pending":
                    raise ValidationError(
                        f"Transición de estado inválida: la tarea '{decision_id}' se encuentra en estado 'pending'. "
                        "Debe ser adquirida ('resolving') tras ejecutar la herramienta antes de resolverse."
                    )
                raise ValidationError(
                    f"Transición de estado inválida: la tarea pendiente '{decision_id}' no está en estado 'resolving' (estado actual: '{existing.status}')."
                )

            session.commit()
            task = self.get_pending_task(decision_id=decision_id, user_id=user_id)
            if task is None:
                raise ValidationError(f"No se pudo recuperar la tarea '{decision_id}'.")
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def atomic_acquire_and_resolve_task(
        self,
        decision_id: str,
        user_id: int,
        selected_value: str,
        lease_owner: Optional[str] = None,
        lease_seconds: int = 300,
    ) -> PendingDecisionRecord:
        """
        Adquisición y resolución en dos fases obligatorias y controladas:
        Fase 1: Adquirir atómicamente ('pending' -> 'resolving').
        Fase 2: Resolver atómicamente ('resolving' -> 'resolved').
        """
        self.atomic_acquire_for_resolving(
            decision_id=decision_id,
            user_id=user_id,
            lease_owner=lease_owner,
            lease_seconds=lease_seconds,
        )
        return self.atomic_resolve_task(
            decision_id=decision_id,
            user_id=user_id,
            selected_value=selected_value,
        )


    def atomic_fail_task(
        self,
        decision_id: str,
        user_id: int,
        reason: Optional[str] = None,
    ) -> PendingDecisionRecord:
        """
        Transición atómica condicional hacia estado 'failed'.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            clean_reason = MemoryPolicy.sanitize_text(str(reason).strip()) if reason else None
            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.status.in_(["pending", "resolving", "recovery_required"]),
                )
                .values(
                    status="failed",
                    recovery_reason=clean_reason,
                    lease_owner=None,
                    lease_expires_at=None,
                    resolved_at=func.now(),
                )
            )
            result = session.execute(stmt)
            if result.rowcount == 0:
                existing = session.scalar(
                    select(AgentPendingTaskModel).where(
                        AgentPendingTaskModel.decision_id == decision_id
                    )
                )
                if existing is None:
                    raise ValidationError(f"La tarea pendiente '{decision_id}' no existe.")
                if existing.user_id != user_id:
                    raise UnauthorizedActionError(
                        user_role="USER",
                        action=f"El usuario id={user_id} no es propietario de la tarea '{decision_id}'.",
                    )
                raise ValidationError(
                    f"La tarea pendiente '{decision_id}' no se puede marcar como fallida desde su estado actual ('{existing.status}')."
                )

            session.commit()
            task = self.get_pending_task(decision_id=decision_id, user_id=user_id)
            if task is None:
                raise ValidationError(f"No se pudo recuperar la tarea '{decision_id}'.")
            return task
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def cancel_pending_task(self, decision_id: str, user_id: int) -> bool:
        """
        Cancela transaccionalmente una tarea pendiente o en proceso de resolución,
        verificando aislamiento obligatorio por user_id.
        """
        session = self._get_session()
        should_close = self._should_close()
        try:
            existing = session.scalar(
                select(AgentPendingTaskModel).where(
                    AgentPendingTaskModel.decision_id == decision_id
                )
            )
            if existing is None:
                return False

            if existing.user_id != user_id:
                raise UnauthorizedActionError(
                    user_role="USER",
                    action=f"El usuario id={user_id} no es propietario de la tarea '{decision_id}'.",
                )

            if existing.status not in ["pending", "resolving", "recovery_required"]:
                return False

            stmt = (
                update(AgentPendingTaskModel)
                .where(
                    AgentPendingTaskModel.decision_id == decision_id,
                    AgentPendingTaskModel.user_id == user_id,
                    AgentPendingTaskModel.status.in_(["pending", "resolving", "recovery_required"]),
                )
                .values(
                    status="cancelled",
                    lease_owner=None,
                    lease_expires_at=None,
                )
            )
            result = session.execute(stmt)
            session.commit()
            return result.rowcount > 0
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

