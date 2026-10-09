from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field, ValidationError as PydanticValidationError
from sqlalchemy.orm import Session
from src.agents.common.contracts import ToolCall
from src.application.ticket_service import TicketService
from src.application.dtos import CreateTicketDTO
from src.domain.enums import Priority
from src.domain.exceptions import EntityNotFoundError, UnauthorizedActionError, ValidationError as DomainValidationError


class GetTicketArgs(BaseModel):
    ticket_code: str = Field(description="Código del ticket en formato TICK-XXXX")


class ListTicketsArgs(BaseModel):
    status: Optional[str] = Field(default=None, description="Estado del ticket: OPEN, IN_PROGRESS, RESOLVED, CLOSED")
    priority: Optional[str] = Field(default=None, description="Prioridad del ticket: LOW, MEDIUM, HIGH, CRITICAL")
    category_code: Optional[str] = Field(default=None, description="Código de categoría técnica")
    limit: Optional[int] = Field(default=10, description="Límite máximo de tickets a retornar")


class CreateTicketArgs(BaseModel):
    title: str = Field(description="Título breve y conciso del incidente")
    description: str = Field(description="Descripción técnica detallada del problema o solicitud")
    priority: str = Field(default="MEDIUM", description="Nivel de prioridad: LOW, MEDIUM, HIGH, CRITICAL")
    category_code: str = Field(description="Código de categoría: HARDWARE, SOFTWARE, NETWORK, ACCESS, GENERAL")


class IdentifyOverdueArgs(BaseModel):
    pass


ARGUMENT_MODELS: Dict[str, Any] = {
    "get_ticket_by_id": GetTicketArgs,
    "list_tickets": ListTicketsArgs,
    "create_ticket": CreateTicketArgs,
    "identify_overdue_tickets": IdentifyOverdueArgs,
}

TOOLS_SCHEMAS: List[Dict[str, Any]] = [
    {
        "name": "get_ticket_by_id",
        "description": "Consulta los detalles completos de un ticket de soporte técnico a partir de su código identificador alfanumérico (ejemplo: TICK-1001).",
        "parameters": {
            "type": "object",
            "properties": {
                "ticket_code": {
                    "type": "string",
                    "description": "Código alfanumérico del ticket a consultar (ejemplo: TICK-1001)",
                }
            },
            "required": ["ticket_code"],
        },
    },
    {
        "name": "list_tickets",
        "description": "Lista los tickets registrados en el sistema de gestión, permitiendo filtrar opcionalmente por estado, prioridad o categoría.",
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filtro por estado: OPEN, IN_PROGRESS, RESOLVED, CLOSED",
                    "enum": ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
                },
                "priority": {
                    "type": "string",
                    "description": "Filtro por prioridad: LOW, MEDIUM, HIGH, CRITICAL",
                    "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                },
                "category_code": {
                    "type": "string",
                    "description": "Código de categoría técnica: HARDWARE, SOFTWARE, NETWORK, ACCESS, GENERAL",
                },
                "limit": {
                    "type": "integer",
                    "description": "Cantidad máxima de resultados a retornar (por defecto 10)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "create_ticket",
        "description": "Crea un nuevo ticket de soporte técnico en el sistema con título, descripción, prioridad y categoría.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Título o asunto descriptivo del incidente",
                },
                "description": {
                    "type": "string",
                    "description": "Detalle técnico o descripción del problema reportado",
                },
                "priority": {
                    "type": "string",
                    "description": "Nivel de prioridad: LOW, MEDIUM, HIGH, CRITICAL",
                    "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                },
                "category_code": {
                    "type": "string",
                    "description": "Categoría técnica: HARDWARE, SOFTWARE, NETWORK, ACCESS, GENERAL",
                },
            },
            "required": ["title", "description", "priority", "category_code"],
        },
    },
    {
        "name": "identify_overdue_tickets",
        "description": "Identifica y consulta los tickets cuyo Acuerdo de Nivel de Servicio (SLA) se encuentra vencido o fuera del plazo establecido.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


def validate_tool_arguments(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if tool_name not in ARGUMENT_MODELS:
        raise ValueError(f"Herramienta '{tool_name}' no reconocida para validación.")
    model_cls = ARGUMENT_MODELS[tool_name]
    validated = model_cls.model_validate(arguments)
    return validated.model_dump()


def execute_tool_call(
    tool_call: ToolCall,
    session: Session,
    operator_username: str,
) -> Dict[str, Any]:
    func_name = tool_call.name
    if func_name not in ARGUMENT_MODELS:
        return {
            "status": "error",
            "error_type": "herramienta_no_encontrada",
            "message": f"La herramienta '{func_name}' no está registrada en el runtime local de Python.",
        }

    try:
        validated_args = validate_tool_arguments(func_name, tool_call.arguments)
    except PydanticValidationError as err:
        return {
            "status": "error",
            "error_type": "parametros_invalidos",
            "message": f"Validación de tipos falló en Pydantic: {str(err)}",
        }
    except Exception as err:
        return {
            "status": "error",
            "error_type": "error_validacion",
            "message": str(err),
        }

    service = TicketService(session)

    try:
        if func_name == "get_ticket_by_id":
            ticket = service.get_ticket(
                ticket_code=validated_args["ticket_code"],
                viewer_username=operator_username,
            )
            return {
                "status": "success",
                "tool_name": func_name,
                "data": ticket.model_dump(),
            }

        elif func_name == "list_tickets":
            tickets = service.list_tickets(
                viewer_username=operator_username,
                status=validated_args.get("status"),
                priority=validated_args.get("priority"),
                category_code=validated_args.get("category_code"),
                limit=validated_args.get("limit") or 10,
            )
            return {
                "status": "success",
                "tool_name": func_name,
                "count": len(tickets),
                "data": [t.model_dump() for t in tickets],
            }

        elif func_name == "create_ticket":
            priority_enum = Priority[validated_args["priority"].upper()]
            dto = CreateTicketDTO(
                title=validated_args["title"],
                description=validated_args["description"],
                priority=priority_enum,
                category_code=validated_args["category_code"].upper(),
                creator_username=operator_username,
            )
            created = service.create_ticket(dto)
            return {
                "status": "success",
                "tool_name": func_name,
                "data": created.model_dump(),
            }

        elif func_name == "identify_overdue_tickets":
            overdue_tickets = service.identify_overdue_tickets(viewer_username=operator_username)
            return {
                "status": "success",
                "tool_name": func_name,
                "count": len(overdue_tickets),
                "data": [t.model_dump() for t in overdue_tickets],
            }

        else:
            return {
                "status": "error",
                "error_type": "herramienta_no_soportada",
                "message": f"La herramienta '{func_name}' no tiene un ejecutor en TicketService.",
            }

    except EntityNotFoundError as err:
        return {
            "status": "error",
            "error_type": "entidad_no_encontrada",
            "message": str(err),
        }
    except UnauthorizedActionError as err:
        return {
            "status": "error",
            "error_type": "accion_no_autorizada",
            "message": str(err),
        }
    except DomainValidationError as err:
        return {
            "status": "error",
            "error_type": "validacion_de_dominio",
            "message": str(err),
        }
    except Exception as err:
        return {
            "status": "error",
            "error_type": "excepcion_runtime",
            "message": f"Error no controlado en tiempo de ejecución: {str(err)}",
        }
