import uuid
import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from src.domain.enums import UserRole
from src.domain.exceptions import EntityNotFoundError, UnauthorizedActionError
from src.domain.memory.identity import LabSimulatedIdentityResolver, SimulatedIdentity
from src.infrastructure.database.connection import get_app_engine, get_app_session_factory
from src.infrastructure.database.models import (
    AgentConversationModel,
    AgentConversationMessageModel,
    AgentDecisionModel,
    AgentPendingTaskModel,
    UserModel,
)


def test_v3_tables_exist_and_legacy_data_preserved():
    """Verifica que las 4 tablas de memoria existen y que los datos preexistentes permanecen intactos."""
    engine = get_app_engine()
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    # 1. Comprobar que las 4 nuevas tablas existen
    v3_tables = {
        "agent_conversations",
        "agent_conversation_messages",
        "agent_decisions",
        "agent_pending_tasks",
    }
    assert v3_tables.issubset(table_names), f"Faltan tablas de v3 en MySQL: {v3_tables - table_names}"

    # 2. Comprobar que los datos preexistentes permanecen exactamente intactos
    session_factory = get_app_session_factory()
    with session_factory() as session:
        users_count = session.execute(text("SELECT COUNT(*) FROM users")).scalar()
        categories_count = session.execute(text("SELECT COUNT(*) FROM ticket_categories")).scalar()
        tickets_count = session.execute(text("SELECT COUNT(*) FROM tickets")).scalar()
        comments_count = session.execute(text("SELECT COUNT(*) FROM ticket_comments")).scalar()
        history_count = session.execute(text("SELECT COUNT(*) FROM ticket_history")).scalar()

        assert users_count == 6, f"Esperado 6 usuarios, obtenido {users_count}"
        assert categories_count == 5, f"Esperado 5 categorías, obtenido {categories_count}"
        assert tickets_count >= 5, f"Esperado al menos 5 tickets, obtenido {tickets_count}"
        assert comments_count >= 10, f"Esperado al menos 10 comentarios, obtenido {comments_count}"
        assert history_count >= 10, f"Esperado al menos 10 entradas de historial, obtenido {history_count}"


def test_v3_foreign_keys_and_relational_integrity():
    """Verifica la integridad referencial contra users.id y comportamiento en cascada."""
    session_factory = get_app_session_factory()
    test_conv_id = f"test-conv-{uuid.uuid4().hex[:8]}"
    test_dec_id = f"test-dec-{uuid.uuid4().hex[:8]}"
    test_task_id = f"test-task-{uuid.uuid4().hex[:8]}"

    with session_factory() as session:
        # Resolver usuario Carlos (user_id = 1)
        carlos = session.scalar(select(UserModel).where(UserModel.username == "usr_carlos"))
        assert carlos is not None
        carlos_id = carlos.id

        # 1. Crear conversación válida vinculada a users.id
        conv = AgentConversationModel(
            conversation_id=test_conv_id,
            user_id=carlos_id,
            subject_id=carlos.username,
            title="Conversación de Prueba v3",
        )
        session.add(conv)
        session.flush()

        # 2. Agregar mensaje a la conversación
        msg = AgentConversationMessageModel(
            conversation_id=test_conv_id,
            role="user",
            content="Hola agente, consulta el ticket TICK-1001",
            tokens_count=12,
        )
        session.add(msg)

        # 3. Registrar decisión persistente
        decision = AgentDecisionModel(
            decision_id=test_dec_id,
            user_id=carlos_id,
            subject_id=carlos.username,
            session_id=None,
            scope="persistent",
            decision_key="preferred_priority",
            decision_value={"priority": "HIGH"},
            rationale="Preferencia explícita del usuario para incidentes críticos",
            provenance="user_explicit",
            status="resolved",
        )
        session.add(decision)

        # 4. Registrar tarea pendiente
        pending = AgentPendingTaskModel(
            decision_id=test_task_id,
            user_id=carlos_id,
            subject_id=carlos.username,
            session_id=f"sess-{uuid.uuid4().hex[:6]}",
            conversation_id=test_conv_id,
            original_query="Asigna el ticket TICK-1002",
            question="¿A cuál cuadrilla deseas asignarlo?",
            options=["Soporte Nivel 2", "Infraestructura Cloud"],
            allow_custom_answer=True,
            target_tool_name="update_ticket",
            pending_tool_arguments={"ticket_code": "TICK-1002"},
            missing_parameter_name="assignee",
            required_role="AGENT",
            status="pending",
        )
        session.add(pending)
        session.commit()

    # Verificar lectura correcta desde nueva sesión
    with session_factory() as session:
        saved_conv = session.scalar(select(AgentConversationModel).where(AgentConversationModel.conversation_id == test_conv_id))
        assert saved_conv is not None
        assert len(saved_conv.messages) == 1
        assert saved_conv.messages[0].content == "Hola agente, consulta el ticket TICK-1001"

        saved_dec = session.scalar(select(AgentDecisionModel).where(AgentDecisionModel.decision_id == test_dec_id))
        assert saved_dec is not None
        assert saved_dec.decision_value == {"priority": "HIGH"}

        saved_task = session.scalar(select(AgentPendingTaskModel).where(AgentPendingTaskModel.decision_id == test_task_id))
        assert saved_task is not None
        assert saved_task.target_tool_name == "update_ticket"
        assert saved_task.status == "pending"

        # Limpiar registros creados por la prueba
        session.delete(saved_dec)
        session.delete(saved_task)
        session.delete(saved_conv)  # Cascades to saved_conv.messages
        session.commit()


