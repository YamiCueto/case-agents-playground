#!/usr/bin/env python3
"""
AEP ENVIRONMENT DOCTOR & DIAGNOSTIC CLI
Herramienta de diagnóstico de salud del entorno local para Agent Engineering Playground.
Verifica dependencias, base de datos MySQL, migraciones Alembic, seed data y servidor LLM.
"""

import os
import sys
import shutil
import subprocess
from typing import Dict, Any, List, Tuple

# Garantizar que el directorio raíz del proyecto esté en sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


def print_header(title: str) -> None:
    print("\n" + "=" * 70)
    print(f" {title}")
    print("=" * 70)


def check_python_environment() -> Tuple[bool, str]:
    v = sys.version_info
    ver_str = f"{v.major}.{v.minor}.{v.micro}"
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    venv_status = "Entorno virtual ACTIVO" if in_venv else "ALERTA: Ejecutando fuera de virtualenv"

    if v.major == 3 and v.minor >= 10:
        return True, f"Python {ver_str} ({venv_status})"
    return False, f"Python {ver_str} (Se recomienda Python 3.10 o superior, {venv_status})"


def check_python_packages() -> Tuple[bool, str]:
    required_packages = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("sqlalchemy", "SQLAlchemy"),
        ("pymysql", "PyMySQL"),
        ("alembic", "Alembic"),
        ("pydantic", "Pydantic"),
        ("openai", "OpenAI SDK"),
        ("httpx", "HTTPX"),
        ("dotenv", "python-dotenv"),
    ]
    missing = []
    for pkg_import, pkg_name in required_packages:
        try:
            __import__(pkg_import)
        except ImportError:
            missing.append(pkg_name)

    if not missing:
        return True, f"Todas las dependencias esenciales instaladas ({len(required_packages)} paquetes)"
    return False, f"Faltan dependencias: {', '.join(missing)}. Ejecuta: pip install -r requirements.txt"


def check_node_environment() -> Tuple[bool, str]:
    node_bin = shutil.which("node")
    npm_bin = shutil.which("npm")

    if not node_bin:
        return False, "Node.js no encontrado en el PATH. Instala Node.js 22 LTS."
    if not npm_bin:
        return False, "npm no encontrado en el PATH."

    try:
        node_ver = subprocess.check_output([node_bin, "--version"], text=True).strip()
        npm_ver = subprocess.check_output([npm_bin, "--version"], text=True).strip()

        # Comprobar versión mínima requerida por Angular 22 (Node 22 LTS o superior)
        major = int(node_ver.lstrip("v").split(".")[0])
        if major >= 20:
            frontend_modules = os.path.isdir("frontend/node_modules")
            mod_status = "node_modules presente" if frontend_modules else "Falta frontend/node_modules (ejecuta: cd frontend && npm ci)"
            return True, f"Node {node_ver}, npm {npm_ver} ({mod_status})"
        return False, f"Node {node_ver} detectado. Angular 22 requiere Node.js >= 22.22.3."
    except Exception as exc:
        return False, f"Error consultando versiones de Node/npm: {exc}"


def check_configuration_and_env() -> Tuple[bool, str, Any]:
    env_exists = os.path.isfile(".env")
    example_exists = os.path.isfile(".env.example")

    if not env_exists:
        msg = "Archivo .env NO encontrado. Crea uno copiando .env.example: cp .env.example .env"
        return False, msg, None

    try:
        from src.infrastructure.config import get_settings
        settings = get_settings()
        details = (
            f"DB: {settings.db_admin_user}@{settings.db_host}:{settings.db_port}/{settings.db_name} | "
            f"LLM: {settings.llm_base_url}"
        )
        return True, f"Archivo .env cargado correctamente ({details})", settings
    except Exception as exc:
        return False, f"Error cargando configuración en Settings: {exc}", None


