import asyncio
import concurrent.futures
from typing import Any, Callable, Dict, List, Optional, Tuple
from src.agents.common.contracts import ModelProvider, ModelResponse
from src.agents.tools.ticket_tools import TOOLS_SCHEMAS

SYSTEM_PROMPT_V2 = (
    "Eres el Asistente Experto en Gestión de Incidentes y Soporte Técnico (Agent v2) en el Agent Engineering Playground. "
    "Operas bajo un Agent Loop con capacidad de razonamiento iterativo multi-paso.\n\n"
    "Instrucciones operativas de ciclo:\n"
    "1. Inspección y Dependencia: Si la resolución de una consulta exige varios pasos dependientes (por ejemplo, buscar una lista y luego consultar el detalle de un elemento específico), ejecuta el primer paso, observa la evidencia devuelta y decide autónomamente invocar la herramienta del siguiente paso.\n"
    "2. Condición de Parada: Cuando cuentes con toda la evidencia necesaria para responder completamente al requerimiento del usuario, no solicites más herramientas. Emite la respuesta final fundamentada en lenguaje natural en español.\n"
    "3. Fidelidad Estricta: Todas tus afirmaciones deben derivarse exclusivamente de los datos observados en las herramientas. No inventes estados, fechas ni nombres.\n"
    "4. Consultas Conceptuales: Si la pregunta no requiere consultar el sistema de tickets, responde directamente sin herramientas.\n"
    "5. Calidad Comunicativa: Presenta explicaciones completas y fluidas. Cuando menciones estados, incluye el código y su significado en español: OPEN (Abierto), IN_PROGRESS (En progreso), RESOLVED (Resuelto), CLOSED (Cerrado)."
)


def run_with_nonblocking_timeout(
    func: Callable[..., Any],
    args: Tuple[Any, ...] = (),
    kwargs: Optional[Dict[str, Any]] = None,
    timeout_seconds: float = 30.0,
) -> Any:
    kw = kwargs or {}
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(func, *args, **kw)
    try:
        res = future.result(timeout=timeout_seconds)
        executor.shutdown(wait=False, cancel_futures=True)
        return res
    except concurrent.futures.TimeoutError:
        executor.shutdown(wait=False, cancel_futures=True)
        raise
    except Exception:
        executor.shutdown(wait=False, cancel_futures=True)
        raise


def execute_inference(
    provider: ModelProvider,
    messages: List[Dict[str, Any]],
    timeout_seconds: float,
) -> ModelResponse:
    return run_with_nonblocking_timeout(
        provider.generate,
        kwargs={
            "messages": messages,
            "tools": TOOLS_SCHEMAS,
            "timeout": timeout_seconds,
        },
        timeout_seconds=timeout_seconds,
    )


async def execute_inference_async(
    provider: ModelProvider,
    messages: List[Dict[str, Any]],
    timeout_seconds: float,
) -> ModelResponse:
    return await asyncio.to_thread(
        execute_inference,
        provider,
        messages,
        timeout_seconds,
    )
