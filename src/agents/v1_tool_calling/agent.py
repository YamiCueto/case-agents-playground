import json
import sys
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelProvider, ModelResponse, ToolCall
from src.agents.common.providers import OpenAICompatibleProvider
from src.agents.tools.ticket_tools import (
    TOOLS_SCHEMAS,
    execute_tool_call,
    validate_tool_arguments,
)
from src.infrastructure.database.connection import get_app_session_factory
from src.api.schemas import ChatRequest, StreamEvent

SYSTEM_PROMPT = (
    "Eres el Asistente de Gestión de Tickets de Soporte Técnico (Agent v1) en el Agent Engineering Playground. "
    "Tu función es responder consultas de usuarios sobre tickets de soporte de forma veraz, natural y profesional en español.\n\n"
    "Reglas de respuesta y fidelidad:\n"
    "1. Veracidad estricta: Basa todas tus afirmaciones exclusivamente en los datos reales devueltos por las herramientas. "
    "Está terminantemente prohibido inventar comentarios, fechas, personas, acciones o estados que no figuren en los datos observados.\n"
    "2. Calidad comunicativa: Redacta siempre respuestas completas y fluidas en español, evitando monosílabos, palabras sueltas o respuestas telegráficas aisladas (como responder únicamente 'OPEN').\n"
    "3. Claridad en estados técnicos: Cuando menciones el estado de un ticket, acompáñalo de su traducción o significado amigable en español preservando el código original, por ejemplo: OPEN (Abierto), IN_PROGRESS (En progreso), RESOLVED (Resuelto), CLOSED (Cerrado).\n"
    "4. Extensión adaptativa: Adapta la extensión al requerimiento. Para preguntas puntuales sobre un dato específico (como el estado o la prioridad), responde con una oración clara y directa. Cuando se soliciten detalles completos o un resumen amplio, presenta la información de forma estructurada con sus campos principales.\n"
    "5. Consultas conceptuales: Si la pregunta no requiere consultar datos del sistema, responde directamente de forma pedagógica y clara sin invocar herramientas."
)


def run_agent_v1(
    user_query: str,
    provider: ModelProvider,
    session: Session,
    operator_username: str = "usr_carlos",
) -> str:
    print("=" * 60, flush=True)
    print("HOPS DE EJECUCION — AGENT V1", flush=True)
    print("=" * 60, flush=True)

    print(f"[HOP 1 - USER] Consulta: '{user_query}' | Persona: {operator_username}", flush=True)
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_query},
    ]

    print("[HOP 2 - MODEL] Enviando mensajes y Tool Schemas al proveedor...", flush=True)
    first_response = provider.generate(messages=messages, tools=TOOLS_SCHEMAS)

    if not first_response.tool_calls:
        print("[HOP 3 - NO TOOL] El modelo resolvio la consulta sin solicitar herramientas.", flush=True)
        print(f"[HOP 7 - MODEL RESPONSE] Respuesta directa:\n{first_response.content}\n", flush=True)
        return first_response.content or ""

    tool_call = first_response.tool_calls[0]
    print(f"[HOP 3 - TOOL SELECTED] Herramienta propuesta: {tool_call.name}", flush=True)
    print(f"[HOP 4 - ARGUMENTS] Argumentos generados: {json.dumps(tool_call.arguments, ensure_ascii=False)}", flush=True)

    try:
        validated_args = validate_tool_arguments(tool_call.name, tool_call.arguments)
        print(f"         Validación Pydantic: EXITOSA -> {json.dumps(validated_args, ensure_ascii=False)}", flush=True)
    except Exception as validation_err:
        print(f"         Validación Pydantic: RECHAZADA -> {str(validation_err)}", flush=True)

    print("[HOP 5 - PYTHON EXECUTION] La respuesta del modelo concluyo solicitando una tool.", flush=True)
    print("         El runtime en CPU ejecuta la funcion real en TicketService...", flush=True)
    execution_result = execute_tool_call(tool_call, session, operator_username)
    print(f"         Resultado producido por Python: {json.dumps(execution_result, ensure_ascii=False)}", flush=True)

    print("[HOP 6 - TOOL RESULT] Inyectando observacion con role 'tool' en el historial...", flush=True)
    messages.append({
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": tool_call.id,
                "type": "function",
                "function": {
                    "name": tool_call.name,
                    "arguments": json.dumps(tool_call.arguments, ensure_ascii=False),
                },
            }
        ],
    })
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "name": tool_call.name,
        "content": json.dumps(execution_result, ensure_ascii=False),
    })

    print("[HOP 7 - MODEL RESPONSE] Realizando segunda llamada explicita para sintesis final...", flush=True)
    second_response = provider.generate(messages=messages, tools=TOOLS_SCHEMAS)
    print(f"         Respuesta final sintetizada:\n{second_response.content}\n", flush=True)

    return second_response.content or ""


