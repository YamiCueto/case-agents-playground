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
            session.commit()
    finally:
        session.close()
