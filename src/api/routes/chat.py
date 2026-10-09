import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Callable, Dict, Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from src.api.schemas import ChatRequest, StreamEvent
from src.api.security import sanitize_payload

router = APIRouter(prefix="/api/chat", tags=["Agent Chat SSE"])

AGENT_STREAM_DISPATCHERS: Dict[str, Callable] = {}


def register_agent_stream_dispatcher(version: str, dispatcher: Callable) -> None:
    AGENT_STREAM_DISPATCHERS[version] = dispatcher


async def default_controlled_test_dispatcher(req: ChatRequest) -> AsyncGenerator[StreamEvent, None]:
    for i in range(1, 7):
        yield StreamEvent(
            event_id=f"evt-controlled-{i}",
            agent_version="test_sse",
            hop_number=i,
            hop_title=f"HOP {i} - CONTROLLED TEST",
            type="STEP_PROGRESS",
            payload={"step": i, "query": req.query, "status": "streaming"},
        )
        await asyncio.sleep(0.4)
    yield StreamEvent(
        event_id="evt-controlled-final",
        agent_version="test_sse",
        hop_number=7,
        hop_title="HOP 7 - FINAL SYNTHESIS",
        type="FINAL_SYNTHESIS",
        payload={"message": "Flujo de prueba controlado completado satisfactoriamente."},
    )


from src.agents.v1_tool_calling.agent import run_agent_v1_stream

register_agent_stream_dispatcher("test_sse", default_controlled_test_dispatcher)
register_agent_stream_dispatcher("v1", run_agent_v1_stream)


async def format_and_log_event(event: StreamEvent) -> str:
    sanitized_payload = sanitize_payload(event.payload)
    event.payload = sanitized_payload

    log_line = f"[RUNTIME EVENT] [{event.agent_version.upper()}] {event.type}"
    if event.hop_number is not None:
        log_line += f" (HOP {event.hop_number}: {event.hop_title})"
    log_line += f" -> {json.dumps(sanitized_payload, ensure_ascii=False)}"

    print(log_line, file=sys.stdout, flush=True)

    event_json = event.model_dump_json()
    return f"data: {event_json}\n\n"


async def generate_chat_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    dispatcher = AGENT_STREAM_DISPATCHERS.get(request.agent_version)

    if dispatcher is None:
        start_event = StreamEvent(
            event_id=f"evt-{uuid.uuid4().hex[:10]}",
            agent_version=request.agent_version,
            type="USER_REQUEST",
            payload={
                "query": request.query,
                "persona": request.user_persona,
                "mode": "lab_simulation",
            },
        )
        yield await format_and_log_event(start_event)

        notice_event = StreamEvent(
            event_id=f"evt-{uuid.uuid4().hex[:10]}",
            agent_version=request.agent_version,
            type="AGENT_NOT_READY",
            payload={
                "status": "pending_implementation",
                "message": (
                    f"El runtime de {request.agent_version} está pendiente de implementación. "
                    "El catálogo lo mantiene deshabilitado hasta completar la Fase 1."
                ),
            },
        )
        yield await format_and_log_event(notice_event)

        completed_event = StreamEvent(
            event_id=f"evt-{uuid.uuid4().hex[:10]}",
            agent_version=request.agent_version,
            type="RUN_COMPLETED",
            payload={
                "status": "stopped",
                "reason": "agent_pending_phase_1",
            },
        )
        yield await format_and_log_event(completed_event)
        return

    try:
        async for stream_event in dispatcher(request):
            yield await format_and_log_event(stream_event)
    except asyncio.CancelledError:
        pass
    except Exception as err:
        err_event = StreamEvent(
            event_id=f"evt-{uuid.uuid4().hex[:10]}",
            agent_version=request.agent_version,
            type="ERROR",
            payload={"message": f"Error en streaming: {str(err)}"},
        )
        yield await format_and_log_event(err_event)


@router.post("/stream")
async def chat_stream_endpoint(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        generate_chat_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
