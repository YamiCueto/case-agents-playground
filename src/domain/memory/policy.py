from dataclasses import dataclass
import math
import re
from typing import Any, Dict, List, Optional, Set
from src.domain.memory.enums import MemoryScope, ProvenanceType


# ---------------------------------------------------------------------------
# Patrones Regex de Detección de Secretos y Credenciales
# ---------------------------------------------------------------------------
REGEX_JWT = re.compile(r"eyJ[a-zA-Z0-9_-]{8,}\.eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{4,}")
REGEX_BEARER = re.compile(r"(?i)bearer\s+[a-zA-Z0-9_\-\.]{16,}")
REGEX_CONN_STRING = re.compile(r"://([^:@]+):([^@]+)@")
REGEX_PRIVATE_KEY = re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----")
REGEX_API_KEY_PREFIX = re.compile(
    r"(?i)\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b"
    r"|\b(?:sk|pk)[-_](?:proj[-_]|admin[-_]|ant[-_]|live[-_]|test[-_])?[a-zA-Z0-9_\-]{20,}\b"
    r"|\bakia[0-9a-z]{16}\b"
    r"|\bAIza[0-9A-Za-z\-_]{35}\b"
)
REGEX_GENERIC_SECRET_KV = re.compile(r"(?i)\b(password|secret|token|api_?key|credencial|clave)\s*([:=])\s*['\"]?([^\s'\"]{6,})['\"]?")


SENSITIVE_FIELD_NAMES: Set[str] = {
    "password",
    "token",
    "secret",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "credential",
    "private_key",
    "clave",
    "contraseña",
}

SAFE_METRIC_FIELD_NAMES: Set[str] = {
    "query_tokens",
    "system_prompt_tokens",
    "decisions_tokens",
    "history_tokens",
    "total_initial_tokens",
    "available_history_budget",
    "max_context_budget",
    "total_context_limit",
    "max_context_tokens",
    "remaining_tokens",
    "tokens_estimate",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "tokens_used",
    "tokens_left",
    "history_turns_count",
    "decisions_count",
    "turns_count",
}

EXPLICIT_PREFERENCE_PHRASES: List[str] = [
    "siempre",
    "mi preferencia",
    "para todos mis",
    "prioriza siempre",
    "de ahora en adelante",
    "por defecto usa",
    "guarda mi preferencia",
    "recuerda siempre",
    "recuerda que",
    "prefiero",
    "mi preferencia es",
    "debes recordar",
    "toma en cuenta para el futuro",
    "a partir de ahora",
    "en todas las ocasiones",
    "guarda esto",
]


@dataclass(frozen=True)
class PolicyEvaluationResult:
    is_allowed: bool
    reason: str
    sanitized_value: Any = None
    detected_violation: Optional[str] = None


def calculate_shannon_entropy(text: str) -> float:
    """Calcula la entropía de Shannon (en bits) de una cadena dada."""
    if not text:
        return 0.0
    freq: Dict[str, int] = {}
    for char in text:
        freq[char] = freq.get(char, 0) + 1
    entropy = 0.0
    text_len = len(text)
    for count in freq.values():
        p = count / text_len
        entropy -= p * math.log2(p)
    return entropy


