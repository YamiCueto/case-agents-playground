import re
from typing import Any, Dict
from src.domain.enums import UserRole

SENSITIVE_FIELD_NAMES = {
    "password",
    "token",
    "secret",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "credential",
    "private_key",
}

CONNECTION_STRING_PATTERN = re.compile(r"://([^:@]+):([^@]+)@")


def sanitize_value(key: str, value: Any) -> Any:
    key_lower = key.lower()
    if any(s in key_lower for s in SENSITIVE_FIELD_NAMES):
        return "***REDACTED***"

    if isinstance(value, str):
        if CONNECTION_STRING_PATTERN.search(value):
            return CONNECTION_STRING_PATTERN.sub(r"://\1:***REDACTED***@", value)
        return value

    if isinstance(value, dict):
        return sanitize_payload(value)

    if isinstance(value, list):
        return [sanitize_value(key, item) for item in value]

    return value


def sanitize_payload(payload: Dict[str, Any], viewer_role: str = UserRole.USER.value) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = {}
    for k, v in payload.items():
        if k == "comments" and isinstance(v, list) and viewer_role == UserRole.USER.value:
            filtered_comments = [
                c for c in v if not (isinstance(c, dict) and c.get("is_internal") is True)
            ]
            sanitized[k] = [sanitize_payload(c) if isinstance(c, dict) else c for c in filtered_comments]
            continue

        if k == "is_internal" and v is True and viewer_role == UserRole.USER.value:
            continue

        sanitized[k] = sanitize_value(k, v)

    sanitized["_lab_mode"] = True
    return sanitized
