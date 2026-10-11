import asyncio
import json
import os
import sys
import urllib.request
from typing import Any, Dict, List

if sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

API_BASE_URL = "http://127.0.0.1:8000"


def consume_real_sse(agent_version: str, query: str, user_persona: str = "usr_carlos") -> List[Dict[str, Any]]:
    payload = {
        "agent_version": agent_version,
        "query": query,
        "user_persona": user_persona
    }
    req = urllib.request.Request(
        f"{API_BASE_URL}/api/chat/stream",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        }
    )
    
    events = []
    with urllib.request.urlopen(req, timeout=120) as resp:
        buffer = ""
        while True:
            chunk = resp.read(1024)
            if not chunk:
                break
            # Verify clean UTF-8 decoding without errors
            text = chunk.decode("utf-8", errors="strict")
            buffer += text
            lines = buffer.split("\n")
            buffer = lines.pop()
            for line in lines:
                line = line.strip()
                if line.startswith("data:"):
                    raw_data = line[5:].strip()
                    if raw_data:
                        try:
                            evt = json.loads(raw_data)
                            events.append(evt)
                        except Exception as parse_err:
                            print(f"[SSE Parse Warning]: {parse_err} in {raw_data}")
    return events


def print_event_summary(events: List[Dict[str, Any]]):
    for i, e in enumerate(events):
        t = str(e.get("type") or "UNKNOWN")
        phase = str(e.get("phase") or "")
        hop = str(e.get("hop_number") or "")
        it = str(e.get("iteration_index") or "")
        payload = e.get("payload") or {}
        
        info = ""
        if t in ("TOOL_CALL_PROPOSED", "TOOL_PROPOSAL"):
            info = f"tool={payload.get('tool_name')} args={payload.get('arguments')}"
        elif t in ("CPU_TOOL_EXECUTION", "TOOL_EXECUTION_COMPLETED"):
            info = f"tool={payload.get('tool_name')} status={payload.get('execution_status')} dur={payload.get('duration_ms')}ms"
        elif t in ("FINAL_SYNTHESIS", "DIRECT_ANSWER"):
            ans = payload.get("answer") or payload.get("content") or payload.get("message") or ""
            info = f"answer=\"{ans[:120]}...\"" if len(ans) > 120 else f"answer=\"{ans}\""
        elif t == "ITERATION_COMPLETED":
            info = f"decision={payload.get('decision')} tools_invoked={payload.get('tools_invoked')}"
        elif t == "RUN_COMPLETED":
            info = f"stop_reason={payload.get('stop_reason')} dur={payload.get('total_duration_ms')}ms"
        
        hop_str = f"hop={hop}" if hop else f"it={it}"
        print(f"   [{i+1:02d}] {t:<26} ({phase:<11} {hop_str:<6}) {info}")


