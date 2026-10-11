from dataclasses import dataclass, field
import time
from typing import Any, Dict, List, Optional
import uuid

from src.agents.v2_agent_loop.state import AgentExecutionState, ExecutionStatus, StopReason
from src.domain.planning.entities import Plan


@dataclass
class AgentV4ExecutionState(AgentExecutionState):
    """
    ExecutionState evolucionado para Agent v4 (Planning & Task Decomposition).
    Conserva todas las propiedades de v2 y v3 y agrega la correlación formal
    con el Plan y el historial inmutable de revisiones (plan_history).
    """
    run_id: str = field(default_factory=lambda: f"run_{uuid.uuid4().hex[:8]}")
    session_id: str = "sess_default"
    subject_id: str = "usr_carlos"

    # Correlación con el plan en Agent v4:
    current_plan: Optional[Plan] = None
    plan_history: List[Plan] = field(default_factory=list)

    # Razón canónica de terminación (ej. plan_completed, no_executable_steps, max_iterations_reached)
    termination_reason: Optional[str] = None
    last_observation: Optional[Dict[str, Any]] = None
    tool_calls_executed: List[str] = field(default_factory=list)

    @property
    def iteration(self) -> int:
        return self.iteration_index

    @iteration.setter
    def iteration(self, value: int) -> None:
        self.iteration_index = value

