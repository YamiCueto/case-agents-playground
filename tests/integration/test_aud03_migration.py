import os
import pytest
from sqlalchemy import create_engine, text, inspect
from alembic.config import Config
from alembic import command
from src.infrastructure.config import get_settings


def test_aud03_historical_data_migration_without_data_loss():
    """
    AUD-03: Corrige la migración para bases con mensajes históricos.
    Prueba la actualización sobre una base de pruebas poblada, sin pérdida de registros.
    
    Verifica:
    1. Base en revisión 7a7cc1893e28 (pre-remediación).
    2. Poblada con datos históricos:
       - Turnos con turn_id normal.
       - Mensajes con turn_id IS NULL.
       - Mensajes con turn_id = ''.
       - Múltiples decisiones con status='resolved' para la misma clave (simulando conflicto AUD-01 en datos legacy).
       - Tareas pendientes.
    3. Ejecución de alembic upgrade head (8b8ef3914a19).
    4. CERO pérdida de registros (count_before == count_after para todas las tablas).
    5. Nuevas restricciones aplicadas limpiamente (turn_id no nulo, sequence_id particionado, exactamente un active_lock_key por preferencia).
    """
    admin_engine = create_engine("mysql+pymysql://root:@127.0.0.1:3306/?charset=utf8mb4")
    test_db_name = "cfa_migration_test_aud03"

    with admin_engine.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {test_db_name}"))
        conn.execute(text(f"CREATE DATABASE {test_db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        conn.commit()

    try:
        # 1. Configurar y migrar hasta 7a7cc1893e28
        os.environ["DB_NAME"] = test_db_name
        get_settings.cache_clear()
        cfg = Config("alembic.ini")
        command.upgrade(cfg, "7a7cc1893e28")

        db_engine = create_engine(f"mysql+pymysql://root:@127.0.0.1:3306/{test_db_name}?charset=utf8mb4")

        # 2. Poblar datos históricos
        with db_engine.begin() as conn:
            # Usuario existente
            conn.execute(text("""
                INSERT INTO users (id, username, email, full_name, role, is_active, created_at)
                VALUES (1, 'carlos', 'carlos@example.com', 'Carlos Tester', 'user', 1, NOW())
            """))

            # Conversaciones
            conn.execute(text("""
                INSERT INTO agent_conversations (id, conversation_id, user_id, subject_id, title, created_at, updated_at)
                VALUES 
                (1, 'conv-hist-1', 1, 'carlos', 'Conversación 1', NOW(), NOW()),
                (2, 'conv-hist-2', 1, 'carlos', 'Conversación 2', NOW(), NOW())
            """))

            # Mensajes históricos variados
            # - turn-alpha: par estándar usuario/asistente
            # - turn_id NULL: 2 mensajes legacy
            # - turn_id '': 2 mensajes legacy
            # - turn-beta: par estándar
            conn.execute(text("""
                INSERT INTO agent_conversation_messages (id, conversation_id, role, content, tokens_count, turn_id, created_at)
                VALUES 
                (1, 'conv-hist-1', 'user', 'Hola', 5, 'turn-alpha', NOW()),
                (2, 'conv-hist-1', 'assistant', 'Hola, ¿en qué te ayudo?', 10, 'turn-alpha', NOW()),
                (3, 'conv-hist-1', 'user', 'Mensaje con NULL turn_id', 7, NULL, NOW()),
                (4, 'conv-hist-1', 'assistant', 'Respuesta a NULL turn_id', 8, NULL, NOW()),
                (5, 'conv-hist-2', 'user', 'Mensaje con empty turn_id', 6, '', NOW()),
                (6, 'conv-hist-2', 'assistant', 'Respuesta a empty turn_id', 9, '', NOW()),
                (7, 'conv-hist-2', 'user', 'Turno beta user', 4, 'turn-beta', NOW()),
                (8, 'conv-hist-2', 'assistant', 'Turno beta assistant', 6, 'turn-beta', NOW())
            """))

            # Decisiones históricas con conflicto potencial
            conn.execute(text("""
                INSERT INTO agent_decisions (id, decision_id, user_id, subject_id, session_id, scope, decision_key, decision_value, rationale, provenance, status, created_at, revoked_at, version, supersedes_decision_id)
                VALUES
                (1, 'dec-1', 1, 'carlos', NULL, 'persistent', 'pref_lang', '\"es\"', 'Español', 'user_explicit', 'revoked', NOW(), NOW(), 1, NULL),
                (2, 'dec-2', 1, 'carlos', NULL, 'persistent', 'pref_lang', '\"en\"', 'English', 'user_explicit', 'resolved', NOW(), NULL, 2, 'dec-1'),
                (3, 'dec-race-1', 1, 'carlos', NULL, 'persistent', 'theme', '\"dark\"', 'Dark', 'user_explicit', 'resolved', NOW(), NULL, 1, NULL),
                (4, 'dec-race-2', 1, 'carlos', NULL, 'persistent', 'theme', '\"light\"', 'Light', 'user_explicit', 'resolved', NOW(), NULL, 1, NULL)
            """))

            # Tareas pendientes
            conn.execute(text("""
                INSERT INTO agent_pending_tasks (id, decision_id, user_id, subject_id, session_id, conversation_id, original_query, question, options, allow_custom_answer, target_tool_name, pending_tool_arguments, missing_parameter_name, required_role, status, created_at)
                VALUES
                (1, 'task-1', 1, 'carlos', 'sess-1', 'conv-hist-1', 'Reasignar', '¿Confirmar?', '[]', 0, 'reassign_ticket', '{}', 'confirm', 'user', 'pending', NOW()),
                (2, 'task-2', 1, 'carlos', 'sess-1', 'conv-hist-1', 'Cerrar', '¿Razón?', '[]', 0, 'close_ticket', '{}', 'reason', 'user', 'resolving', NOW())
            """))

        # Conteo antes de la migración
        with db_engine.connect() as conn:
            msg_count_before = conn.execute(text("SELECT COUNT(*) FROM agent_conversation_messages")).scalar()
            dec_count_before = conn.execute(text("SELECT COUNT(*) FROM agent_decisions")).scalar()
            task_count_before = conn.execute(text("SELECT COUNT(*) FROM agent_pending_tasks")).scalar()

        assert msg_count_before == 8
        assert dec_count_before == 4
        assert task_count_before == 2

        # 3. Aplicar migración 8b8ef3914a19 a HEAD
        command.upgrade(cfg, "head")

        # 4. Validar integridad y cero pérdida de registros
        with db_engine.connect() as conn:
            msg_count_after = conn.execute(text("SELECT COUNT(*) FROM agent_conversation_messages")).scalar()
            dec_count_after = conn.execute(text("SELECT COUNT(*) FROM agent_decisions")).scalar()
            task_count_after = conn.execute(text("SELECT COUNT(*) FROM agent_pending_tasks")).scalar()

            assert msg_count_after == msg_count_before, "PÉRDIDA DE MENSAJES DETECTADA"
            assert dec_count_after == dec_count_before, "PÉRDIDA DE DECISIONES DETECTADA"
            assert task_count_after == task_count_before, "PÉRDIDA DE TAREAS DETECTADA"

            # Validar que no hay turn_id nulo o vacío
            empty_turns = conn.execute(text("SELECT COUNT(*) FROM agent_conversation_messages WHERE turn_id IS NULL OR turn_id = ''")).scalar()
            assert empty_turns == 0, f"Existen {empty_turns} mensajes sin turn_id"

            # Validar sequence_id en mensajes
            seq_rows = conn.execute(text("SELECT id, turn_id, role, sequence_id FROM agent_conversation_messages ORDER BY id")).fetchall()
            for row in seq_rows:
                assert row.sequence_id is not None
                assert row.sequence_id >= 0

            # Validar active_lock_key en decisiones
            # Para 'pref_lang': dec-2 es la única activa
            lang_active = conn.execute(text("SELECT id, active_lock_key, status FROM agent_decisions WHERE decision_key = 'pref_lang' AND active_lock_key IS NOT NULL")).fetchall()
            assert len(lang_active) == 1
            assert lang_active[0].id == 2
            assert lang_active[0].status == "resolved"

            # Para 'theme': había dos 'resolved' concurrentes; la más reciente (id=4) debe ser activa y la anterior (id=3) debe ser revocada
            theme_active = conn.execute(text("SELECT id, active_lock_key, status FROM agent_decisions WHERE decision_key = 'theme' AND active_lock_key IS NOT NULL")).fetchall()
            assert len(theme_active) == 1
            assert theme_active[0].id == 4

            theme_revoked = conn.execute(text("SELECT id, active_lock_key, status FROM agent_decisions WHERE id = 3")).fetchone()
            assert theme_revoked.active_lock_key is None
            assert theme_revoked.status == "revoked"

            # Validar nuevas columnas en agent_pending_tasks
            insp = inspect(db_engine)
            pending_cols = [c["name"] for c in insp.get_columns("agent_pending_tasks")]
            assert "lease_owner" in pending_cols
            assert "lease_expires_at" in pending_cols
            assert "idempotency_token" in pending_cols
            assert "execution_checkpoint" in pending_cols
            assert "recovery_reason" in pending_cols

    finally:
        # Limpieza de base temporal de prueba
        with admin_engine.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {test_db_name}"))
            conn.commit()
        # Restaurar nombre de base
        os.environ["DB_NAME"] = "cfa_tickets_test"
        get_settings.cache_clear()