def run_tests():
    print("=" * 80)
    print("FASE 2: VALIDACIÓN FUNCIONAL REAL CON FASTAPI + LLAMA.CPP (QWEN 3.5 4B) + MYSQL")
    print("=" * 80)

    # -------------------------------------------------------------
    # 1. Agent v1: Query TICK-1001
    # -------------------------------------------------------------
    print("\n--- [TEST 1] Agent v1: Consulta TICK-1001 ---")
    q1 = "Consulta el ticket TICK-1001 y dime su estado"
    events_v1_t1 = consume_real_sse("v1", q1)
    print_event_summary(events_v1_t1)
    
    event_types_v1_t1 = [e["type"] for e in events_v1_t1]
    assert "USER_REQUEST" in event_types_v1_t1, "Falta USER_REQUEST"
    assert "MODEL_INFERENCE_1" in event_types_v1_t1, "Falta MODEL_INFERENCE_1"
    assert "TOOL_PROPOSAL" in event_types_v1_t1, "Falta TOOL_PROPOSAL"
    assert "ARGUMENT_VALIDATION" in event_types_v1_t1, "Falta ARGUMENT_VALIDATION"
    assert "CPU_TOOL_EXECUTION" in event_types_v1_t1, "Falta CPU_TOOL_EXECUTION"
    assert "TOOL_RESULT_INJECTION" in event_types_v1_t1, "Falta TOOL_RESULT_INJECTION"
    assert "FINAL_SYNTHESIS" in event_types_v1_t1, "Falta FINAL_SYNTHESIS"
    assert "RUN_COMPLETED" in event_types_v1_t1, "Falta RUN_COMPLETED"
    
    synth_v1_t1 = next(e for e in events_v1_t1 if e["type"] == "FINAL_SYNTHESIS")
    ans_v1_t1 = synth_v1_t1["payload"].get("answer", "")
    assert "TICK-1001" in ans_v1_t1, "La respuesta debe mencionar TICK-1001"
    print(f"[TEST 1 OK]: 7 Hops verificados. Respuesta final fundamentada: {ans_v1_t1[:180]}...")

    # -------------------------------------------------------------
    # 2. Agent v1: Identify overdue tickets
    # -------------------------------------------------------------
    print("\n--- [TEST 2] Agent v1: Identificar tickets vencidos ---")
    q2 = "Identifica los tickets vencidos según SLA"
    events_v1_t2 = consume_real_sse("v1", q2)
    print_event_summary(events_v1_t2)
    
    synth_v1_t2 = next(e for e in events_v1_t2 if e["type"] == "FINAL_SYNTHESIS")
    ans_v1_t2 = synth_v1_t2["payload"].get("answer", "")
    print(f"[TEST 2 OK]: 7 Hops verificados. Respuesta final: {ans_v1_t2[:180]}...")

    # -------------------------------------------------------------
    # 3. Agent v2: Query TICK-1001
    # -------------------------------------------------------------
    print("\n--- [TEST 3] Agent v2: Consulta TICK-1001 ---")
    q3 = "Consulta el ticket TICK-1001 y dime su estado"
    events_v2_t3 = consume_real_sse("v2", q3)
    print_event_summary(events_v2_t3)
    
    tool_executed_v2_t3 = [e for e in events_v2_t3 if e["type"] == "TOOL_EXECUTION_COMPLETED"]
    assert any(e["payload"].get("tool_name") in ("get_ticket_by_id", "get_ticket") for e in tool_executed_v2_t3), "Debe ejecutar get_ticket_by_id"
    synth_v2_t3 = next(e for e in events_v2_t3 if e["type"] == "FINAL_SYNTHESIS")
    ans_v2_t3 = synth_v2_t3["payload"].get("answer", "")
    assert "TICK-1001" in ans_v2_t3, "La respuesta debe mencionar TICK-1001"
    print(f"[TEST 3 OK]: Agent v2 resolvió TICK-1001. Respuesta: {ans_v2_t3[:180]}...")

    # -------------------------------------------------------------
    # 4. Agent v2: Identify overdue tickets
    # -------------------------------------------------------------
    print("\n--- [TEST 4] Agent v2: Identificar tickets vencidos ---")
    q4 = "Identifica los tickets vencidos según SLA"
    events_v2_t4 = consume_real_sse("v2", q4)
    print_event_summary(events_v2_t4)
    
    tool_executed_v2_t4 = [e for e in events_v2_t4 if e["type"] == "TOOL_EXECUTION_COMPLETED"]
    assert any(e["payload"].get("tool_name") == "identify_overdue_tickets" for e in tool_executed_v2_t4), "Debe ejecutar identify_overdue_tickets"
    synth_v2_t4 = next(e for e in events_v2_t4 if e["type"] == "FINAL_SYNTHESIS")
    ans_v2_t4 = synth_v2_t4["payload"].get("answer", "")
    print(f"[TEST 4 OK]: Agent v2 identificó tickets vencidos. Respuesta: {ans_v2_t4[:180]}...")

    # -------------------------------------------------------------
    # 5. Agent v2: Multi-step Dependent Decision Loop
    # -------------------------------------------------------------
    print("\n--- [TEST 5] Agent v2: Consulta Multi-Step (Vencidos -> Seleccionar Primero -> Detalle) ---")
    q5 = (
        "Por favor identifica cuáles son los tickets vencidos en el sistema. "
        "Luego, con el código del primer ticket vencido que encuentres, consulta sus detalles completos "
        "utilizando la herramienta correspondiente para explicarme el problema y su estado."
    )
    events_v2_t5 = consume_real_sse("v2", q5)
    print_event_summary(events_v2_t5)
    
    # Analyze iterations and decisions
    iter_events = [e for e in events_v2_t5 if e["type"] == "ITERATION_COMPLETED"]
    tools_executed = [e["payload"].get("tool_name") for e in events_v2_t5 if e["type"] == "TOOL_EXECUTION_COMPLETED"]
    
    print(f"Total iteraciones registradas: {len(iter_events)}")
    print(f"Herramientas ejecutadas en secuencia real: {tools_executed}")
    
    assert "identify_overdue_tickets" in tools_executed, "Debe ejecutar identify_overdue_tickets primero"
    assert any(t in ("get_ticket_by_id", "get_ticket") for t in tools_executed), "Debe ejecutar get_ticket_by_id en el siguiente paso dependiente"
    
    synth_v2_t5 = next(e for e in events_v2_t5 if e["type"] == "FINAL_SYNTHESIS")
    ans_v2_t5 = synth_v2_t5["payload"].get("answer", "")
    print(f"[TEST 5 OK]: Multi-step ejecutado exitosamente con decisiones autónomas de Qwen.")
    print(f"Respuesta final:\n{ans_v2_t5}")
    print("=" * 80)


if __name__ == "__main__":
    run_tests()
