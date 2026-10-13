"""
Tests de portabilidad, configuración centralizada, proveedores LLM y siembra idempotente.
Valida que el sistema sea completamente portable, seguro y reproducible.
"""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from urllib.parse import quote_plus

from src.infrastructure.config import Settings, _parse_port, get_settings
from src.agents.common.providers import OpenAICompatibleProvider, MockModelProvider


@pytest.fixture(autouse=True)
def clean_settings_cache():
    """Limpia la caché de get_settings antes y después de cada prueba."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# ------------------------------------------------------------------------------
# 1. PRUEBAS DE CONFIGURACIÓN Y SETTINGS
# ------------------------------------------------------------------------------

def test_parse_port_safety():
    """Valida que _parse_port maneje enteros válidos, cadenas inválidas y rangos fuera de límite."""
    assert _parse_port("3306", 3306) == 3306
    assert _parse_port("8000", 8000) == 8000
    assert _parse_port("1", 3306) == 1
    assert _parse_port("65535", 3306) == 65535
    # Casos inválidos caen al default
    assert _parse_port("invalid_port", 3306) == 3306
    assert _parse_port("-10", 3306) == 3306
    assert _parse_port("70000", 3306) == 3306
    assert _parse_port("", 3306) == 3306
    assert _parse_port(None, 3306) == 3306


def test_settings_empty_passwords_format_urls_cleanly():
    """Valida que contraseñas vacías no generen sintaxis inválida 'user:@host'."""
    with patch.dict(os.environ, {
        "DB_ADMIN_USER": "root",
        "DB_ADMIN_PASSWORD": "",
        "DB_APP_USER": "test_user",
        "DB_APP_PASSWORD": "",
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_NAME": "test_db",
    }, clear=False):
        s = Settings()
        assert s.admin_database_url == "mysql+pymysql://root@127.0.0.1:3306/test_db?charset=utf8mb4"
        assert s.server_admin_url == "mysql+pymysql://root@127.0.0.1:3306/?charset=utf8mb4"
        assert s.app_database_url == "mysql+pymysql://test_user@127.0.0.1:3306/test_db?charset=utf8mb4"


def test_settings_special_characters_in_passwords_are_escaped():
    """Valida que contraseñas con caracteres especiales (@, :, /, ?, #) sean escapadas con quote_plus."""
    special_pwd = "p@$$w:rd/secret?#2026"
    escaped = quote_plus(special_pwd)

    with patch.dict(os.environ, {
        "DB_ADMIN_USER": "admin",
        "DB_ADMIN_PASSWORD": special_pwd,
        "DB_APP_USER": "app",
        "DB_APP_PASSWORD": special_pwd,
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_NAME": "my_db",
    }, clear=False):
        s = Settings()
        assert f"admin:{escaped}@" in s.admin_database_url
        assert f"app:{escaped}@" in s.app_database_url


def test_settings_repr_masks_all_secrets():
    """Valida que repr(Settings) nunca exponga contraseñas reales ni API keys."""
    with patch.dict(os.environ, {
        "DB_ADMIN_PASSWORD": "super_secret_admin_pass",
        "DB_APP_PASSWORD": "super_secret_app_pass",
        "LLM_API_KEY": "sk-secret-token-123456",
    }, clear=False):
        s = Settings()
        repr_str = repr(s)
        assert "super_secret_admin_pass" not in repr_str
        assert "super_secret_app_pass" not in repr_str
        assert "sk-secret-token-123456" not in repr_str
        assert "db_admin_password='***'" in repr_str
        assert "db_app_password='***'" in repr_str
        assert "llm_api_key='***'" in repr_str


def test_settings_safe_urls_mask_passwords():
    """Valida que safe_admin_database_url y safe_app_database_url enmascaren contraseñas con ***."""
    with patch.dict(os.environ, {
        "DB_ADMIN_PASSWORD": "my_secret_admin_pw",
        "DB_APP_PASSWORD": "my_secret_app_pw",
    }, clear=False):
        s = Settings()
        assert "my_secret_admin_pw" not in s.safe_admin_database_url
        assert ":***@" in s.safe_admin_database_url
        assert "my_secret_app_pw" not in s.safe_app_database_url
        assert ":***@" in s.safe_app_database_url


def test_settings_cors_origins_parsing():
    """Valida el parseo de orígenes CORS separados por coma."""
    with patch.dict(os.environ, {
        "CORS_ORIGINS": "http://localhost:4200, http://127.0.0.1:4200, https://myapp.example.com",
    }, clear=False):
        s = Settings()
        assert s.cors_origins == [
            "http://localhost:4200",
            "http://127.0.0.1:4200",
            "https://myapp.example.com",
        ]


# ------------------------------------------------------------------------------
# 2. PRUEBAS DE PROVEEDOR LLM (OpenAICompatibleProvider)
# ------------------------------------------------------------------------------

def test_provider_resolves_settings_when_arguments_are_none():
    """Valida que OpenAICompatibleProvider tome base_url y api_key desde Settings si no se suministran."""
    with patch.dict(os.environ, {
        "LLM_BASE_URL": "http://127.0.0.1:9999/v1",
        "LLM_API_KEY": "test-env-key",
        "LLM_MODEL": "test-qwen-custom",
    }, clear=False):
        from src.infrastructure.config import get_settings
        get_settings.cache_clear()

        provider = OpenAICompatibleProvider()
        assert provider.base_url == "http://127.0.0.1:9999/v1"
        assert provider.model_name == "test-qwen-custom"
        assert provider.display_model_name == "test-qwen-custom"


def test_provider_display_model_name_sanitizes_local_paths():
    """Valida que display_model_name limpie rutas de archivo y extensiones .gguf/.bin."""
    provider = OpenAICompatibleProvider(
        base_url="http://127.0.0.1:8080/v1",
        model=r"C:\LLM\models\Qwen3.5-4B-UD-Q5_K_XL.gguf",
    )
    assert provider.display_model_name == "Qwen3.5-4B-UD-Q5_K_XL"

    provider_linux = OpenAICompatibleProvider(
        base_url="http://127.0.0.1:8080/v1",
        model="/models/qwen2.5-7b-instruct.bin",
    )
    assert provider_linux.display_model_name == "qwen2.5-7b-instruct"


def test_provider_disconnected_raises_informative_runtime_error():
    """Valida que generate() sobre un servidor desconectado arroje RuntimeError explicativo."""
    provider = OpenAICompatibleProvider(
        base_url="http://127.0.0.1:65530/v1",  # Puerto cerrado
        model="test-model",
    )
    with pytest.raises(RuntimeError) as exc_info:
        provider.generate(
            messages=[{"role": "user", "content": "Hola"}],
            tools=[],
            timeout=1.0,
        )
    assert "Error de comunicación con el servidor LLM" in str(exc_info.value)
    assert "65530" in str(exc_info.value)


def test_provider_check_connection_returns_false_when_unreachable():
    """Valida que check_connection devuelva (False, mensaje) sin levantar excepciones no controladas."""
    provider = OpenAICompatibleProvider(
        base_url="http://127.0.0.1:65530/v1",
        model="test-model",
    )
    ok, msg = provider.check_connection(timeout=0.5)
    assert ok is False
    assert "No fue posible conectar con el servidor LLM" in msg


def test_provider_context_metadata_gracefully_handles_missing_props():
    """Valida que get_context_metadata no falle cuando /props no esté implementado."""
    provider = OpenAICompatibleProvider(
        base_url="http://127.0.0.1:65530/v1",
        model="test-model",
    )
    meta = provider.get_context_metadata(timeout=0.5)
    assert meta["server_context_limit"] is None
    assert meta["model_context_capacity"] is None
    assert provider.context_window == 4096


# ------------------------------------------------------------------------------
# 3. PRUEBAS DE SIEMBRA IDEMPOTENTE (seed_database)
# ------------------------------------------------------------------------------

def test_seed_database_is_fully_idempotent():
    """Valida que seed_database() pueda ejecutarse múltiples veces consecutivas sin duplicar registros."""
    from scripts.seed_data import seed_database
    from src.infrastructure.database.connection import get_app_session_factory
    from src.infrastructure.database.models import UserModel, TicketCategoryModel, TicketModel

    # Primera ejecución: asegura que todo esté sembrado
    first_stats = seed_database()

    factory = get_app_session_factory()
    session = factory()
    try:
        users_count_1 = session.query(UserModel).count()
        cats_count_1 = session.query(TicketCategoryModel).count()
        tickets_count_1 = session.query(TicketModel).count()

        assert users_count_1 >= 6
        assert cats_count_1 >= 5
        assert tickets_count_1 >= 5
    finally:
        session.close()

    # Segunda ejecución: debe reportar 0 nuevas entidades creadas
    second_stats = seed_database()
    assert second_stats["users_created"] == 0
    assert second_stats["categories_created"] == 0
    assert second_stats["tickets_created"] == 0

    session = factory()
    try:
        users_count_2 = session.query(UserModel).count()
        cats_count_2 = session.query(TicketCategoryModel).count()
        tickets_count_2 = session.query(TicketModel).count()

        # Las cuentas exactas deben ser idénticas
        assert users_count_2 == users_count_1
        assert cats_count_2 == cats_count_1
        assert tickets_count_2 == tickets_count_1
    finally:
        session.close()


def test_seed_database_preserves_canonical_tickets():
    """Valida que los cinco tickets canónicos pedagógicos TICK-1001 a TICK-1005 existan intactos."""
    from scripts.seed_data import seed_database
    from src.infrastructure.database.connection import get_app_session_factory
    from src.infrastructure.database.models import TicketModel

    seed_database()

    factory = get_app_session_factory()
    session = factory()
    try:
        expected_codes = ["TICK-1001", "TICK-1002", "TICK-1003", "TICK-1004", "TICK-1005"]
        for code in expected_codes:
            ticket = session.query(TicketModel).filter(TicketModel.code == code).first()
            assert ticket is not None, f"Ticket canónico {code} no encontrado"
            assert ticket.title != ""
            assert ticket.category_id is not None
            assert ticket.creator_id is not None
    finally:
        session.close()