async def run_agent_v1_stream(
    request: ChatRequest,
    provider: Optional[ModelProvider] = None,
) -> AsyncGenerator[StreamEvent, None]:
    if provider is None:
        provider = OpenAICompatibleProvider()

    operator_username = request.user_persona or "usr_carlos"

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        hop_number=1,
        hop_title="HOP 1 - USER REQUEST",
        type="USER_REQUEST",
        payload={
            "query": request.query,
            "persona": operator_username,
            "mode": "lab_simulation",
        },
    )

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        hop_number=2,
        hop_title="HOP 2 - MODEL INFERENCE 1",
        type="MODEL_INFERENCE_1",
        payload={
            "provider_type": type(provider).__name__,
            "model_name": getattr(provider, "model_name", "qwen_local"),
            "tools_registered_count": len(TOOLS_SCHEMAS),
            "tools_schemas": [t["name"] for t in TOOLS_SCHEMAS],
            "status": "sent_to_llm",
        },
    )

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.query},
    ]

    first_response = provider.generate(messages=messages, tools=TOOLS_SCHEMAS)

    if not first_response.tool_calls:
        direct_text = first_response.content or "Consulta resuelta sin requerir herramientas."
        yield StreamEvent(
            event_id=f"evt-{uuid.uuid4().hex[:10]}",
            agent_version="v1",
            hop_number=3,
            hop_title="HOP 3 - DIRECT ANSWER",
            type="DIRECT_ANSWER",
            payload={
                "decision": "no_tool_required",
                "reason": "La consulta fue resuelta directamente por el modelo de lenguaje.",
                "content": direct_text,
                "message": direct_text,
                "response_preview": direct_text,
            },
        )

        yield StreamEvent(
            event_id=f"evt-{uuid.uuid4().hex[:10]}",
            agent_version="v1",
            hop_number=7,
            hop_title="HOP 7 - FINAL SYNTHESIS",
            type="FINAL_SYNTHESIS",
            payload={
                "source": "qwen_direct_answer",
                "answer": direct_text,
                "content": direct_text,
                "message": direct_text,
            },
        )

        yield StreamEvent(
            event_id=f"evt-{uuid.uuid4().hex[:10]}",
            agent_version="v1",
            type="RUN_COMPLETED",
            payload={
                "status": "completed",
                "total_hops": 2,
                "tools_executed": 0,
            },
        )
        return

    tool_call = first_response.tool_calls[0]

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        hop_number=3,
        hop_title="HOP 3 - TOOL PROPOSAL",
        type="TOOL_PROPOSAL",
        payload={
            "model_decision": "tool_call_requested",
            "tool_name": tool_call.name,
            "tool_call_id": tool_call.id,
            "arguments": tool_call.arguments,
            "source": "qwen_llm_inference",
        },
    )

    validated_args: Dict[str, Any] = {}
    is_valid = True
    validation_error_msg = ""
    try:
        validated_args = validate_tool_arguments(tool_call.name, tool_call.arguments)
    except Exception as val_err:
        is_valid = False
        validation_error_msg = str(val_err)

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        hop_number=4,
        hop_title="HOP 4 - ARGUMENT VALIDATION",
        type="ARGUMENT_VALIDATION",
        payload={
            "validator": "Pydantic",
            "tool_name": tool_call.name,
            "is_valid": is_valid,
            "validated_arguments": validated_args if is_valid else {},
            "validation_error": validation_error_msg if not is_valid else None,
            "source": "python_pydantic_validation",
        },
    )

    session_factory = get_app_session_factory()
    session = session_factory()
    try:
        execution_result = execute_tool_call(tool_call, session, operator_username)
    finally:
        session.close()

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        hop_number=5,
        hop_title="HOP 5 - CPU TOOL EXECUTION",
        type="CPU_TOOL_EXECUTION",
        payload={
            "executor": "TicketService (Python CPU Runtime)",
            "database": "MySQL",
            "operator": operator_username,
            "execution_status": execution_result.get("status"),
            "result": execution_result,
            "source": "python_cpu_runtime",
        },
    )

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        hop_number=6,
        hop_title="HOP 6 - TOOL RESULT INJECTION",
        type="TOOL_RESULT_INJECTION",
        payload={
            "role": "tool",
            "tool_call_id": tool_call.id,
            "name": tool_call.name,
            "content_preview": execution_result,
            "source": "runtime_context_injection",
        },
    )

    messages.append({
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": tool_call.id,
                "type": "function",
                "function": {
                    "name": tool_call.name,
                    "arguments": json.dumps(tool_call.arguments, ensure_ascii=False),
                },
            }
        ],
    })
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "name": tool_call.name,
        "content": json.dumps(execution_result, ensure_ascii=False),
    })

    second_response = provider.generate(messages=messages, tools=TOOLS_SCHEMAS)
    final_text = second_response.content or "Ejecución completada por el sistema."

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        hop_number=7,
        hop_title="HOP 7 - FINAL SYNTHESIS",
        type="FINAL_SYNTHESIS",
        payload={
            "source": "qwen_llm_synthesis",
            "answer": final_text,
            "content": final_text,
            "message": final_text,
        },
    )

    yield StreamEvent(
        event_id=f"evt-{uuid.uuid4().hex[:10]}",
        agent_version="v1",
        type="RUN_COMPLETED",
        payload={
            "status": "completed",
            "total_hops": 7,
            "tools_executed": 1,
        },
    )
