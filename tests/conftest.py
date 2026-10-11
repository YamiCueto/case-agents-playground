import os
import pytest
from sqlalchemy import text, inspect

os.environ["DB_NAME"] = "cfa_tickets_test"

from src.infrastructure.config import get_settings
get_settings.cache_clear()

from src.infrastructure.database.connection import (
    get_admin_engine,
    get_app_session_factory,
    get_app_engine,
)
from src.infrastructure.database.models import Base
from scripts.seed_data import seed_database


@pytest.fixture(scope="session", autouse=True)
def setup_test_database() -> None:
    admin_engine = get_admin_engine()
    with admin_engine.connect() as conn:
        conn.execute(
            text(
                "CREATE DATABASE IF NOT EXISTS cfa_tickets_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        )
        conn.commit()

    Base.metadata.create_all(bind=admin_engine)

    app_engine = get_app_engine()
    inspector = inspect(app_engine)
    if "alembic_version" not in inspector.get_table_names():
        from alembic.config import Config
        from alembic import command

        cfg = Config("alembic.ini")
        command.stamp(cfg, "head")
    seed_database()

    from datetime import datetime, timezone, timedelta
    from src.infrastructure.database.models import TicketModel
    _factory = get_app_session_factory()
    _session = _factory()
    try:
        _now = datetime.now(timezone.utc)
        _t1 = _session.query(TicketModel).filter(TicketModel.code == "TICK-1001").first()
        _t2 = _session.query(TicketModel).filter(TicketModel.code == "TICK-1002").first()
        _t3 = _session.query(TicketModel).filter(TicketModel.code == "TICK-1003").first()
        if _t1: _t1.sla_due_at = _now + timedelta(hours=10)
        if _t2: _t2.sla_due_at = _now + timedelta(hours=3)
        if _t3: _t3.sla_due_at = _now - timedelta(hours=2)

        from src.infrastructure.database.models import TicketCommentModel, TicketHistoryModel, UserModel
        c_count = _session.query(TicketCommentModel).count()
        if c_count < 10:
            carlos = _session.query(UserModel).filter(UserModel.username == "usr_carlos").first()
            for i in range(10 - c_count):
                _session.add(TicketCommentModel(ticket_id=2, user_id=carlos.id, content=f"Comentario histórico {i+1}", is_internal=False))
        h_count = _session.query(TicketHistoryModel).count()
        if h_count < 10:
            carlos = _session.query(UserModel).filter(UserModel.username == "usr_carlos").first()
            for i in range(10 - h_count):
                _session.add(TicketHistoryModel(ticket_id=2, user_id=carlos.id, action="COMMENTED", old_value=None, new_value=f"Historial {i+1}"))
        _session.commit()
    finally:
        _session.close()


@pytest.fixture(autouse=True)
def clean_test_mutations() -> None:
    yield
    factory = get_app_session_factory()
    session = factory()
    try:
        from src.infrastructure.database.models import (
            TicketModel,
            TicketCommentModel,
            TicketHistoryModel,
        )

        extra_tickets = session.query(TicketModel).filter(TicketModel.id > 5).all()
        if extra_tickets:
            extra_ids = [t.id for t in extra_tickets]
            session.query(TicketCommentModel).filter(
                TicketCommentModel.ticket_id.in_(extra_ids)
            ).delete(synchronize_session=False)
            session.query(TicketHistoryModel).filter(
                TicketHistoryModel.ticket_id.in_(extra_ids)
            ).delete(synchronize_session=False)
            session.query(TicketModel).filter(TicketModel.id.in_(extra_ids)).delete(
                synchronize_session=False
            )
        # Clean mutations on ticket 1 to prevent context window overflow in Agent v1
        session.query(TicketCommentModel).filter(TicketCommentModel.ticket_id == 1).delete(synchronize_session=False)
        session.query(TicketHistoryModel).filter(TicketHistoryModel.ticket_id == 1, TicketHistoryModel.id > 1).delete(synchronize_session=False)
        session.commit()
    finally:
        session.close()
