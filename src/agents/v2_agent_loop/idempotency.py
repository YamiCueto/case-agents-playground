import hashlib
import json
from enum import Enum
from typing import Any, Dict, Optional, Set, Tuple
from sqlalchemy.orm import Session
from src.infrastructure.repositories.user_repository import UserRepository
from src.domain.rules import validate_user_authorization
from src.domain.exceptions import UnauthorizedActionError

MUTATIVE_TOOLS: Set[str] = {
    "create_ticket",
    "assign_ticket",
    "change_ticket_status",
    "add_comment",
}


class MutationStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    UNCERTAIN_TIMEOUT = "uncertain_timeout"
    FAILED = "failed"


def compute_mutation_signature(tool_name: str, arguments: Dict[str, Any]) -> str:
    canonical_repr = json.dumps(
        {"tool": tool_name, "arguments": arguments},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()


class IdempotencyRegistry:
    def __init__(self) -> None:
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._status: Dict[str, MutationStatus] = {}

    def is_mutative(self, tool_name: str) -> bool:
        return tool_name in MUTATIVE_TOOLS

    def check_mutation_policy(
        self,
        execution_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        if not self.is_mutative(tool_name):
            return "ALLOW", None

        sig = compute_mutation_signature(tool_name, arguments)
        cache_key = f"{execution_id}:{sig}"
        current_st = self._status.get(cache_key)

        if current_st == MutationStatus.UNCERTAIN_TIMEOUT:
            return "BLOCKED_UNCERTAIN", {
                "status": "error",
                "error_type": "mutacion_estado_incierto",
                "message": (
                    "Operación mutativa bloqueada por política de seguridad: la invocación anterior "
                    "sufrió un timeout y su estado en MySQL es incierto. "
                    "Se rechazan reintentos automáticos para prevenir duplicación transaccional."
                ),
            }

        if current_st == MutationStatus.COMPLETED:
            cached_res = self._cache.get(cache_key)
            return "CACHED", cached_res

        return "ALLOW", None

    def get_cached_result(
        self,
        execution_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        policy, data = self.check_mutation_policy(execution_id, tool_name, arguments)
        if policy == "CACHED":
            return data
        return None

    def record_pending(
        self,
        execution_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> None:
        if not self.is_mutative(tool_name):
            return
        sig = compute_mutation_signature(tool_name, arguments)
        cache_key = f"{execution_id}:{sig}"
        self._status[cache_key] = MutationStatus.PENDING

    def record_completed(
        self,
        execution_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        result: Dict[str, Any],
    ) -> None:
        if not self.is_mutative(tool_name):
            return
        sig = compute_mutation_signature(tool_name, arguments)
        cache_key = f"{execution_id}:{sig}"
        self._status[cache_key] = MutationStatus.COMPLETED
        self._cache[cache_key] = result

    def record_uncertain_timeout(
        self,
        execution_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> None:
        if not self.is_mutative(tool_name):
            return
        sig = compute_mutation_signature(tool_name, arguments)
        cache_key = f"{execution_id}:{sig}"
        self._status[cache_key] = MutationStatus.UNCERTAIN_TIMEOUT

    def record_failed(
        self,
        execution_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> None:
        if not self.is_mutative(tool_name):
            return
        sig = compute_mutation_signature(tool_name, arguments)
        cache_key = f"{execution_id}:{sig}"
        self._status[cache_key] = MutationStatus.FAILED

    def register_result(
        self,
        execution_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        result: Dict[str, Any],
    ) -> None:
        self.record_completed(execution_id, tool_name, arguments, result)

    def clear(self) -> None:
        self._cache.clear()
        self._status.clear()


def authorize_tool_action(
    tool_name: str,
    operator_username: str,
    session: Session,
) -> Tuple[bool, Optional[str]]:
    if tool_name not in MUTATIVE_TOOLS:
        return True, None

    user_repo = UserRepository(session)
    user = user_repo.get_by_username(operator_username)
    if user is None:
        return False, f"Usuario '{operator_username}' no existe en el sistema."

    try:
        if tool_name == "create_ticket":
            validate_user_authorization(user, "CREATE_TICKET")
        elif tool_name == "assign_ticket":
            validate_user_authorization(user, "ASSIGN_TICKET")
        elif tool_name == "add_comment":
            validate_user_authorization(user, "ADD_COMMENT")
        return True, None
    except UnauthorizedActionError as auth_err:
        return False, str(auth_err)
    except Exception as err:
        return False, f"Fallo de autorización: {str(err)}"
