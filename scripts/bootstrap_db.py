import sys
import pymysql
from src.infrastructure.config import get_settings


def bootstrap_database() -> None:
    settings = get_settings()

    conn = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_admin_user,
        password=settings.db_admin_password,
        charset="utf8mb4",
        autocommit=True,
    )

    with conn.cursor() as cursor:
        cursor.execute("SHOW DATABASES LIKE %s;", (settings.db_name,))
        existing_db = cursor.fetchone()

        if not existing_db:
            cursor.execute(
                f"CREATE DATABASE `{settings.db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            )

        cursor.execute(
            f"CREATE USER IF NOT EXISTS '{settings.db_app_user}'@'%' IDENTIFIED BY '{settings.db_app_password}';"
        )
        cursor.execute(
            f"CREATE USER IF NOT EXISTS '{settings.db_app_user}'@'localhost' IDENTIFIED BY '{settings.db_app_password}';"
        )
        cursor.execute(
            f"ALTER USER '{settings.db_app_user}'@'%' IDENTIFIED BY '{settings.db_app_password}';"
        )
        cursor.execute(
            f"ALTER USER '{settings.db_app_user}'@'localhost' IDENTIFIED BY '{settings.db_app_password}';"
        )

        cursor.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON `{settings.db_name}`.* TO '{settings.db_app_user}'@'%';"
        )
        cursor.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON `{settings.db_name}`.* TO '{settings.db_app_user}'@'localhost';"
        )
        cursor.execute("FLUSH PRIVILEGES;")

    conn.close()

    app_conn = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_app_user,
        password=settings.db_app_password,
        database=settings.db_name,
        charset="utf8mb4",
    )
    with app_conn.cursor() as cursor:
        cursor.execute("SELECT DATABASE(), CURRENT_USER();")
        row = cursor.fetchone()
        print(f"BOOTSTRAP_OK: Base de datos '{row[0]}' accesible por '{row[1]}'")
    app_conn.close()


if __name__ == "__main__":
    bootstrap_database()
