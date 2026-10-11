"""remediation_aud_01_to_05

Revision ID: 8b8ef3914a19
Revises: 7a7cc1893e28
Create Date: 2026-10-10 14:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '8b8ef3914a19'
down_revision: Union[str, Sequence[str], None] = '7a7cc1893e28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Remediation AUD-02 & AUD-03: agent_conversation_messages
    # Drop previous unique constraint on role which caused collision in multi-message turns
    try:
        op.drop_constraint('uq_conv_turn_role', 'agent_conversation_messages', type_='unique')
    except Exception:
        pass

    # Add sequence_id column (initially default 0)
    op.add_column('agent_conversation_messages', sa.Column('sequence_id', sa.Integer(), nullable=False, server_default='0'))

    # Safe backfill for historical data without data loss (AUD-03)
    # Assign unique turn_id to legacy records that have null or empty turn_id
    conn.execute(text("""
        UPDATE agent_conversation_messages 
        SET turn_id = CONCAT('legacy-turn-', id) 
        WHERE turn_id IS NULL OR turn_id = ''
    """))

    # Compute partitioned sequence_id per (conversation_id, turn_id) to avoid duplicate entry errors
    conn.execute(text("""
        UPDATE agent_conversation_messages m
        JOIN (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id, turn_id ORDER BY id ASC) - 1 AS seq
            FROM agent_conversation_messages
        ) sub ON m.id = sub.id
        SET m.sequence_id = sub.seq
    """))

    # Create new sequence-based unique constraint supporting multiple messages per role per turn
    op.create_unique_constraint('uq_conv_turn_seq', 'agent_conversation_messages', ['conversation_id', 'turn_id', 'sequence_id'])

    # 2. Remediation AUD-01: agent_decisions
    # Add active_lock_key ensuring exactly one active version per logical key at MySQL engine level
    op.add_column('agent_decisions', sa.Column('active_lock_key', sa.String(length=255), nullable=True))

    # In case historical data has multiple unrevoked resolved records for the same logical key,
    # revoke the older ones (preserving history) so only the latest remains active
    conn.execute(text("""
        UPDATE agent_decisions d
        JOIN (
            SELECT MAX(id) as latest_id, user_id, scope, decision_key, session_id
            FROM agent_decisions
            WHERE status = 'resolved' AND revoked_at IS NULL
            GROUP BY user_id, scope, decision_key, session_id
            HAVING COUNT(*) > 1
        ) dup ON d.user_id = dup.user_id 
             AND d.scope = dup.scope 
             AND d.decision_key = dup.decision_key 
             AND (d.session_id = dup.session_id OR (d.session_id IS NULL AND dup.session_id IS NULL))
             AND d.id < dup.latest_id
        SET d.status = 'revoked', d.revoked_at = NOW()
    """))

    # Backfill active_lock_key for currently active decisions
    conn.execute(text("""
        UPDATE agent_decisions
        SET active_lock_key = CONCAT('usr_', user_id, ':', scope, ':', decision_key, ':', COALESCE(session_id, 'global'))
        WHERE status = 'resolved' AND revoked_at IS NULL
    """))

    op.create_unique_constraint('uq_active_decision_lock', 'agent_decisions', ['active_lock_key'])

    # 3. Remediation AUD-04 & AUD-05: agent_pending_tasks
    op.add_column('agent_pending_tasks', sa.Column('lease_owner', sa.String(length=64), nullable=True))
    op.add_column('agent_pending_tasks', sa.Column('lease_expires_at', sa.DateTime(), nullable=True))
    op.add_column('agent_pending_tasks', sa.Column('idempotency_token', sa.String(length=64), nullable=True))
    op.add_column('agent_pending_tasks', sa.Column('execution_checkpoint', sa.JSON(), nullable=True))
    op.add_column('agent_pending_tasks', sa.Column('recovery_reason', sa.Text(), nullable=True))

    op.create_index(op.f('ix_agent_pending_tasks_lease_expires_at'), 'agent_pending_tasks', ['lease_expires_at'], unique=False)
    op.create_index(op.f('ix_agent_pending_tasks_idempotency_token'), 'agent_pending_tasks', ['idempotency_token'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_pending_tasks_idempotency_token'), table_name='agent_pending_tasks')
    op.drop_index(op.f('ix_agent_pending_tasks_lease_expires_at'), table_name='agent_pending_tasks')
    op.drop_column('agent_pending_tasks', 'recovery_reason')
    op.drop_column('agent_pending_tasks', 'execution_checkpoint')
    op.drop_column('agent_pending_tasks', 'idempotency_token')
    op.drop_column('agent_pending_tasks', 'lease_expires_at')
    op.drop_column('agent_pending_tasks', 'lease_owner')

    op.drop_constraint('uq_active_decision_lock', 'agent_decisions', type_='unique')
    op.drop_column('agent_decisions', 'active_lock_key')

    op.drop_constraint('uq_conv_turn_seq', 'agent_conversation_messages', type_='unique')
    op.drop_column('agent_conversation_messages', 'sequence_id')
    try:
        op.create_unique_constraint('uq_conv_turn_role', 'agent_conversation_messages', ['conversation_id', 'turn_id', 'role'])
    except Exception:
        pass
