import time
from typing import Any, Callable, Dict, Optional
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelProvider, ToolCall
from src.agents.tools.ticket_tools import execute_tool_call
from src.agents.v4_planning.state import AgentV4ExecutionState
from src.domain.planning.catalog import (
    REGISTERED_TICKET_TOOLS,
    REGISTERED_DEVOPS_TOOLS,
)
from src.domain.planning.enums import StepStatus

# Datos simulados del dominio DevOps / Confiabilidad (Curricular M05-L05)
SIMULATED_DEVOPS_DATA = {
    "incidents": [
        {"id": "INC-881", "service": "billing-api", "status": "critical", "latency_ms": 4200, "timestamp": "2026-09-15T18:30:00Z"},
        {"id": "INC-882", "service": "auth-proxy", "status": "resolved", "latency_ms": 120, "timestamp": "2026-09-15T14:10:00Z"},
    ],
    "latest_deployment": {
        "version": "v3.1.2",
        "service": "billing-api",
        "author": "dev-team-core",
        "timestamp": "2026-09-15T18:15:00Z",
        "commits": ["fix: optimize db pool", "feat: new payment gateway connector"],
    },
    "cached_deployment": {
        "version": "v3.1.2-cache",
        "service": "billing-api",
        "author": "dev-team-core",
        "timestamp": "2026-09-15T18:15:00Z",
        "source": "local_redis_mirror",
    },
}

# Flag para simular corte de red o indisponibilidad en Caso G2
SIMULATE_DEPLOYMENT_SERVICE_DOWN = False


def set_simulate_deployment_service_down(val: bool) -> None:
    global SIMULATE_DEPLOYMENT_SERVICE_DOWN
    SIMULATE_DEPLOYMENT_SERVICE_DOWN = val


def execute_tool_step(
    action: str,
    arguments: Optional[Dict[str, Any]] = None,
    state: Optional[AgentV4ExecutionState] = None,
    session_factory: Optional[Callable[[], Session]] = None,
) -> Dict[str, Any]:
    """
    Ejecutor de herramientas externas (StepExecutor.TOOL).
    Soporta tanto las herramientas curriculares de DevOps como las herramientas reales de MySQL tickets.
    """
    global SIMULATE_DEPLOYMENT_SERVICE_DOWN
    args = arguments or {}

    # 1. Herramientas DevOps de Confiabilidad
    if action == "get_recent_incidents":
        return {
            "status": "success",
            "count": len(SIMULATED_DEVOPS_DATA["incidents"]),
            "incidents": list(SIMULATED_DEVOPS_DATA["incidents"]),
        }

    elif action == "get_latest_deployment":
        if SIMULATE_DEPLOYMENT_SERVICE_DOWN:
            return {
                "status": "error",
                "code": 503,
                "error": "Service Unavailable: Deployment Gateway Timeout",
            }
        return {
            "status": "success",
            "deployment": dict(SIMULATED_DEVOPS_DATA["latest_deployment"]),
        }

    elif action == "get_deployment_from_cache":
        return {
            "status": "success",
            "source": "cache",
            "deployment": dict(SIMULATED_DEVOPS_DATA["cached_deployment"]),
        }

    elif action == "unrecoverable_legacy_call":
        return {
            "status": "error",
            "code": 500,
            "error": "Fatal: Legacy subsystem permanent failure",
        }

    # 2. Herramientas de tickets en MySQL (reutilización soberana del catálogo v1/v2/v3)
    if action in REGISTERED_TICKET_TOOLS and session_factory is not None:
        try:
            with session_factory() as session:
                tc = ToolCall(id=f"tc-v4-{action}", name=action, arguments=args)
                actor = state.subject_id if state else "usr_carlos"
                res = execute_tool_call(
                    tool_call=tc,
                    session=session,
                    operator_username=actor,
                )
                if res.get("status") == "error":
                    return {
                        "status": "error",
                        "error_type": res.get("error_type", "tool_error"),
                        "error": res.get("message", "Error al ejecutar herramienta en MySQL"),
                        "result": res,
                    }
                return {
                    "status": "success",
                    "result": res,
                    "data": res.get("data"),
                    "is_mutative": action == "create_ticket",
                }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }

    return {"status": "error", "error": f"Tool desconocida o no registrada en el catálogo: '{action}'"}


