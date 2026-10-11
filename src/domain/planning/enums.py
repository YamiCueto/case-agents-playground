from enum import Enum


class StepStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"  # Paso omitido justificadamente (ej. rama alternativa o sustitución en replanning)


class StepExecutor(str, Enum):
    TOOL = "tool"        # Invoca una función externa registrada en el catálogo de herramientas
    RUNTIME = "runtime"  # Transformación o cruce algorítmico determinista local en CPU
    MODEL = "model"      # Inferencia o síntesis textual generada mediante el proveedor LLM
