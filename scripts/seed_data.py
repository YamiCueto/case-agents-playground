from datetime import datetime, timedelta, timezone
from src.infrastructure.database.connection import get_app_session_factory
from src.domain.enums import UserRole, Priority, TicketStatus, HistoryAction
from src.infrastructure.database.models import (
    UserModel,
    TicketCategoryModel,
    TicketModel,
    TicketCommentModel,
    TicketHistoryModel,
)


def seed_database() -> None:
    session_factory = get_app_session_factory()
    session = session_factory()

    try:
        if session.query(UserModel).count() > 0:
            print("SEED_SKIPPED: La base de datos ya contiene datos.")
            return

        users = [
            UserModel(
                username="usr_carlos",
                email="carlos.usuario@cfa.test",
                full_name="Carlos Mario Restrepo",
                role=UserRole.USER.value,
                is_active=True,
            ),
            UserModel(
                username="usr_laura",
                email="laura.usuario@cfa.test",
                full_name="Laura Marcela Gomez",
                role=UserRole.USER.value,
                is_active=True,
            ),
            UserModel(
                username="soporte_tecnico",
                email="soporte.nivel1@cfa.test",
                full_name="Andres Felipe Soporte",
                role=UserRole.AGENT.value,
                is_active=True,
            ),
            UserModel(
                username="agente_redes",
                email="redes.soporte@cfa.test",
                full_name="Diana Patricia Redes",
                role=UserRole.AGENT.value,
                is_active=True,
            ),
            UserModel(
                username="supervisor_juan",
                email="juan.supervisor@cfa.test",
                full_name="Juan Guillermo Supervisor",
                role=UserRole.SUPERVISOR.value,
                is_active=True,
            ),
            UserModel(
                username="admin_sistema",
                email="admin.infra@cfa.test",
                full_name="Administrador de Sistemas",
                role=UserRole.ADMIN.value,
                is_active=True,
            ),
        ]
        session.add_all(users)
        session.flush()

        user_map = {u.username: u.id for u in users}

        categories = [
            TicketCategoryModel(
                code="DATABASE",
                name="Base de Datos",
                description="Incidentes de bases de datos relacionales, lentitud o bloqueos",
                is_active=True,
            ),
            TicketCategoryModel(
                code="NETWORK",
                name="Conectividad y Redes",
                description="Fallas de VPN, conectividad de sucursales o switches",
                is_active=True,
            ),
            TicketCategoryModel(
                code="SOFTWARE",
                name="Aplicaciones y Servicios",
                description="Bugs y caídas en microservicios y portales web",
                is_active=True,
            ),
            TicketCategoryModel(
                code="HARDWARE",
                name="Infraestructura Física",
                description="Servidores, fuentes de poder y estaciones de trabajo",
                is_active=True,
            ),
            TicketCategoryModel(
                code="ACCESS",
                name="Seguridad y Accesos",
                description="Gestión de permisos, roles y desbloqueo de usuarios",
                is_active=True,
            ),
        ]
        session.add_all(categories)
        session.flush()

        cat_map = {c.code: c.id for c in categories}
        now = datetime.now(timezone.utc)

        ticket_1 = TicketModel(
            code="TICK-1001",
            title="Bloqueo transaccional en módulo de captación",
            description="La tabla de aportes registra bloqueos recurrentes durante el cierre diario",
            status=TicketStatus.OPEN.value,
            priority=Priority.HIGH.value,
            category_id=cat_map["DATABASE"],
            creator_id=user_map["usr_carlos"],
            assignee_id=None,
            sla_due_at=now + timedelta(hours=10),
        )

        ticket_2 = TicketModel(
            code="TICK-1002",
            title="Caída de enlace VPN en sucursal centro",
            description="La sucursal centro perdió comunicación con el router principal",
            status=TicketStatus.IN_PROGRESS.value,
            priority=Priority.CRITICAL.value,
            category_id=cat_map["NETWORK"],
            creator_id=user_map["usr_laura"],
            assignee_id=user_map["agente_redes"],
            sla_due_at=now + timedelta(hours=3),
        )

        ticket_3 = TicketModel(
            code="TICK-1003",
            title="Error 500 intermitente en API de colocaciones",
            description="El endpoint de desembolsos responde con error interno bajo alta concurrencia",
            status=TicketStatus.OPEN.value,
            priority=Priority.CRITICAL.value,
            category_id=cat_map["SOFTWARE"],
            creator_id=user_map["usr_carlos"],
            assignee_id=None,
            sla_due_at=now - timedelta(hours=2),
        )

        ticket_4 = TicketModel(
            code="TICK-1004",
            title="Desbloqueo de usuario de cajero principal",
            description="Cajero ingresó credenciales inválidas tres veces consecutivas",
            status=TicketStatus.RESOLVED.value,
            priority=Priority.MEDIUM.value,
            category_id=cat_map["ACCESS"],
            creator_id=user_map["usr_laura"],
            assignee_id=user_map["soporte_tecnico"],
            sla_due_at=now + timedelta(hours=20),
            resolved_at=now - timedelta(minutes=45),
        )

        ticket_5 = TicketModel(
            code="TICK-1005",
            title="Reemplazo de teclado en puesto operativo 4",
            description="Teclado mecánico presenta falla en barra espaciadora",
            status=TicketStatus.CLOSED.value,
            priority=Priority.LOW.value,
            category_id=cat_map["HARDWARE"],
            creator_id=user_map["usr_carlos"],
            assignee_id=user_map["soporte_tecnico"],
            sla_due_at=now - timedelta(days=2),
            resolved_at=now - timedelta(days=2, hours=1),
            closed_at=now - timedelta(days=1),
        )

        session.add_all([ticket_1, ticket_2, ticket_3, ticket_4, ticket_5])
        session.flush()

        comment_1 = TicketCommentModel(
            ticket_id=ticket_2.id,
            user_id=user_map["agente_redes"],
            content="Iniciando diagnóstico remoto en switch perimetral de sucursal centro.",
            is_internal=True,
        )
        comment_2 = TicketCommentModel(
            ticket_id=ticket_4.id,
            user_id=user_map["soporte_tecnico"],
            content="[RESOLUCIÓN]: Se restableció el contador de intentos y se notificó al usuario vía correo seguro.",
            is_internal=False,
        )
        session.add_all([comment_1, comment_2])

        histories = [
            TicketHistoryModel(
                ticket_id=ticket_1.id,
                user_id=user_map["usr_carlos"],
                action=HistoryAction.CREATED.value,
                old_value=None,
                new_value="Ticket creado con prioridad HIGH",
            ),
            TicketHistoryModel(
                ticket_id=ticket_2.id,
                user_id=user_map["usr_laura"],
                action=HistoryAction.CREATED.value,
                old_value=None,
                new_value="Ticket creado con prioridad CRITICAL",
            ),
            TicketHistoryModel(
                ticket_id=ticket_2.id,
                user_id=user_map["supervisor_juan"],
                action=HistoryAction.ASSIGNED.value,
                old_value="Sin asignar",
                new_value="agente_redes",
            ),
            TicketHistoryModel(
                ticket_id=ticket_2.id,
                user_id=user_map["agente_redes"],
                action=HistoryAction.STATUS_CHANGED.value,
                old_value=TicketStatus.OPEN.value,
                new_value=TicketStatus.IN_PROGRESS.value,
            ),
            TicketHistoryModel(
                ticket_id=ticket_3.id,
                user_id=user_map["usr_carlos"],
                action=HistoryAction.CREATED.value,
                old_value=None,
                new_value="Ticket creado con prioridad CRITICAL",
            ),
        ]
        session.add_all(histories)
        session.commit()
        print("SEED_OK: 6 usuarios, 5 categorías, 5 tickets iniciales con comentarios e historial sembrados exitosamente.")

    except Exception as exc:
        session.rollback()
        raise exc
    finally:
        session.close()


if __name__ == "__main__":
    seed_database()