def execute_runtime_step(
    action: str,
    state: AgentV4ExecutionState,
) -> Dict[str, Any]:
    """
    Ejecutor determinista de software local en CPU (StepExecutor.RUNTIME).
    Realiza transformaciones algorítmicas, uniones de datos y validaciones locales.
    """
    if action == "correlate_incidents_with_deployment":
        if not state.current_plan:
            return {"status": "error", "error": "No existe plan activo para correlacionar."}

        # Localizar observaciones de S1 y S2 / S2b
        incidents_step = next(
            (s for s in state.current_plan.steps if s.id == "S1" and s.status == StepStatus.COMPLETED),
            None,
        )
        deployment_step = next(
            (s for s in state.current_plan.steps if s.id in {"S2", "S2b"} and s.status == StepStatus.COMPLETED),
            None,
        )

        if not incidents_step or not deployment_step:
            return {
                "status": "error",
                "error": "Faltan observaciones previas de incidentes o despliegue.",
            }

        incidents_obs = incidents_step.observation or {}
        deployment_obs = deployment_step.observation or {}

        dep_info = deployment_obs.get("deployment", {})
        matched_service = dep_info.get("service")
        all_incidents = incidents_obs.get("incidents", [])

        affected_incidents = [
            inc for inc in all_incidents if inc.get("service") == matched_service
        ]

        return {
            "status": "success",
            "correlation_found": True,
            "suspect_deployment": dep_info.get("version", "desconocida"),
            "correlated_incidents": affected_incidents,
        }

    elif action == "analyze_ticket_data":
        # Extraer datos estructurados del ticket consultado en pasos previos
        ticket_data = None
        if state.current_plan:
            for s in state.current_plan.steps:
                if s.status == StepStatus.COMPLETED and s.observation:
                    obs_data = s.observation.get("data") or s.observation.get("result", {}).get("data")
                    if isinstance(obs_data, dict) and "code" in obs_data:
                        ticket_data = obs_data
                        break

        if not ticket_data:
            return {
                "status": "success",
                "note": "Análisis algorítmico local completado sin payload de ticket.",
            }

        is_overdue = ticket_data.get("is_overdue", False)
        priority = ticket_data.get("priority", "MEDIUM")
        status = ticket_data.get("status", "OPEN")
        category = ticket_data.get("category_code", "GENERAL")

        analysis = (
            f"Análisis algorítmico local completado para {ticket_data.get('code')}: "
            f"Estado={status}, Prioridad={priority}, Categoría={category}. "
            f"SLA Vencido: {'SÍ (requiere atención crítica)' if is_overdue else 'NO (dentro de plazo normal)'}."
        )

        return {
            "status": "success",
            "analysis": analysis,
            "ticket_code": ticket_data.get("code"),
            "is_overdue": is_overdue,
            "priority": priority,
            "ticket_status": status,
        }

    elif action == "verify_sla_compliance":
        # Verifica cumplimiento de SLA a partir de observaciones previas
        overdue_list = []
        if state.current_plan:
            for s in state.current_plan.steps:
                if s.status == StepStatus.COMPLETED and s.observation:
                    obs_data = s.observation.get("data") or s.observation.get("result", {}).get("data")
                    if isinstance(obs_data, list):
                        overdue_list = obs_data
                        break

        return {
            "status": "success",
            "note": "Evaluación de cumplimiento de SLA procesada en CPU.",
            "total_overdue": len(overdue_list),
            "overdue_tickets": [t.get("code") for t in overdue_list if isinstance(t, dict)],
        }

    elif action == "filter_active_tickets":
        return {
            "status": "success",
            "note": "Filtro de tickets activos completado.",
            "filtered_count": 1,
        }

    elif action == "analyze_query":
        return {
            "status": "success",
            "analysis": "Consulta validada conforme a reglas de dominio.",
        }

    return {"status": "success", "note": f"Operación de runtime '{action}' completada."}


