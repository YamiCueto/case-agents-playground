from typing import Dict, List, Set, Optional
from src.domain.planning.entities import Plan
from src.domain.planning.enums import StepExecutor
from src.domain.planning.catalog import (
    is_registered_tool,
    is_registered_runtime_action,
    is_registered_model_action,
    validate_tool_arguments_schema,
)


class PlanValidationError(Exception):
    """Excepción para errores estructurales y semánticos detectados durante validation-time antes de ejecutar."""
    pass


class PlanValidator:
    """
    Gobernanza del runtime sobre la integridad estructural y semántica del plan ANTES de ejecutar.

    Separa explícitamente:
    A. VALIDATION-TIME FAILURE: 
       - Estructural: Meta vacía, pasos sin id, ids duplicados, dependencias inexistentes, auto-dependencias y ciclos estáticos.
       - Semántica de capacidades: Herramienta desconocida (unknown_tool), argumentos incompatibles con esquema Pydantic
         (invalid_tool_arguments), operaciones de software no autorizadas (unknown_runtime_action) o rutas de modelo inválidas (unknown_model_action).
       Si falla, levanta PlanValidationError y el plan NO entra al runtime ni emite PLAN_VALIDATED.
    B. RUNTIME STALL: Estancamiento durante la ejecución porque un paso falló
       sin ruta de replanning y los pasos pendientes no pueden ejecutarse por dependencias no satisfechas.
    """

    @staticmethod
    def validate(plan: Plan, check_capabilities: bool = True) -> None:
        if not plan.goal or not plan.goal.strip():
            raise PlanValidationError("El plan carece de una meta ('goal') definida.")

        if not plan.steps:
            raise PlanValidationError("El plan debe contener al menos un paso.")

        step_ids: Set[str] = set()
        for step in plan.steps:
            if not step.id or not step.id.strip():
                raise PlanValidationError("Existe un paso sin identificador unívoco ('id').")

            if step.id in step_ids:
                raise PlanValidationError(f"Identificador de paso duplicado: '{step.id}'.")
            step_ids.add(step.id)

        # Validación de dependencias existentes y auto-dependencias
        for step in plan.steps:
            for dep in step.depends_on:
                if dep == step.id:
                    raise PlanValidationError(f"Paso '{step.id}' tiene auto-dependencia consigo mismo.")
                if dep not in step_ids:
                    raise PlanValidationError(
                        f"Paso '{step.id}' depende de un paso inexistente: '{dep}'."
                    )

        # Detección estática de ciclos (Validation-Time failure)
        # 0: unvisited, 1: visiting (en la rama de recursión actual), 2: visited (completamente procesado)
        visited: Dict[str, int] = {}
        adj: Dict[str, List[str]] = {s.id: list(s.depends_on) for s in plan.steps}

        def has_cycle(node: str) -> bool:
            visited[node] = 1
            for neighbor in adj.get(node, []):
                if visited.get(neighbor, 0) == 1:
                    return True
                if visited.get(neighbor, 0) == 0:
                    if has_cycle(neighbor):
                        return True
            visited[node] = 2
            return False

        for s in plan.steps:
            if visited.get(s.id, 0) == 0:
                if has_cycle(s.id):
                    raise PlanValidationError(
                        f"Ciclo estático detectado en la estructura del plan que involucra a '{s.id}'."
                    )

        # Validación semántica previa de capacidades del runtime
        if check_capabilities:
            for step in plan.steps:
                action = (step.action or "").strip()
                if not action:
                    raise PlanValidationError(f"Paso '{step.id}' carece de una acción ('action') definida.")

                if step.executor == StepExecutor.TOOL:
                    if not is_registered_tool(action):
                        raise PlanValidationError(
                            f"unknown_tool: La herramienta '{action}' no está registrada en el catálogo oficial del runtime."
                        )
                    is_valid_args, err_reason = validate_tool_arguments_schema(action, step.arguments)
                    if not is_valid_args:
                        raise PlanValidationError(
                            f"invalid_tool_arguments: Argumentos inválidos para la herramienta '{action}': {err_reason}"
                        )

                elif step.executor == StepExecutor.RUNTIME:
                    if not is_registered_runtime_action(action):
                        raise PlanValidationError(
                            f"unknown_runtime_action: La operación algorítmica '{action}' no está registrada en el runtime local."
                        )

                elif step.executor == StepExecutor.MODEL:
                    if not is_registered_model_action(action):
                        raise PlanValidationError(
                            f"unknown_model_action: La acción de síntesis '{action}' no está registrada en el catálogo de modelos."
                        )
