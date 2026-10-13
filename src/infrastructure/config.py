import os
from functools import lru_cache
from typing import List, Optional
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()


def _parse_port(val: Optional[str], default: int) -> int:
    """Valida y parsea un puerto TCP de forma segura (rango 1..65535)."""
    if val is None:
        return default
    try:
        port = int(val)
        if 1 <= port <= 65535:
            return port
        return default
    except (ValueError, TypeError):
        return default


class Settings:
    """Configuración centralizada y tipada del entorno de AEP.

    Todas las propiedades se leen desde variables de entorno con fallbacks
    sensatos y seguros que no acoplan el código a una máquina específica.
    """

    def __init__(self) -> None:
        # Configuración de Base de Datos MySQL
        self.db_host: str = os.getenv("DB_HOST", "127.0.0.1")
        self.db_port: int = _parse_port(os.getenv("DB_PORT", "3306"), 3306)
        self.db_name: str = os.getenv("DB_NAME", "cfa_tickets")

        # Usuario administrador (con privilegios de DDL para crear base de datos y usuario)
        self.db_admin_user: str = os.getenv("DB_ADMIN_USER", "root")
        self.db_admin_password: str = os.getenv("DB_ADMIN_PASSWORD", "")

        # Usuario de aplicación (privilegios mínimos de DML: SELECT, INSERT, UPDATE, DELETE)
        self.db_app_user: str = os.getenv("DB_APP_USER", "cfa_app_user")
        self.db_app_password: str = os.getenv("DB_APP_PASSWORD", "")

        # Configuración del Servidor LLM (llama.cpp / OpenAI-compatible)
        self.llm_base_url: str = os.getenv("LLM_BASE_URL", "http://127.0.0.1:8080/v1")
        self.llm_api_key: str = os.getenv("LLM_API_KEY", "local-llama-cpp")
        raw_model = os.getenv("LLM_MODEL", "").strip()
        self.llm_model: Optional[str] = raw_model if raw_model else None

        # Configuración del Servidor Backend FastAPI
        self.backend_host: str = os.getenv("BACKEND_HOST", "127.0.0.1")
        self.backend_port: int = _parse_port(os.getenv("BACKEND_PORT", "8000"), 8000)

        # Orígenes permitidos para CORS (separados por coma en variable de entorno)
        raw_cors = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:4200,http://127.0.0.1:4200,http://localhost:3000,http://127.0.0.1:3000",
        )
        self.cors_origins: List[str] = [x.strip() for x in raw_cors.split(",") if x.strip()]

    def _build_mysql_url(
        self,
        user: str,
        password: str,
        host: str,
        port: int,
        db: Optional[str] = None,
        mask_password: bool = False,
    ) -> str:
        """Construye una URL SQLAlchemy para PyMySQL con escape seguro de credenciales."""
        if password:
            pwd_part = "***" if mask_password else quote_plus(password)
            auth = f"{user}:{pwd_part}"
        else:
            auth = user

        db_part = f"/{db}" if db else "/"
        return f"mysql+pymysql://{auth}@{host}:{port}{db_part}?charset=utf8mb4"

    @property
    def admin_database_url(self) -> str:
        """URL de conexión para el usuario administrador apuntando a la base de datos."""
        return self._build_mysql_url(
            self.db_admin_user,
            self.db_admin_password,
            self.db_host,
            self.db_port,
            self.db_name,
        )

    @property
    def safe_admin_database_url(self) -> str:
        """URL de conexión del administrador con contraseña enmascarada para logs."""
        return self._build_mysql_url(
            self.db_admin_user,
            self.db_admin_password,
            self.db_host,
            self.db_port,
            self.db_name,
            mask_password=True,
        )

    @property
    def server_admin_url(self) -> str:
        """URL de conexión al servidor MySQL (sin base de datos específica) para tareas DDL."""
        return self._build_mysql_url(
            self.db_admin_user,
            self.db_admin_password,
            self.db_host,
            self.db_port,
            None,
        )

    @property
    def app_database_url(self) -> str:
        """URL de conexión para el usuario de aplicación."""
        return self._build_mysql_url(
            self.db_app_user,
            self.db_app_password,
            self.db_host,
            self.db_port,
            self.db_name,
        )

    @property
    def safe_app_database_url(self) -> str:
        """URL de conexión de la aplicación con contraseña enmascarada para logs."""
        return self._build_mysql_url(
            self.db_app_user,
            self.db_app_password,
            self.db_host,
            self.db_port,
            self.db_name,
            mask_password=True,
        )

    def __repr__(self) -> str:
        admin_pwd_repr = "'***'" if self.db_admin_password else "''"
        app_pwd_repr = "'***'" if self.db_app_password else "''"
        api_key_repr = "'***'" if self.llm_api_key else "''"
        return (
            f"Settings("
            f"db_host={self.db_host!r}, "
            f"db_port={self.db_port}, "
            f"db_name={self.db_name!r}, "
            f"db_admin_user={self.db_admin_user!r}, "
            f"db_admin_password={admin_pwd_repr}, "
            f"db_app_user={self.db_app_user!r}, "
            f"db_app_password={app_pwd_repr}, "
            f"llm_base_url={self.llm_base_url!r}, "
            f"llm_api_key={api_key_repr}, "
            f"llm_model={self.llm_model!r}, "
            f"backend_host={self.backend_host!r}, "
            f"backend_port={self.backend_port}"
            f")"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
