import copy
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from src.domain.planning.enums import StepExecutor, StepStatus


@dataclass
class PlanStep:
    id: str
    action: str
    description: str
    executor: StepExecutor = StepExecutor.TOOL
    status: StepStatus = StepStatus.PENDING
    depends_on: List[str] = field(default_factory=list)
    arguments: Dict[str, Any] = field(default_factory=dict)
    observation: Optional[Dict[str, Any]] = None
    required: bool = True               # Si es crítico para satisfacer el objetivo
    skip_reason: Optional[str] = None   # Motivo explícito autorizado por runtime/replanning

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "action": self.action,
            "description": self.description,
            "executor": self.executor.value if isinstance(self.executor, StepExecutor) else str(self.executor),
            "status": self.status.value if isinstance(self.status, StepStatus) else str(self.status),
            "depends_on": list(self.depends_on),
            "arguments": dict(self.arguments) if self.arguments else {},
            "observation": self.observation,
            "required": self.required,
            "skip_reason": self.skip_reason,
        }


@dataclass
class Plan:
    goal: str
    steps: List[PlanStep]
    current_step_id: Optional[str] = None
    revision: int = 1

    @property
    def is_completed(self) -> bool:
        """
        Completitud derivada: el plan termina cuando todos sus pasos están resueltos.
        Semántica estricta de SKIPPED: un paso omitido solo cuenta como
        resuelto si su omisión fue autorizada por el runtime (no es required
        o cuenta con un skip_reason formal asignado por replanning).
        Evita discrepancias de dos fuentes de verdad y asegura que steps
        críticos no se omitan silenciosamente.
        """
        if not self.steps:
            return False
        for s in self.steps:
            if s.status == StepStatus.COMPLETED:
                continue
            elif s.status == StepStatus.SKIPPED:
                if s.required and not s.skip_reason:
                    return False
            else:
                return False
        return True

    def clone(self) -> "Plan":
        """
        Crea un snapshot profundo e independiente del estado actual del Plan.
        Los snapshots archivados en plan_history no se vuelven a mutar por ejecución normal.
        """
        return copy.deepcopy(self)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "goal": self.goal,
            "current_step_id": self.current_step_id,
            "revision": self.revision,
            "is_completed": self.is_completed,
            "steps": [s.to_dict() for s in self.steps],
        }
