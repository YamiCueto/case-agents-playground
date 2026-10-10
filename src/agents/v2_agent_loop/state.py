from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Any, Dict, List, Optional
import uuid


class ExecutionStatus(str, Enum):
    INITIALIZING = "initializing"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StopReason(str, Enum):
    FINAL_ANSWER = "final_answer"
    MAX_ITERATIONS_REACHED = "max_iterations_reached"
    GLOBAL_TIMEOUT = "global_timeout"
    INFERENCE_TIMEOUT = "inference_timeout"
    TOOL_TIMEOUT = "tool_timeout"
    REPETITIVE_TOOL_CALL = "repetitive_tool_call"
    FATAL_ERROR = "fatal_error"
    CLIENT_CANCELLED = "client_cancelled"


@dataclass
class ToolExecutionRecord:
    iteration_index: int
    tool_call_id: str
    tool_name: str
    arguments: Dict[str, Any]
    validated_arguments: Dict[str, Any]
    result: Dict[str, Any]
    duration_ms: float
    is_mutative: bool = False
    idempotency_hit: bool = False
    timestamp: float = field(default_factory=time.monotonic)


@dataclass
class IterationSummary:
    iteration_index: int
    duration_ms: float
    tool_calls_count: int
    had_observation: bool
    decision: str
    tools_invoked: List[str] = field(default_factory=list)


@dataclass
class AgentExecutionState:
    execution_id: str = field(default_factory=lambda: f"exec-{uuid.uuid4().hex[:12]}")
    correlation_id: str = field(default_factory=lambda: f"corr-{uuid.uuid4().hex[:10]}")
    query: str = ""
    operator_username: str = "usr_carlos"
    iteration_index: int = 0
    max_iterations: int = 5
    global_timeout_seconds: float = 60.0
    inference_timeout_seconds: float = 30.0
    tool_timeout_seconds: float = 15.0
    start_time_monotonic: float = field(default_factory=time.monotonic)
    status: ExecutionStatus = ExecutionStatus.INITIALIZING
    stop_reason: Optional[StopReason] = None
    messages: List[Dict[str, Any]] = field(default_factory=list)
    executed_tools: List[ToolExecutionRecord] = field(default_factory=list)
    iterations: List[IterationSummary] = field(default_factory=list)
    final_answer: Optional[str] = None
    total_duration_ms: float = 0.0
    error_message: Optional[str] = None

    def elapsed_seconds(self) -> float:
        return time.monotonic() - self.start_time_monotonic

    def is_global_timeout(self) -> bool:
        return self.elapsed_seconds() >= self.global_timeout_seconds

    def remaining_global_seconds(self) -> float:
        remaining = self.global_timeout_seconds - self.elapsed_seconds()
        return max(0.0, remaining)

    def record_tool_execution(self, record: ToolExecutionRecord) -> None:
        self.executed_tools.append(record)

    def record_iteration(self, summary: IterationSummary) -> None:
        self.iterations.append(summary)
        self.total_duration_ms += summary.duration_ms
