from datetime import datetime, timezone
from typing import Callable, List, Optional
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from src.application.memory.ports import ConversationMemoryStore
from src.domain.exceptions import UnauthorizedActionError, ValidationError
from src.domain.memory.entities import ConversationSession, ConversationTurn
from src.domain.memory.policy import MemoryPolicy
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.database.models import (
    AgentConversationMessageModel,
    AgentConversationModel,
)


class SqlConversationMemoryStore(ConversationMemoryStore):
    """
    Implementación en MySQL para el almacenamiento y recuperación de conversaciones.

    Garantías:
    1. Aislamiento obligatorio mediante user_id y conversation_id.
    2. Sanitización estricta de textos antes de persistir (cero secretos).
    3. Manejo transaccional atómico con soporte de sesión inyectada o session_factory.
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

    def create_or_get_conversation(
        self,
        user_id: int,
        subject_id: str,
        conversation_id: str,
        title: Optional[str] = None,
    ) -> ConversationSession:
        if user_id <= 0:
            raise ValidationError("user_id debe ser un entero positivo.")
        if not conversation_id or not conversation_id.strip():
            raise ValidationError("conversation_id no puede ser vacío.")

        session = self._get_session()
        should_close = self._should_close()
        try:
            stmt = select(AgentConversationModel).where(
                AgentConversationModel.conversation_id == conversation_id
            )
            model = session.scalar(stmt)
            if model is not None:
                # Comprobar aislamiento de propiedad
                if model.user_id != user_id:
                    raise UnauthorizedActionError(
                        user_role="USER",
                        action=f"El usuario id={user_id} no es propietario de la conversación '{conversation_id}'.",
                    )
                return ConversationSession(
                    conversation_id=model.conversation_id,
                    user_id=model.user_id,
                    subject_id=model.subject_id,
                    title=model.title,
                    created_at=model.created_at,
                    updated_at=model.updated_at,
                )

            # Sanitizar título antes de crear
            clean_title = MemoryPolicy.sanitize_text(title or "Nueva Conversación")
            new_conv = AgentConversationModel(
                conversation_id=conversation_id,
                user_id=user_id,
                subject_id=subject_id,
                title=clean_title,
            )
            session.add(new_conv)
            session.commit()
            return ConversationSession(
                conversation_id=new_conv.conversation_id,
                user_id=new_conv.user_id,
                subject_id=new_conv.subject_id,
                title=new_conv.title,
                created_at=new_conv.created_at,
                updated_at=new_conv.updated_at,
            )
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def save_turn(self, turn: ConversationTurn) -> None:
        """
        Persiste un turno completo (consulta de usuario y respuesta del asistente).
        Aplica sanitización de secretos en ambos mensajes antes de la escritura.
        """
        # Sanitizar textos para asegurar que ningún secreto llegue a MySQL
        clean_user_query = MemoryPolicy.sanitize_text(turn.user_query)
        clean_agent_response = MemoryPolicy.sanitize_text(turn.agent_response)

        session = self._get_session()
        should_close = self._should_close()
        try:
            # 1. Verificar o crear la conversación para este usuario
            stmt = select(AgentConversationModel).where(
                AgentConversationModel.conversation_id == turn.conversation_id
            )
            conv_model = session.scalar(stmt)
            if conv_model is None:
                conv_model = AgentConversationModel(
                    conversation_id=turn.conversation_id,
                    user_id=turn.user_id,
                    subject_id=turn.subject_id,
                    title="Nueva Conversación",
                )
                session.add(conv_model)
                session.flush()
            else:
                if conv_model.user_id != turn.user_id:
                    raise UnauthorizedActionError(
                        user_role="USER",
                        action=f"El usuario id={turn.user_id} no es propietario de la conversación '{turn.conversation_id}'.",
                    )

            # 2. Idempotencia basada estrictamente en turn_id / request_id estable:
            existing_turn = session.scalar(
                select(AgentConversationMessageModel).where(
                    AgentConversationMessageModel.conversation_id == turn.conversation_id,
                    AgentConversationMessageModel.turn_id == turn.turn_id,
                ).limit(1)
            )
            if existing_turn is not None:
                # Reintento de solicitud ya procesada: retornar de forma segura e idempotente
                return

            half_tokens = max(1, turn.tokens_estimate // 2)

            msg_user = AgentConversationMessageModel(
                conversation_id=turn.conversation_id,
                turn_id=turn.turn_id,
                sequence_id=0,
                role="user",
                content=clean_user_query,
                tokens_count=half_tokens,
            )
            msg_agent = AgentConversationMessageModel(
                conversation_id=turn.conversation_id,
                turn_id=turn.turn_id,
                sequence_id=1,
                role="assistant",
                content=clean_agent_response,
                tokens_count=half_tokens,
            )
            session.add_all([msg_user, msg_agent])
            conv_model.updated_at = func.now()
            session.commit()
        except IntegrityError:
            session.rollback()
            # Concurrencia / Reintento: la restricción UNIQUE 'uq_conv_turn_role'
            # garantiza que sólo una transacción persiste el turno. Si ya existe,
            # consideramos el reintento completado de forma idempotente y segura.
            check = session.scalar(
                select(AgentConversationMessageModel).where(
                    AgentConversationMessageModel.conversation_id == turn.conversation_id,
                    AgentConversationMessageModel.turn_id == turn.turn_id,
                ).limit(1)
            )
            if check is not None:
                return
            raise
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

    def get_conversation(self, conversation_id: str, user_id: int) -> Optional[ConversationSession]:
        session = self._get_session()
        should_close = self._should_close()
        try:
            # Verificar existencia y propiedad
            model = session.scalar(
                select(AgentConversationModel).where(
                    AgentConversationModel.conversation_id == conversation_id
                )
            )
            if model is None:
                return None

            if model.user_id != user_id:
                raise UnauthorizedActionError(
                    user_role="USER",
                    action=f"El usuario id={user_id} no es propietario de la conversación '{conversation_id}'.",
                )

            conv_session = ConversationSession(
                conversation_id=model.conversation_id,
                user_id=model.user_id,
                subject_id=model.subject_id,
                title=model.title,
                created_at=model.created_at,
                updated_at=model.updated_at,
            )
            # Cargar turnos
            turns = self.get_recent_turns(conversation_id=conversation_id, user_id=user_id, limit=50)
            conv_session.turns = turns
            return conv_session
        finally:
            if should_close:
                session.close()

    def get_recent_turns(
        self, conversation_id: str, user_id: int, limit: int = 10
    ) -> List[ConversationTurn]:
        session = self._get_session()
        should_close = self._should_close()
        try:
            # Validar existencia y propiedad
            conv = session.scalar(
                select(AgentConversationModel).where(
                    AgentConversationModel.conversation_id == conversation_id
                )
            )
            if conv is None:
                return []

            if conv.user_id != user_id:
                raise UnauthorizedActionError(
                    user_role="USER",
                    action=f"El usuario id={user_id} no es propietario de la conversación '{conversation_id}'.",
                )

            # Recuperar mensajes en orden cronológico
            stmt = (
                select(AgentConversationMessageModel)
                .where(AgentConversationMessageModel.conversation_id == conversation_id)
                .order_by(AgentConversationMessageModel.id.asc())
            )
            messages = session.scalars(stmt).all()
            if not messages:
                return []

            # Agrupar en pares (user, assistant)
            turns: List[ConversationTurn] = []
            pending_user: Optional[AgentConversationMessageModel] = None

            for msg in messages:
                if msg.role == "user":
                    pending_user = msg
                elif msg.role == "assistant" and pending_user is not None:
                    stable_turn_id = pending_user.turn_id or msg.turn_id or f"turn-{pending_user.id}-{msg.id}"
                    turn = ConversationTurn(
                        turn_id=stable_turn_id,
                        conversation_id=conversation_id,
                        user_id=user_id,
                        subject_id=conv.subject_id,
                        user_query=pending_user.content,
                        agent_response=msg.content,
                        created_at=msg.created_at,
                        tokens_estimate=pending_user.tokens_count + msg.tokens_count,
                    )
                    turns.append(turn)
                    pending_user = None


            # Aplicar límite de turnos más recientes
            if len(turns) > limit:
                turns = turns[-limit:]

            return turns
        finally:
            if should_close:
                session.close()

    def clear_conversation(self, conversation_id: str, user_id: int) -> bool:
        session = self._get_session()
        should_close = self._should_close()
        try:
            conv = session.scalar(
                select(AgentConversationModel).where(
                    AgentConversationModel.conversation_id == conversation_id
                )
            )
            if conv is None:
                return False

            if conv.user_id != user_id:
                raise UnauthorizedActionError(
                    user_role="USER",
                    action=f"El usuario id={user_id} no es propietario de la conversación '{conversation_id}'.",
                )

            session.delete(conv)  # Cascade elimina mensajes
            session.commit()
            return True
        except Exception:
            session.rollback()
            raise
        finally:
            if should_close:
                session.close()

