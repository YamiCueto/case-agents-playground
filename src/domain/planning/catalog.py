"""
Catálogo Unificado de Capacidades de Software para Agent v4 (Planning & Task Decomposition).
Fuente única de verdad para herramientas autorizadas, acciones de runtime y modelos.
"""

from typing import Any, Dict, List, Optional, Set, Tuple
from pydantic import ValidationError as PydanticValidationError

from src.agents.tools.ticket_tools import (
    ARGUMENT_MODELS,
    TOOLS_SCHEMAS,
    validate_tool_arguments,
)

# 1. Catálogo unificado de herramientas (StepExecutor.TOOL)
# Integra las herramientas de MySQL tickets con las herramientas del simulador DevOps (currículo M05-L05)
REGISTERED_TICKET_TOOLS: Set[str] = set(ARGUMENT_MODELS.keys())  # get_ticket_by_id, list_tickets, create_ticket, identify_overdue_tickets

REGISTERED_DEVOPS_TOOLS: Set[str] = {
    "get_recent_incidents",
    "get_latest_deployment",
    "get_deployment_from_cache",
    "unrecoverable_legacy_call",
}

REGISTERED_ALL_TOOLS: Set[str] = REGISTERED_TICKET_TOOLS | REGISTERED_DEVOPS_TOOLS

# 2. Acciones deterministas de software local (StepExecutor.RUNTIME)
REGISTERED_RUNTIME_ACTIONS: Set[str] = {
    "correlate_incidents_with_deployment",
    "analyze_ticket_data",
    "verify_sla_compliance",
    "filter_active_tickets",
    "analyze_query",
}

# 3. Acciones de inferencia y síntesis LLM (StepExecutor.MODEL)
REGISTERED_MODEL_ACTIONS: Set[str] = {
    "synthesize_response",
    "generate_incident_recommendation",
    "synthesize_report",
    "summarize_ticket_status",
}


def is_registered_tool(action: str) -> bool:
    """Verifica si una acción está registrada como herramienta oficial ejecutable."""
    return action in REGISTERED_ALL_TOOLS


def is_registered_runtime_action(action: str) -> bool:
    """Verifica si una acción es una operación algorítmica local de software registrada."""
    return action in REGISTERED_RUNTIME_ACTIONS


def is_registered_model_action(action: str) -> bool:
    """Verifica si una acción es una inferencia o síntesis de modelo registrada."""
    return action in REGISTERED_MODEL_ACTIONS


def validate_tool_arguments_schema(action: str, arguments: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Valida los argumentos de una herramienta contra su esquema Pydantic real.
    Para herramientas DevOps sin argumentos requeridos, valida que sea un diccionario.
    """
    if action in ARGUMENT_MODELS:
        try:
            validate_tool_arguments(action, arguments or {})
            return True, None
        except PydanticValidationError as err:
            return False, f"Error de validación Pydantic: {str(err)}"
        except Exception as err:
            return False, f"Parámetros inválidos: {str(err)}"

    elif action in REGISTERED_DEVOPS_TOOLS:
        if not isinstance(arguments, dict):
            return False, "Los argumentos deben ser un objeto JSON (dict)"
        return True, None

    return False, f"Herramienta desconocida o no registrada en el catálogo: '{action}'"


def get_tools_catalog_documentation() -> str:
    """Genera la documentación formal del catálogo de herramientas para los prompts del Planner."""
    lines: List[str] = [
        "HERRAMIENTAS DISPONIBLES EN EL RUNTIME LOCAL (executor: tool):",
    ]
    for schema in TOOLS_SCHEMAS:
        name = schema["name"]
        desc = schema["description"]
        props = schema.get("parameters", {}).get("properties", {})
        required = schema.get("parameters", {}).get("required", [])
        params_str = ", ".join(f"{k} ({'requerido' if k in required else 'opcional'})" for k in props.keys())
        lines.append(f"- {name}: {desc} [Argumentos: {params_str or 'ninguno'}]")

    lines.append("\nHERRAMIENTAS DE CONFIABILIDAD / DEVOPS (executor: tool):")
    lines.append("- get_recent_incidents: Consulta incidentes críticos recientes.")
    lines.append("- get_latest_deployment: Consulta los metadatos del despliegue más reciente.")
    lines.append("- get_deployment_from_cache: Consulta metadatos de despliegue desde caché de contingencia.")

    lines.append("\nACCIONES DETERMINISTAS LOCALES (executor: runtime):")
    lines.append("- analyze_ticket_data: Analiza en software local el estado, prioridad y datos del ticket consultado.")
    lines.append("- verify_sla_compliance: Evalúa en software local el cumplimiento de SLA de tickets fuera de plazo.")
    lines.append("- filter_active_tickets: Filtra y ordena tickets en software local.")
    lines.append("- correlate_incidents_with_deployment: Cruza métricas de incidentes y despliegues en software local.")

    lines.append("\nACCIONES DE SÍNTESIS MODELO (executor: model):")
    lines.append("- synthesize_response: Sintetiza el diagnóstico, recomendaciones y plan de acción final para el usuario.")
    lines.append("- generate_incident_recommendation: Genera informe técnico y recomendación de mitigación.")

    return "\n".join(lines)
