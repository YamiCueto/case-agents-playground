import json
from typing import List, Optional, Tuple
from src.agents.common.contracts import ToolCall


def compute_action_signature(tool_calls: List[ToolCall]) -> Tuple[Tuple[str, str], ...]:
    return tuple(
        (tc.name, json.dumps(tc.arguments, sort_keys=True, ensure_ascii=False))
        for tc in tool_calls
    )


def check_stagnation(
    current_sig: Tuple[Tuple[str, str], ...],
    previous_sig: Optional[Tuple[Tuple[str, str], ...]],
    repetition_count: int,
    has_mutative: bool,
) -> Tuple[bool, int]:
    if previous_sig is not None and current_sig == previous_sig:
        new_count = repetition_count + 1
        max_allowed = 1 if has_mutative else 0
        return (new_count > max_allowed), new_count
    return False, 0
