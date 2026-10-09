import os
from functools import lru_cache
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.db_host: str = os.getenv("DB_HOST", "127.0.0.1")
        self.db_port: int = int(os.getenv("DB_PORT", "3306"))
        self.db_name: str = os.getenv("DB_NAME", "cfa_tickets")
        self.db_admin_user: str = os.getenv("DB_ADMIN_USER", "root")
        self.db_admin_password: str = os.getenv("DB_ADMIN_PASSWORD", "")
        self.db_app_user: str = os.getenv("DB_APP_USER", "cfa_app_user")
        self.db_app_password: str = os.getenv("DB_APP_PASSWORD", "cfa_secure_pass_2026")
        self.llm_base_url: str = os.getenv("LLM_BASE_URL", "http://127.0.0.1:8080/v1")
        self.llm_api_key: str = os.getenv("LLM_API_KEY", "local-llama-cpp")

    @property
    def admin_database_url(self) -> str:
        escaped_password = quote_plus(self.db_admin_password)
        auth = f"{self.db_admin_user}:{escaped_password}" if self.db_admin_password else self.db_admin_user
        return f"mysql+pymysql://{auth}@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"

    @property
    def server_admin_url(self) -> str:
        escaped_password = quote_plus(self.db_admin_password)
        auth = f"{self.db_admin_user}:{escaped_password}" if self.db_admin_password else self.db_admin_user
        return f"mysql+pymysql://{auth}@{self.db_host}:{self.db_port}/?charset=utf8mb4"

    @property
    def app_database_url(self) -> str:
        escaped_password = quote_plus(self.db_app_password)
        return f"mysql+pymysql://{self.db_app_user}:{escaped_password}@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
