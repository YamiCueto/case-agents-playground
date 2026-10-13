import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from src.infrastructure.database.connection import get_app_session_factory
from src.domain.enums import UserRole, Priority, TicketStatus, HistoryAction
from src.infrastructure.database.models import (
    UserModel,
    TicketCategoryModel,
    TicketModel,
    TicketCommentModel,
    TicketHistoryModel,
)


def seed_database() -> Dict[str, int]:
    """Siembra idempotente de datos iniciales requeridos para el laboratorio AEP.

    Garantiza que existan:
    - 6 usuarios con roles canónicos (usr_carlos, usr_laura, soporte_tecnico, agente_redes, supervisor_juan, admin_sistema)
    - 5 categorías tipadas (DATABASE, NETWORK, SOFTWARE, HARDWARE, ACCESS)
    - 5 tickets pedagógicos canónicos (TICK-1001 a TICK-1005)
    - Comentarios e historial iniciales de referencia

    Idempotencia garantizada:
    - Comprueba la existencia entidad por entidad utilizando claves de negocio estables (username, code).
    - Inserta únicamente los registros faltantes.
    - No duplica ni corrompe relaciones.
    - No sobrescribe modificaciones legítimas hechas por el estudiante.
    - Puede ejecutarse N veces con total seguridad transaccional.
    """
    session_factory = get_app_session_factory()
    session = session_factory()

    stats = {
        "users_created": 0,
        "categories_created": 0,
        "tickets_created": 0,
        "comments_created": 0,
        "history_created": 0,
    }

    try:
        # 1. Usuarios canónicos requeridos
        raw_users = [
            {
                "username": "usr_carlos",
                "email": "carlos.usuario@cfa.test",
                "full_name": "Carlos Mario Restrepo",
                "role": UserRole.USER.value,
            },
            {
                "username": "usr_laura",
                "email": "laura.usuario@cfa.test",
                "full_name": "Laura Marcela Gomez",
                "role": UserRole.USER.value,
            },
            {
                "username": "soporte_tecnico",
                "email": "soporte.nivel1@cfa.test",
                "full_name": "Andres Felipe Soporte",
                "role": UserRole.AGENT.value,
            },
            {
                "username": "agente_redes",
                "email": "redes.soporte@cfa.test",
                "full_name": "Diana Patricia Redes",
                "role": UserRole.AGENT.value,
            },
            {
                "username": "supervisor_juan",
                "email": "juan.supervisor@cfa.test",
                "full_name": "Juan Guillermo Supervisor",
                "role": UserRole.SUPERVISOR.value,
            },
            {
                "username": "admin_sistema",
                "email": "admin.infra@cfa.test",
                "full_name": "Administrador de Sistemas",
                "role": UserRole.ADMIN.value,
            },
        ]

        existing_users = {u.username: u for u in session.query(UserModel).all()}
        for u_data in raw_users:
            if u_data["username"] not in existing_users:
                new_user = UserModel(
                    username=u_data["username"],
                    email=u_data["email"],
                    full_name=u_data["full_name"],
                    role=u_data["role"],
                    is_active=True,
                )
                session.add(new_user)
                stats["users_created"] += 1

        if stats["users_created"] > 0:
            session.flush()

        # Recargar mapa completo de usuarios (username -> id)
        user_map = {u.username: u.id for u in session.query(UserModel).all()}

        # 2. Categorías canónicas requeridas
        raw_categories = [
            {
                "code": "DATABASE",
                "name": "Base de Datos",
                "description": "Incidentes de bases de datos relacionales, lentitud o bloqueos",
            },
            {
                "code": "NETWORK",
                "name": "Conectividad y Redes",
                "description": "Fallas de VPN, conectividad de sucursales o switches",
            },
            {
                "code": "SOFTWARE",
                "name": "Aplicaciones y Servicios",
                "description": "Bugs y caídas en microservicios y portales web",
            },
            {
                "code": "HARDWARE",
                "name": "Infraestructura Física",
                "description": "Servidores, fuentes de poder y estaciones de trabajo",
            },
            {
                "code": "ACCESS",
                "name": "Seguridad y Accesos",
                "description": "Gestión de permisos, roles y desbloqueo de usuarios",
            },
        ]

        existing_cats = {c.code: c for c in session.query(TicketCategoryModel).all()}
        for c_data in raw_categories:
            if c_data["code"] not in existing_cats:
                new_cat = TicketCategoryModel(
                    code=c_data["code"],
                    name=c_data["name"],
                    description=c_data["description"],
                    is_active=True,
                )
                session.add(new_cat)
                stats["categories_created"] += 1

        if stats["categories_created"] > 0:
            session.flush()

        # Recargar mapa de categorías (code -> id)
        cat_map = {c.code: c.id for c in session.query(TicketCategoryModel).all()}
        now = datetime.now(timezone.utc)

        # 3. Tickets canónicos requeridos
        raw_tickets = [
            {
                "code": "TICK-1001",
                "title": "Bloqueo transaccional en módulo de captación",
                "description": "La tabla de aportes registra bloqueos recurrentes durante el cierre diario",
                "status": TicketStatus.OPEN.value,
                "priority": Priority.HIGH.value,
                "category_code": "DATABASE",
                "creator_username": "usr_carlos",
                "assignee_username": None,
                "sla_due_at": now + timedelta(hours=10),
                "resolved_at": None,
                "closed_at": None,
            },
            {
                "code": "TICK-1002",
                "title": "Caída de enlace VPN en sucursal centro",
                "description": "La sucursal centro perdió comunicación con el router principal",
                "status": TicketStatus.IN_PROGRESS.value,
                "priority": Priority.CRITICAL.value,
                "category_code": "NETWORK",
                "creator_username": "usr_laura",
                "assignee_username": "agente_redes",
                "sla_due_at": now + timedelta(hours=3),
                "resolved_at": None,
                "closed_at": None,
            },
            {
                "code": "TICK-1003",
                "title": "Error 500 intermitente en API de colocaciones",
                "description": "El endpoint de desembolsos responde con error interno bajo alta concurrencia",
                "status": TicketStatus.OPEN.value,
                "priority": Priority.CRITICAL.value,
                "category_code": "SOFTWARE",
                "creator_username": "usr_carlos",
                "assignee_username": None,
                "sla_due_at": now - timedelta(hours=2),
                "resolved_at": None,
                "closed_at": None,
            },
            {
                "code": "TICK-1004",
                "title": "Desbloqueo de usuario de cajero principal",
                "description": "Cajero ingresó credenciales inválidas tres veces consecutivas",
                "status": TicketStatus.RESOLVED.value,
                "priority": Priority.MEDIUM.value,
                "category_code": "ACCESS",
                "creator_username": "usr_laura",
                "assignee_username": "soporte_tecnico",
                "sla_due_at": now + timedelta(hours=20),
                "resolved_at": now - timedelta(minutes=45),
                "closed_at": None,
            },
            {
                "code": "TICK-1005",
                "title": "Reemplazo de teclado en puesto operativo 4",
                "description": "Teclado mecánico presenta falla en barra espaciadora",
                "status": TicketStatus.CLOSED.value,
                "priority": Priority.LOW.value,
                "category_code": "HARDWARE",
                "creator_username": "usr_carlos",
                "assignee_username": "soporte_tecnico",
                "sla_due_at": now - timedelta(days=2),
                "resolved_at": now - timedelta(days=2, hours=1),
                "closed_at": now - timedelta(days=1),
            },
        ]

        existing_tickets = {t.code: t for t in session.query(TicketModel).all()}
        for t_data in raw_tickets:
            if t_data["code"] not in existing_tickets:
                creator_id = user_map.get(t_data["creator_username"])
                assignee_id = user_map.get(t_data["assignee_username"]) if t_data["assignee_username"] else None
                category_id = cat_map.get(t_data["category_code"])

                new_ticket = TicketModel(
                    code=t_data["code"],
                    title=t_data["title"],
                    description=t_data["description"],
                    status=t_data["status"],
                    priority=t_data["priority"],
                    category_id=category_id,
                    creator_id=creator_id,
                    assignee_id=assignee_id,
                    sla_due_at=t_data["sla_due_at"],
                    resolved_at=t_data["resolved_at"],
                    closed_at=t_data["closed_at"],
                )
                session.add(new_ticket)
                stats["tickets_created"] += 1

        if stats["tickets_created"] > 0:
            session.flush()

        # Recargar mapa de tickets (code -> id)
        ticket_map = {t.code: t.id for t in session.query(TicketModel).all()}

        # 4. Comentarios iniciales canónicos
        raw_comments = [
            {
                "ticket_code": "TICK-1002",
                "username": "agente_redes",
                "content": "Iniciando diagnóstico remoto en switch perimetral de sucursal centro.",
                "is_internal": True,
            },
            {
                "ticket_code": "TICK-1004",
                "username": "soporte_tecnico",
                "content": "[RESOLUCIÓN]: Se restableció el contador de intentos y se notificó al usuario vía correo seguro.",
                "is_internal": False,
            },
        ]

        for c_data in raw_comments:
            t_id = ticket_map.get(c_data["ticket_code"])
            u_id = user_map.get(c_data["username"])
            if t_id and u_id:
                # Comprobar si ya existe el comentario exacto para evitar duplicaciones
                exists = (
                    session.query(TicketCommentModel)
                    .filter(
                        TicketCommentModel.ticket_id == t_id,
                        TicketCommentModel.content == c_data["content"],
                    )
                    .first()
                )
                if not exists:
                    session.add(
                        TicketCommentModel(
                            ticket_id=t_id,
                            user_id=u_id,
                            content=c_data["content"],
                            is_internal=c_data["is_internal"],
                        )
                    )
                    stats["comments_created"] += 1

        # 5. Historial inicial canónico
        raw_history = [
            {
                "ticket_code": "TICK-1001",
                "username": "usr_carlos",
                "action": HistoryAction.CREATED.value,
                "old_value": None,
                "new_value": "Ticket creado con prioridad HIGH",
            },
            {
                "ticket_code": "TICK-1002",
                "username": "usr_laura",
                "action": HistoryAction.CREATED.value,
                "old_value": None,
                "new_value": "Ticket creado con prioridad CRITICAL",
            },
            {
                "ticket_code": "TICK-1002",
                "username": "supervisor_juan",
                "action": HistoryAction.ASSIGNED.value,
                "old_value": "Sin asignar",
                "new_value": "agente_redes",
            },
            {
                "ticket_code": "TICK-1002",
                "username": "agente_redes",
                "action": HistoryAction.STATUS_CHANGED.value,
                "old_value": TicketStatus.OPEN.value,
                "new_value": TicketStatus.IN_PROGRESS.value,
            },
            {
                "ticket_code": "TICK-1003",
                "username": "usr_carlos",
                "action": HistoryAction.CREATED.value,
                "old_value": None,
                "new_value": "Ticket creado con prioridad CRITICAL",
            },
        ]

        for h_data in raw_history:
            t_id = ticket_map.get(h_data["ticket_code"])
            u_id = user_map.get(h_data["username"])
            if t_id and u_id:
                exists = (
                    session.query(TicketHistoryModel)
                    .filter(
                        TicketHistoryModel.ticket_id == t_id,
                        TicketHistoryModel.action == h_data["action"],
                        TicketHistoryModel.new_value == h_data["new_value"],
                    )
                    .first()
                )
                if not exists:
                    session.add(
                        TicketHistoryModel(
                            ticket_id=t_id,
                            user_id=u_id,
                            action=h_data["action"],
                            old_value=h_data["old_value"],
                            new_value=h_data["new_value"],
                        )
                    )
                    stats["history_created"] += 1

        session.commit()

        total_users = session.query(UserModel).count()
        total_cats = session.query(TicketCategoryModel).count()
        total_tickets = session.query(TicketModel).count()

        if any(v > 0 for v in stats.values()):
            print(
                f"SEED_OK: Sembradas entidades faltantes: "
                f"+{stats['users_created']} usuarios, +{stats['categories_created']} categorías, "
                f"+{stats['tickets_created']} tickets, +{stats['comments_created']} comentarios, "
                f"+{stats['history_created']} historiales. "
                f"(Total actual: {total_users} usuarios, {total_cats} categorías, {total_tickets} tickets)."
            )
        else:
            print(
                f"SEED_IDEMPOTENT_OK: Todas las entidades iniciales ya existen. "
                f"Ningún registro fue duplicado ni modificado. "
                f"(Total actual: {total_users} usuarios, {total_cats} categorías, {total_tickets} tickets)."
            )

        return stats

    except Exception as exc:
        session.rollback()
        raise exc
    finally:
        session.close()


if __name__ == "__main__":
    seed_database()