def test_v3_foreign_key_violation_rejected():
    """Verifica que un user_id inexistente sea rechazado por la base de datos MySQL."""
    session_factory = get_app_session_factory()
    fake_user_id = 999999
    invalid_conv_id = f"invalid-conv-{uuid.uuid4().hex[:8]}"

    with session_factory() as session:
        invalid_conv = AgentConversationModel(
            conversation_id=invalid_conv_id,
            user_id=fake_user_id,
            subject_id="usr_inexistente",
            title="Conversación con usuario inválido",
        )
        session.add(invalid_conv)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_lab_simulated_identity_resolver():
    """Valida la resolución de identidades simuladas y el rechazo de usuarios inexistentes o inactivos."""
    session_factory = get_app_session_factory()
    with session_factory() as session:
        resolver = LabSimulatedIdentityResolver(session)

        # 1. Resolver Carlos
        carlos_id = resolver.resolve("usr_carlos")
        assert isinstance(carlos_id, SimulatedIdentity)
        assert carlos_id.username == "usr_carlos"
        assert carlos_id.role == UserRole.USER
        assert carlos_id.is_active is True
        assert carlos_id.is_lab_simulation is True

        # 2. Resolver Soporte Técnico
        soporte = resolver.resolve("soporte_tecnico")
        assert soporte.username == "soporte_tecnico"
        assert soporte.role == UserRole.AGENT

        # 3. Resolver Administrador
        admin = resolver.resolve("admin_sistema")
        assert admin.username == "admin_sistema"
        assert admin.role == UserRole.ADMIN

        # 4. Rechazar usuario que no existe
        with pytest.raises(EntityNotFoundError) as exc_info:
            resolver.resolve("usuario_inexistente_99")
        assert "User" in str(exc_info.value)
        assert "usuario_inexistente_99" in str(exc_info.value)

        # 5. Rechazar usuario inactivo
        # Crear temporalmente un usuario inactivo para probar la regla
        inactive_user = UserModel(
            username="usr_inactivo_test",
            email="inactivo@example.com",
            full_name="Usuario Inactivo Test",
            role=UserRole.USER.value,
            is_active=False,
        )
        session.add(inactive_user)
        session.commit()

        try:
            with pytest.raises(UnauthorizedActionError) as unauth_info:
                resolver.resolve("usr_inactivo_test")
            assert "operate_as_simulated_identity" in str(unauth_info.value)
        finally:
            session.delete(inactive_user)
            session.commit()


def test_identity_isolation_between_subjects():
    """Verifica que los datos de un subject_id estén estrictamente aislados de otro."""
    session_factory = get_app_session_factory()
    with session_factory() as session:
        resolver = LabSimulatedIdentityResolver(session)
        carlos = resolver.resolve("usr_carlos")
        laura = resolver.resolve("usr_laura")

        conv_carlos_id = f"carlos-conv-{uuid.uuid4().hex[:6]}"
        conv_laura_id = f"laura-conv-{uuid.uuid4().hex[:6]}"

        carlos_conv = AgentConversationModel(
            conversation_id=conv_carlos_id,
            user_id=carlos.user_id,
            subject_id=carlos.username,
            title="Charlas de Carlos",
        )
        laura_conv = AgentConversationModel(
            conversation_id=conv_laura_id,
            user_id=laura.user_id,
            subject_id=laura.username,
            title="Charlas de Laura",
        )
        session.add_all([carlos_conv, laura_conv])
        session.commit()

        try:
            # Consultar solo conversaciones de Laura
            laura_convs = session.scalars(
                select(AgentConversationModel).where(AgentConversationModel.subject_id == laura.username)
            ).all()
            assert all(c.subject_id == "usr_laura" for c in laura_convs)
            assert not any(c.conversation_id == conv_carlos_id for c in laura_convs)
        finally:
            session.delete(carlos_conv)
            session.delete(laura_conv)
            session.commit()