def check_mysql_database(settings: Any) -> Tuple[bool, str]:
    if settings is None:
        return False, "No se puede probar MySQL porque Settings no está cargado."

    import pymysql

    # 1. Probar conexión administrador
    try:
        admin_conn = pymysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_admin_user,
            password=settings.db_admin_password,
            charset="utf8mb4",
        )
        with admin_conn.cursor() as cursor:
            cursor.execute("SELECT VERSION();")
            ver = cursor.fetchone()[0]
        admin_conn.close()
    except Exception as exc:
        return False, (
            f"No fue posible conectar como administrador '{settings.db_admin_user}' a {settings.db_host}:{settings.db_port}. "
            f"¿MySQL está corriendo? Detalle: {exc}"
        )

    # 2. Comprobar si la base de datos existe
    try:
        admin_conn = pymysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_admin_user,
            password=settings.db_admin_password,
            database=settings.db_name,
            charset="utf8mb4",
        )
        admin_conn.close()
        db_exists = True
    except pymysql.err.OperationalError:
        db_exists = False

    if not db_exists:
        return False, (
            f"MySQL conectado ({ver}), pero la base de datos '{settings.db_name}' aún no existe. "
            f"Ejecuta: python scripts/bootstrap_db.py"
        )

    # 3. Probar usuario de aplicación
    try:
        app_conn = pymysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_app_user,
            password=settings.db_app_password,
            database=settings.db_name,
            charset="utf8mb4",
        )
        app_conn.close()
        return True, f"MySQL {ver} conectado. Base de datos '{settings.db_name}' accesible por '{settings.db_app_user}'"
    except Exception as exc:
        return False, (
            f"Base de datos existe, pero usuario de aplicación '{settings.db_app_user}' no pudo conectarse. "
            f"Ejecuta: python scripts/bootstrap_db.py para aprovisionar permisos. Detalle: {exc}"
        )


def check_alembic_migrations(settings: Any) -> Tuple[bool, str]:
    if settings is None:
        return False, "Configuración ausente."

    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext
        from sqlalchemy import create_engine

        alembic_cfg = Config("alembic.ini")
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()

        engine = create_engine(settings.admin_database_url)
        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current_rev = context.get_current_revision()

        if current_rev == head_rev and head_rev is not None:
            return True, f"Migraciones al día (Revisión: {current_rev})"
        elif current_rev is None:
            return False, f"No hay migraciones aplicadas en la base de datos. Ejecuta: alembic upgrade head"
        else:
            return False, f"Migración desactualizada (Actual: {current_rev}, Head: {head_rev}). Ejecuta: alembic upgrade head"
    except Exception as exc:
        return False, f"No se pudo consultar el estado de Alembic: {exc}"


def check_seed_data(settings: Any) -> Tuple[bool, str]:
    if settings is None:
        return False, "Configuración ausente."

    try:
        from src.infrastructure.database.connection import get_app_session_factory
        from src.infrastructure.database.models import (
            UserModel,
            TicketCategoryModel,
            TicketModel,
        )

        session_factory = get_app_session_factory()
        session = session_factory()
        try:
            u_count = session.query(UserModel).count()
            c_count = session.query(TicketCategoryModel).count()
            t_count = session.query(TicketModel).count()

            expected_tickets = {"TICK-1001", "TICK-1002", "TICK-1003", "TICK-1004", "TICK-1005"}
            existing_codes = {t.code for t in session.query(TicketModel.code).all()}
            missing_codes = expected_tickets - existing_codes

            if u_count >= 6 and c_count >= 5 and t_count >= 5 and not missing_codes:
                return True, f"Datos sembrados ({u_count} usuarios, {c_count} categorías, {t_count} tickets canónicos)"
            else:
                return False, (
                    f"Datos incompletos ({u_count} usuarios, {c_count} categorías, {t_count} tickets). "
                    f"Faltan tickets: {missing_codes or 'ninguno'}. Ejecuta: python scripts/seed_data.py"
                )
        finally:
            session.close()
    except Exception as exc:
        return False, f"Error verificando seed data: {exc}"


def check_llm_server(settings: Any) -> Tuple[bool, str]:
    if settings is None:
        return False, "Configuración ausente."

    from src.agents.common.providers import OpenAICompatibleProvider

    provider = OpenAICompatibleProvider(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
    )
    ok, msg = provider.check_connection(timeout=2.0)
    if ok:
        ctx_meta = provider.get_context_metadata(timeout=1.5)
        n_ctx = ctx_meta.get("server_context_limit") or 4096
        return True, f"{msg} | Context window: {n_ctx} tokens"
    else:
        return False, (
            f"NO DISPONIBLE ({msg}). "
            f"Nota: El modo Demo funcionará igualmente. Para usar el modo Live, inicia llama-server."
        )


