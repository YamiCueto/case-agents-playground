from sqlalchemy import inspect
from src.infrastructure.database.connection import get_app_engine


def test_mysql_schema_and_tables_exist() -> None:
    engine = get_app_engine()
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    expected_tables = {
        "alembic_version",
        "users",
        "ticket_categories",
        "tickets",
        "ticket_comments",
        "ticket_history",
    }
    assert expected_tables.issubset(set(table_names))


def test_tickets_table_columns_and_indexes() -> None:
    engine = get_app_engine()
    inspector = inspect(engine)

    columns = {col["name"] for col in inspector.get_columns("tickets")}
    expected_columns = {
        "id",
        "code",
        "title",
        "description",
        "status",
        "priority",
        "category_id",
        "creator_id",
        "assignee_id",
        "sla_due_at",
        "resolved_at",
        "closed_at",
        "created_at",
        "updated_at",
    }
    assert expected_columns.issubset(columns)

    indexes = {idx["name"] for idx in inspector.get_indexes("tickets")}
    assert "ix_tickets_code" in indexes
    assert "ix_tickets_status" in indexes
    assert "ix_tickets_priority" in indexes
    assert "ix_tickets_sla_due_at" in indexes