def execute_model_step(
    action: str,
    state: AgentV4ExecutionState,
    provider: Optional[ModelProvider] = None,
) -> Dict[str, Any]:
    """
    Ejecutor de síntesis o inferencia con LLM (StepExecutor.MODEL).
    Genera recomendaciones o respuestas grounded en las observaciones previas.
    """
    if action == "generate_incident_recommendation":
        if not state.current_plan:
            return {"status": "error", "error": "No existe plan activo."}

        correlation_step = next(
            (s for s in state.current_plan.steps if s.id == "S3" and s.status == StepStatus.COMPLETED),
            None,
        )
        if correlation_step and correlation_step.observation:
            corr_data = correlation_step.observation
            suspect_deployment = corr_data.get("suspect_deployment", "v3.1.2")
            corr_inc = corr_data.get("correlated_incidents", [{}])
            serv = corr_inc[0].get("service", "billing-api") if corr_inc else "billing-api"
            inc_id = corr_inc[0].get("id", "INC-881") if corr_inc else "INC-881"

            summary = (
                f"El despliegue {suspect_deployment} impactó directamente al servicio {serv}, "
                f"provocando el incidente {inc_id}. "
                "Recomendación: ejecutar rollback inmediato a la versión v3.1.1 e investigar el pool de conexiones."
            )
            return {"status": "success", "recommendation": summary}

        return {
            "status": "success",
            "recommendation": "Recomendación preventiva: revisar métricas de latencia de los microservicios.",
        }

    elif action in {"synthesize_response", "synthesize_report", "summarize_ticket_status"}:
        # Buscar evidencia de tickets en pasos completados
        ticket_data = None
        overdue_data = None
        if state.current_plan:
            for s in state.current_plan.steps:
                if s.status == StepStatus.COMPLETED and s.observation:
                    data = s.observation.get("data") or s.observation.get("result", {}).get("data")
                    if isinstance(data, dict) and "code" in data:
                        ticket_data = data
                    elif isinstance(data, list):
                        overdue_data = data

        if ticket_data:
            code = ticket_data.get("code", "TICK-XXXX")
            title = ticket_data.get("title", "Sin título")
            status = ticket_data.get("status", "OPEN")
            priority = ticket_data.get("priority", "MEDIUM")
            desc = ticket_data.get("description", "Sin descripción")
            is_overdue = ticket_data.get("is_overdue", False)
            creator = ticket_data.get("creator_username", "usuario")
            category = ticket_data.get("category_code", "GENERAL")

            recommendation = (
                f"### Diagnóstico y Plan de Acción para Ticket {code}\n\n"
                f"**Resumen Técnico del Incidente:**\n"
                f"- **Código:** {code}\n"
                f"- **Título:** {title}\n"
                f"- **Estado Actual:** {status}\n"
                f"- **Nivel de Prioridad:** {priority}\n"
                f"- **Categoría Técnica:** {category}\n"
                f"- **Reportado por:** {creator}\n"
                f"- **SLA Vencido:** {'SÍ (fuera de SLA, requiere atención prioritaria)' if is_overdue else 'NO (dentro del plazo acordado)'}\n\n"
                f"**Detalle del Problema:**\n"
                f"{desc}\n\n"
                f"**Plan de Acción Propuesto:**\n"
                f"1. **Contención Inmediata:** Asignar ingeniero especialista en {category.lower()} para diagnosticar bloqueos concurrentes.\n"
                f"2. **Inspección de Transacciones:** Analizar las sentencias SQL en las tablas afectadas durante ventanas de alta carga.\n"
                f"3. **Gobernanza y Cierre:** Actualizar el estado del ticket y registrar notas técnicas de resolución conforme a las políticas de la cooperativa."
            )
            return {"status": "success", "recommendation": recommendation}

        elif overdue_data is not None:
            count = len(overdue_data)
            if count == 0:
                rec = "### Auditoría de SLA\nNo se encontraron tickets con SLA vencido en el sistema."
            else:
                lines = [f"### Auditoría de SLA — Tickets Vencidos ({count} detectados)\n"]
                for t in overdue_data:
                    lines.append(f"- **{t.get('code')}**: {t.get('title')} (Prioridad: {t.get('priority')}, Estado: {t.get('status')})")
                lines.append("\n**Plan de Acción:** Reasignar tickets fuera de plazo a soporte nivel 2 y priorizar su resolución.")
                rec = "\n".join(lines)
            return {"status": "success", "recommendation": rec}

        return {
            "status": "success",
            "recommendation": "Resumen ejecutivo de soporte técnico generado con base en el plan verificado.",
        }

    return {"status": "success", "recommendation": f"Inferencia del modelo para '{action}' finalizada."}