def check_running_services(settings: Any) -> Tuple[str, str]:
    import urllib.request

    # 1. Backend FastAPI
    api_url = f"http://{settings.backend_host if settings else '127.0.0.1'}:{settings.backend_port if settings else 8000}/api/health"
    try:
        req = urllib.request.Request(api_url)
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            api_status = "ACTIVO (HTTP 200)" if resp.status == 200 else f"HTTP {resp.status}"
    except Exception:
        api_status = "NO INICIADO (Inicia con: uvicorn src.api.app:app --reload)"

    # 2. Frontend Angular
    front_url = "http://localhost:4200"
    try:
        req = urllib.request.Request(front_url)
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            front_status = "ACTIVO (HTTP 200)" if resp.status == 200 else f"HTTP {resp.status}"
    except Exception:
        front_status = "NO INICIADO (Inicia con: cd frontend && npm start)"

    return api_status, front_status


def main() -> int:
    print_header("AEP — AGENT ENGINEERING PLAYGROUND: DIAGNÓSTICO DEL ENTORNO")
    print(f"Directorio de trabajo: {os.getcwd()}")

    results = []

    # 1. Python Environment
    ok, msg = check_python_environment()
    results.append(("Python Runtime", ok, msg))

    # 2. Python Packages
    ok, msg = check_python_packages()
    results.append(("Dependencias Python", ok, msg))

    # 3. Node & npm
    ok, msg = check_node_environment()
    results.append(("Node.js & Frontend", ok, msg))

    # 4. Config & .env
    ok, msg, settings = check_configuration_and_env()
    results.append(("Configuración (.env)", ok, msg))

    # 5. MySQL Database
    ok, msg = check_mysql_database(settings)
    results.append(("Base de Datos MySQL", ok, msg))

    # 6. Alembic Migrations
    ok, msg = check_alembic_migrations(settings)
    results.append(("Migraciones Alembic", ok, msg))

    # 7. Seed Data
    ok, msg = check_seed_data(settings)
    results.append(("Seed Data Canónico", ok, msg))

    # 8. LLM Server (llama.cpp)
    ok, msg = check_llm_server(settings)
    results.append(("Servidor LLM (llama.cpp)", ok, msg))

    # 9. Running Services
    api_status, front_status = check_running_services(settings)

    print("\n" + "-" * 70)
    print(" REPORTE DE ESTADO DEL LABORATORIO")
    print("-" * 70)

    all_critical_ok = True
    for item_name, is_ok, message in results:
        # LLM no es bloqueante para arranque general si el usuario solo va a usar Demo o preparar código
        is_optional = "LLM" in item_name
        tag = "[OK]      " if is_ok else ("[ADVERTENCIA]" if is_optional else "[ERROR]   ")
        print(f"{tag} {item_name}:")
        print(f"           {message}")
        if not is_ok and not is_optional:
            all_critical_ok = False

    print("\n" + "-" * 70)
    print(" SERVICIOS EN EJECUCIÓN (LOCAL LIVE)")
    print("-" * 70)
    print(f"[*] Backend FastAPI: {api_status}")
    print(f"[*] Frontend Angular: {front_status}")

    print("\n" + "=" * 70)
    if all_critical_ok:
        print(" [DICTAMEN]: ENTORNO LOCAL LISTO Y OPERATIVO.")
        print(" Para iniciar el laboratorio en modo Live:")
        print("   1. Iniciar llama-server (si vas a ejecutar inferencia real)")
        print("   2. Terminal 1: uvicorn src.api.app:app --reload --port 8000")
        print("   3. Terminal 2: cd frontend && npm start")
        print("=" * 70 + "\n")
        return 0
    else:
        print(" [DICTAMEN]: ATENCIÓN REQUERIDA. Resuelve los puntos marcados con [ERROR].")
        print("=" * 70 + "\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