class MemoryPolicy:
    """
    Política Soberana de Memoria y Seguridad en el Dominio.

    Responsabilidades:
    1. Detección y sanitización de secretos (regex + entropía).
    2. Autorización estricta de persistencia (no promover inferencias del LLM a preferencias persistentes).
    3. Asegurar independencia de infraestructura (cero SQLAlchemy, FastAPI o Angular).
    """

    ENTROPY_THRESHOLD = 4.5
    ENTROPY_MIN_LENGTH = 20

    @classmethod
    def detect_secret_pattern(cls, text: str) -> Optional[str]:
        """Identifica si el texto contiene patrones evidentes de secretos o claves."""
        if not isinstance(text, str) or not text:
            return None

        if REGEX_PRIVATE_KEY.search(text):
            return "PRIVATE_KEY"
        if REGEX_JWT.search(text):
            return "JWT_TOKEN"
        if REGEX_BEARER.search(text):
            return "BEARER_TOKEN"
        if REGEX_CONN_STRING.search(text):
            return "CONNECTION_STRING_CREDENTIALS"
        if REGEX_API_KEY_PREFIX.search(text):
            return "API_KEY_KNOWN_PREFIX"
        if REGEX_GENERIC_SECRET_KV.search(text):
            return "GENERIC_SECRET_ASSIGNMENT"

        # Comprobación de palabras aleatorias con alta entropía
        words = re.findall(r"[a-zA-Z0-9_\-\.]{20,}", text)
        for w in words:
            if calculate_shannon_entropy(w) >= cls.ENTROPY_THRESHOLD:
                return "HIGH_ENTROPY_RANDOM_SECRET"

        return None

    @classmethod
    def sanitize_text(cls, text: str) -> str:
        """Reemplaza cualquier secreto detectado por ***REDACTED***."""
        if not isinstance(text, str):
            return text

        sanitized = text
        sanitized = REGEX_PRIVATE_KEY.sub("***REDACTED_PRIVATE_KEY***", sanitized)
        sanitized = REGEX_JWT.sub("***REDACTED_JWT***", sanitized)
        sanitized = REGEX_BEARER.sub("Bearer ***REDACTED_TOKEN***", sanitized)
        sanitized = REGEX_CONN_STRING.sub(r"://\1:***REDACTED_PASSWORD***@", sanitized)
        sanitized = REGEX_API_KEY_PREFIX.sub("***REDACTED_API_KEY***", sanitized)
        sanitized = REGEX_GENERIC_SECRET_KV.sub(r"\1\2 ***REDACTED_SECRET***", sanitized)

        # Redactar cadenas de alta entropía individuales
        for w in re.findall(r"[a-zA-Z0-9_\-\.]{20,}", sanitized):
            if "***" not in w and calculate_shannon_entropy(w) >= cls.ENTROPY_THRESHOLD:
                sanitized = sanitized.replace(w, "***REDACTED_HIGH_ENTROPY***")

        return sanitized

    @classmethod
    def is_sensitive_key(cls, key: str) -> bool:
        """Determina si una clave de diccionario corresponde a secretos reales, protegiendo métricas de tokens."""
        key_lower = str(key).lower()
        if key_lower in SAFE_METRIC_FIELD_NAMES:
            return False
        if (key_lower.endswith("_tokens") or key_lower.endswith("_tokens_est") or key_lower.startswith("tokens_")) and not any(
            auth in key_lower for auth in ("auth", "access", "session", "refresh", "secret", "api", "bearer", "jwt")
        ):
            return False

        for s in SENSITIVE_FIELD_NAMES:
            if s == "token":
                if key_lower == "token" or any(
                    tok in key_lower
                    for tok in (
                        "auth_token",
                        "access_token",
                        "session_token",
                        "refresh_token",
                        "bearer_token",
                        "api_token",
                        "secret_token",
                        "jwt_token",
                        "csrf_token",
                    )
                ):
                    return True
            elif s in key_lower:
                return True
        return False

    @classmethod
    def sanitize_payload(cls, data: Any) -> Any:
        """Sanitiza recursivamente diccionarios, listas y valores escalares."""
        if isinstance(data, str):
            return cls.sanitize_text(data)

        if isinstance(data, dict):
            sanitized_dict: Dict[str, Any] = {}
            for k, v in data.items():
                if cls.is_sensitive_key(str(k)):
                    sanitized_dict[k] = "***REDACTED***"
                else:
                    sanitized_dict[k] = cls.sanitize_payload(v)
            return sanitized_dict

        if isinstance(data, list):
            return [cls.sanitize_payload(item) for item in data]

        return data

    @classmethod
    def has_explicit_preference_intent(cls, user_query: str) -> bool:
        """Verifica si la consulta del usuario manifiesta explícitamente una preferencia permanente."""
        if not user_query:
            return False
        q_lower = user_query.lower()
        return any(phrase in q_lower for phrase in EXPLICIT_PREFERENCE_PHRASES)

    @classmethod
    def evaluate_decision_persistence(
        cls,
        key: str,
        value: Any,
        scope: MemoryScope,
        provenance: ProvenanceType,
        user_query: Optional[str] = None,
        rationale: Optional[str] = None,
        explicit_user_confirmation: bool = False,
    ) -> PolicyEvaluationResult:
        """
        Evalúa si una decisión califica para persistirse y sanitiza su contenido.

        Reglas:
        1. Si contiene secretos o claves sensibles, se bloquea la persistencia.
        2. Si el scope es PERSISTENT, se exige procedencia USER_EXPLICIT y (confirmación explícita o frase de intención).
           Las inferencias del LLM (AGENT_PROPOSED_RESOLVED) jamás se aceptan como preferencias permanentes.
        """
        # 1. Comprobar nombre de clave sensible
        key_lower = key.lower()
        if any(s in key_lower for s in SENSITIVE_FIELD_NAMES):
            return PolicyEvaluationResult(
                is_allowed=False,
                reason=f"La clave '{key}' hace referencia a información sensible protegida.",
                detected_violation="SENSITIVE_KEY_NAME",
            )

        # 2. Comprobar secretos en el valor
        val_str = str(value)
        pattern = cls.detect_secret_pattern(val_str)
        if pattern:
            return PolicyEvaluationResult(
                is_allowed=False,
                reason=f"El valor de la memoria contiene un secreto detectado: {pattern}.",
                detected_violation=pattern,
            )

        # 3. Comprobar procedencia y autorización de alcance persistente
        if scope == MemoryScope.PERSISTENT:
            if provenance != ProvenanceType.USER_EXPLICIT:
                return PolicyEvaluationResult(
                    is_allowed=False,
                    reason=(
                        "Las inferencias del modelo u observaciones de herramientas "
                        "no pueden promoverse a preferencias persistentes del usuario sin autorización explícita."
                    ),
                    detected_violation="UNAUTHORIZED_INFERRED_PREFERENCE",
                )

            # Si el usuario no proporcionó confirmación explícita mediante operación/flag, validar frase en consulta o rationale
            if not explicit_user_confirmation:
                has_intent = False
                if user_query is not None and cls.has_explicit_preference_intent(user_query):
                    has_intent = True
                elif rationale is not None and cls.has_explicit_preference_intent(rationale):
                    has_intent = True

                if not has_intent:
                    return PolicyEvaluationResult(
                        is_allowed=False,
                        reason=(
                            "La operación no cuenta con confirmación explícita del operador "
                            "ni manifiesta una intención clara de persistencia permanente "
                            "(ej. 'siempre', 'mi preferencia', 'recuerda que', 'prefiero')."
                        ),
                        detected_violation="MISSING_EXPLICIT_PREFERENCE_INTENT",
                    )



        # 4. Sanitizar valor para almacenamiento limpio
        sanitized_val = cls.sanitize_payload(value)

        return PolicyEvaluationResult(
            is_allowed=True,
            reason="Aprobado por MemoryPolicy para persistencia.",
            sanitized_value=sanitized_val,
        )
