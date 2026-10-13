import os
import sys
import pymysql
from pymysql.converters import escape_string

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from src.infrastructure.config import get_settings


def bootstrap_database() -> None:
    """Inicializa la base de datos MySQL y el usuario de aplicación con permisos mínimos."""
    settings = get_settings()

    print(f"[*] Conectando como administrador '{settings.db_admin_user}' a {settings.db_host}:{settings.db_port}...")
    try:
        conn = pymysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_admin_user,
            password=settings.db_admin_password,
            charset="utf8mb4",
            autocommit=True,
        )
    except Exception as exc:
        print(f"[ERROR] No se pudo conectar al servidor MySQL con el usuario administrador: {exc}")
        print("Verifica que el servicio MySQL esté iniciado y las credenciales en .env sean correctas.")
        sys.exit(1)

    with conn.cursor() as cursor:
        # 1. Crear base de datos si no existe
        cursor.execute("SHOW DATABASES LIKE %s;", (settings.db_name,))
        existing_db = cursor.fetchone()

        if not existing_db:
            print(f"[*] Creando base de datos `{settings.db_name}`...")
            cursor.execute(
                f"CREATE DATABASE `{settings.db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            )
        else:
            print(f"[OK] Base de datos `{settings.db_name}` ya existe.")

        # 2. Crear y configurar usuario de aplicación (si es diferente al administrador)
        if settings.db_app_user and settings.db_app_user != settings.db_admin_user:
            escaped_pwd = escape_string(settings.db_app_password)
            escaped_user = escape_string(settings.db_app_user)

            for host in ("%", "localhost"):
                cursor.execute(
                    f"CREATE USER IF NOT EXISTS '{escaped_user}'@'{host}' IDENTIFIED BY '{escaped_pwd}';"
                )
                cursor.execute(
                    f"ALTER USER '{escaped_user}'@'{host}' IDENTIFIED BY '{escaped_pwd}';"
                )
                cursor.execute(
                    f"GRANT SELECT, INSERT, UPDATE, DELETE ON `{settings.db_name}`.* TO '{escaped_user}'@'{host}';"
                )

            cursor.execute("FLUSH PRIVILEGES;")
            print(f"[OK] Usuario de aplicación '{settings.db_app_user}' aprovisionado con permisos DML.")

    conn.close()

    # 3. Validar conexión como usuario de aplicación
    print(f"[*] Verificando acceso como '{settings.db_app_user}'...")
    try:
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
            print(f"BOOTSTRAP_OK: Base de datos '{row[0]}' accesible exitosamente por '{row[1]}'")
        app_conn.close()
    except Exception as exc:
        print(f"[ERROR] Verificación de conexión como aplicación falló: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    bootstrap_database()
