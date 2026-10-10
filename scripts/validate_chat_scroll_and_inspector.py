import asyncio
import json
import os
import sys
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:4200"
OUT_DIR = os.environ.get(
    "AEP_SHOTS_DIR",
    r"C:\Users\YAMI\.gemini\antigravity-ide\brain\13345f9f-22c0-433e-a9c7-839d00e4334f\screenshots",
)
VIEWPORTS = [
    ("mobile_360", 360, 800),
    ("mobile_390", 390, 844),
    ("tablet_768", 768, 1024),
    ("desktop_1024", 1024, 768),
    ("desktop_1440", 1440, 900),
    ("desktop_1920", 1920, 1080),
]
FULL_SCENARIO_VIEWPORTS = ("desktop_1440", "mobile_390")

results = []
console_errors = []
_counter = [0]


def check(label, ok, detail=""):
    results.append((label, bool(ok), detail))
    print(("[PASS] " if ok else "[FAIL] ") + label + (f" -> {detail}" if detail else ""), flush=True)


def evt(kind, it, payload=None, phase="loop"):
    _counter[0] += 1
    return {
        "event_id": f"evt-{_counter[0]}",
        "agent_version": "v2",
        "execution_id": "exec-test",
        "iteration_index": it,
        "phase": phase,
        "type": kind,
        "payload": payload or {},
        "timestamp": "2026-10-10T15:00:00Z",
    }


def long_answer():
    rows = "\n".join(
        f"| TICK-{2000 + i} | Incidente número {i} con descripción extensa del problema | {'Alta' if i % 2 else 'Media'} | Vencido |"
        for i in range(40)
    )
    sections = "\n\n".join(
        f"### Ticket TICK-{2000 + i}\n\nEste ticket presenta un incidente prolongado que requiere atención inmediata del equipo de soporte, con múltiples reintentos y escalamiento pendiente."
        for i in range(12)
    )
    return f"## Tickets vencidos\n\n| Código | Descripción | Prioridad | Estado |\n|---|---|---|---|\n{rows}\n\n{sections}"


def scenario_events(query):
    q = query.upper()
    start = evt("RUN_STARTED", 0, {"query": query, "operator": "usr_carlos", "max_iterations": 3}, "init")
    it1 = [
        evt("ITERATION_STARTED", 1, {"iteration_index": 1, "max_iterations": 3}),
        evt("MODEL_INFERENCE_STARTED", 1, {}, "inference"),
    ]
    tool = [
        evt("MODEL_INFERENCE_COMPLETED", 1, {"has_tool_calls": True, "tool_calls_count": 1, "duration_ms": 50}, "inference"),
        evt("TOOL_CALL_PROPOSED", 1, {"tool_call_id": "c1", "tool_name": "identify_overdue_tickets", "arguments": {}, "is_mutative": False}, "proposal"),
        evt("ARGUMENTS_VALIDATED", 1, {"tool_call_id": "c1", "tool_name": "identify_overdue_tickets", "is_valid": True}, "validation"),
        evt("TOOL_EXECUTION_STARTED", 1, {"tool_call_id": "c1", "tool_name": "identify_overdue_tickets", "policy": "ALLOW"}, "execution"),
        evt("TOOL_EXECUTION_COMPLETED", 1, {"tool_call_id": "c1", "tool_name": "identify_overdue_tickets", "execution_status": "success", "duration_ms": 12, "result": {"tickets": []}}, "execution"),
        evt("OBSERVATION_APPENDED", 1, {"tool_call_id": "c1", "tool_name": "identify_overdue_tickets", "observation": {"tickets": []}}, "observation"),
        evt("ITERATION_COMPLETED", 1, {"iteration_index": 1, "duration_ms": 90, "tool_calls_count": 1, "had_observation": True, "decision": "continue_next_iteration", "tools_invoked": ["identify_overdue_tickets"]}),
    ]

    def direct_tail(it, ans):
        return [
            evt("MODEL_INFERENCE_COMPLETED", it, {"has_tool_calls": False, "tool_calls_count": 0, "duration_ms": 30}, "inference"),
            evt("FINAL_SYNTHESIS", it, {"answer": ans, "total_iterations": it}, "synthesis"),
            evt("ITERATION_COMPLETED", it, {"iteration_index": it, "duration_ms": 40, "tool_calls_count": 0, "had_observation": False, "decision": "final_answer", "tools_invoked": []}),
            evt("RUN_COMPLETED", it, {"status": "completed", "stop_reason": "final_answer", "total_iterations": it}, "complete"),
        ]

    if "ESTANCA" in q:
        msg = "Estancamiento detectado: mismo conjunto de herramientas."
        return [start] + it1 + tool + [
            evt("ITERATION_STARTED", 2, {"iteration_index": 2}),
            evt("MODEL_INFERENCE_STARTED", 2, {}, "inference"),
            evt("MODEL_INFERENCE_COMPLETED", 2, {"has_tool_calls": True, "tool_calls_count": 1, "duration_ms": 20}, "inference"),
            evt("LOOP_REPETITION_DETECTED", 2, {"message": msg}),
            evt("ITERATION_COMPLETED", 2, {"iteration_index": 2, "duration_ms": 25, "tool_calls_count": 1, "had_observation": False, "decision": "stagnation_stopped", "tools_invoked": ["identify_overdue_tickets"]}),
            evt("RUN_FAILED", 2, {"status": "failed", "stop_reason": "repetitive_tool_call", "error_message": msg}, "complete"),
        ]
    if "TIMEOUT" in q:
        msg = "Inferencia del modelo excedió el límite de 30.00s."
        return [start] + it1 + [
            evt("LOOP_TIMEOUT_EXCEEDED", 1, {"reason": "inference_timeout", "message": msg}),
            evt("RUN_FAILED", 1, {"status": "failed", "stop_reason": "inference_timeout", "error_message": msg}, "complete"),
        ]
    if "LIMITE" in q:
        msg = "Límite operacional de 1 iteraciones alcanzado sin respuesta final."
        return [start] + it1 + tool + [
            evt("LOOP_LIMIT_EXCEEDED", 1, {"max_iterations": 1, "message": msg}),
            evt("RUN_FAILED", 1, {"status": "failed", "stop_reason": "max_iterations_reached", "error_message": msg}, "complete"),
        ]
    if "FATAL" in q:
        return [start] + it1 + [
            evt("RUN_FAILED", 1, {"status": "failed", "stop_reason": "fatal_error", "error_message": "Error en inferencia: conexión rechazada"}, "complete"),
        ]
    if "DIRECTO" in q:
        return [start] + it1 + direct_tail(1, "Respuesta conceptual directa del modelo.")
    if "HERRAMIENTA" in q:
        return [start] + it1 + tool + [
            evt("ITERATION_STARTED", 2, {"iteration_index": 2}),
            evt("MODEL_INFERENCE_STARTED", 2, {}, "inference"),
        ] + direct_tail(2, "Resumen tras ejecutar la herramienta.")
    return [start] + it1 + direct_tail(1, long_answer())


async def install_stream_mock(page):
    async def handler(route):
        req = route.request
        cors = {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "POST, OPTIONS",
        }
        if req.method == "OPTIONS":
            await route.fulfill(status=204, headers=cors)
            return
        body = json.loads(req.post_data or "{}")
        query = body.get("query", "")
        if "LENTO" in query.upper():
            await asyncio.sleep(1.6)
        text = "".join(f"data: {json.dumps(e)}\n\n" for e in scenario_events(query))
        await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body=text)

    await page.route("**/api/chat/stream", handler)


async def send(page, text, wait_done=True):
    box = page.locator("#chat-input")
    await box.click()
    await box.fill(text)
    await box.press("Enter")
    if wait_done:
        await page.wait_for_selector("#send-button", state="visible", timeout=15000)
        await page.wait_for_timeout(300)


async def hover_chat(page):
    box = await page.locator(".chat-messages").bounding_box()
    await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


async def wheel_chat_to_top(page):
    await hover_chat(page)
    for _ in range(40):
        await page.mouse.wheel(0, -1500)
    await page.wait_for_timeout(250)


async def metrics(page):
    return await page.evaluate(
        """() => {
        const m = document.querySelector('.chat-messages');
        const f = document.querySelector('.chat-footer');
        const doc = document.documentElement;
        const fr = f.getBoundingClientRect();
        return {
          scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight,
          dist: m.scrollHeight - m.scrollTop - m.clientHeight,
          footerBottom: fr.bottom, footerTop: fr.top, vh: window.innerHeight,
          docOverflowX: Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth,
          docOverflowY: doc.scrollHeight - window.innerHeight,
          msgOverflowX: m.scrollWidth - m.clientWidth,
          chatWidth: m.getBoundingClientRect().width,
        };
    }"""
    )


async def show_chat_tab(page, vw):
    if vw <= 900:
        await page.get_by_role("button", name="Ver panel de conversación").click()
        await page.wait_for_timeout(200)


async def show_inspector_tab(page, vw):
    if vw <= 900:
        await page.get_by_role("button", name="Ver panel de inspector de runtime").click()
        await page.wait_for_timeout(200)


async def phase_states(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('.phase-node')).map(n => ({
            name: n.querySelector('.phase-name').textContent.trim(),
            cls: ['is-completed','is-skipped','is-failed','is-running','is-idle'].find(c => n.classList.contains(c)) || '',
            title: n.getAttribute('title') || ''
        }))"""
    )


async def decision_texts(page):
    return await page.evaluate(
        "() => Array.from(document.querySelectorAll('.decision-pill')).map(p => p.textContent.trim())"
    )


async def pick_iteration(page, index):
    await page.locator(".iteration-card").nth(index).click()
    await page.wait_for_timeout(250)


async def pick_phase(page, index):
    await page.locator(".phase-node").nth(index).click()
    await page.wait_for_timeout(250)


async def run_scenario(page, vw, prompt):
    await show_chat_tab(page, vw)
    await send(page, prompt)
    await show_inspector_tab(page, vw)
    await page.wait_for_timeout(300)


def classes(phases):
    return [p["cls"] for p in phases]


async def chat_checks(page, tag, vw, vh):
    await send(page, "Lista todos los tickets vencidos extensos")
    m = await metrics(page)
    check(f"{tag} chat tiene desbordamiento interno", m["scrollHeight"] > m["clientHeight"] + 50, f"{m['scrollHeight']}>{m['clientHeight']}")
    check(f"{tag} autoscroll al final tras respuesta", m["dist"] <= 3, f"dist={m['dist']:.1f}")
    check(f"{tag} footer visible en viewport", m["footerBottom"] <= m["vh"] + 1 and m["footerTop"] >= 0, f"bottom={m['footerBottom']:.0f} vh={m['vh']}")
    check(f"{tag} pagina sin scroll vertical global", m["docOverflowY"] <= 1, f"{m['docOverflowY']}")
    check(f"{tag} sin scroll horizontal (doc y chat)", m["docOverflowX"] <= 1 and m["msgOverflowX"] <= 1, f"doc={m['docOverflowX']} chat={m['msgOverflowX']}")
    await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_chat_bottom.png"))

    await hover_chat(page)
    await page.mouse.wheel(0, -200)
    await page.wait_for_timeout(200)
    m2 = await metrics(page)
    check(f"{tag} rueda del mouse desplaza hacia arriba", m2["scrollTop"] < m["scrollTop"], f"{m['scrollTop']:.0f}->{m2['scrollTop']:.0f}")
    await wheel_chat_to_top(page)
    m3 = await metrics(page)
    check(f"{tag} alcanza el inicio del historial", m3["scrollTop"] <= 1, f"top={m3['scrollTop']}")
    first_visible = await page.evaluate(
        """() => { const r = document.querySelector('.message-row').getBoundingClientRect(); const c = document.querySelector('.chat-messages').getBoundingClientRect(); return r.top >= c.top - 1; }"""
    )
    check(f"{tag} primer mensaje visible al inicio", first_visible)
    await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_chat_top.png"))

    await page.locator(".chat-messages").focus()
    await page.keyboard.press("End")
    await page.wait_for_timeout(300)
    m4 = await metrics(page)
    check(f"{tag} teclado End lleva al final", m4["dist"] <= 3, f"dist={m4['dist']:.1f}")
    await page.keyboard.press("PageUp")
    await page.wait_for_timeout(300)
    m5 = await metrics(page)
    check(f"{tag} teclado PageUp desplaza", m5["scrollTop"] < m4["scrollTop"])
    await page.keyboard.press("End")
    await page.wait_for_timeout(200)

    await send(page, "Otra consulta con tickets vencidos")
    m6 = await metrics(page)
    check(f"{tag} envio estando al final sigue al final", m6["dist"] <= 3, f"dist={m6['dist']:.1f}")

    await send(page, "LENTO consulta larga", wait_done=False)
    await page.wait_for_timeout(300)
    await wheel_chat_to_top(page)
    before = await metrics(page)
    await page.wait_for_selector("#send-button", state="visible", timeout=15000)
    await page.wait_for_timeout(700)
    after = await metrics(page)
    check(
        f"{tag} no fuerza scroll al llegar respuesta si el usuario lee arriba",
        before["scrollTop"] <= 1 and abs(after["scrollTop"] - before["scrollTop"]) <= 2 and after["dist"] > 200,
        f"before={before['scrollTop']:.0f} after={after['scrollTop']:.0f} dist={after['dist']:.0f}",
    )

    await page.locator("#agent-select").select_option("v1")
    await page.wait_for_timeout(300)
    mv1 = await metrics(page)
    check(f"{tag} chat sigue siendo desplazable tras cambiar a v1", mv1["scrollHeight"] > mv1["clientHeight"] and mv1["docOverflowY"] <= 1)
    await page.locator("#agent-select").select_option("v2")
    await page.wait_for_timeout(300)
    mv2 = await metrics(page)
    check(f"{tag} layout estable tras volver a v2", mv2["footerBottom"] <= mv2["vh"] + 1 and mv2["docOverflowY"] <= 1)


async def desktop_pane_checks(page, tag, vw):
    sb = await page.locator(".layout-splitter").bounding_box()
    w0 = (await metrics(page))["chatWidth"]
    await page.mouse.move(sb["x"] + 3, sb["y"] + sb["height"] / 2)
    await page.mouse.down()
    await page.mouse.move(vw * 0.62, sb["y"] + sb["height"] / 2, steps=8)
    await page.mouse.up()
    await page.wait_for_timeout(300)
    mw = await metrics(page)
    check(f"{tag} divisor redimensiona el chat", mw["chatWidth"] > w0 + 20, f"{w0:.0f}->{mw['chatWidth']:.0f}")
    check(f"{tag} chat acotado tras redimensionar", mw["footerBottom"] <= mw["vh"] + 1 and mw["docOverflowX"] <= 1)
    await hover_chat(page)
    await page.mouse.wheel(0, 400)
    await page.wait_for_timeout(200)
    await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_resized.png"))
    await page.locator(".layout-splitter").dblclick()
    await page.wait_for_timeout(250)

    await send(page, "Consulta que usa HERRAMIENTA y luego responde")
    ins = await page.evaluate("() => { const c = document.querySelector('.inspector-content'); return {sh: c.scrollHeight, ch: c.clientHeight}; }")
    await wheel_chat_to_top(page)
    chat_before = (await metrics(page))["scrollTop"]
    ib = await page.locator(".inspector-content").bounding_box()
    await page.mouse.move(ib["x"] + ib["width"] / 2, ib["y"] + ib["height"] / 2)
    await page.mouse.wheel(0, 500)
    await page.wait_for_timeout(250)
    ins_top = await page.evaluate("() => document.querySelector('.inspector-content').scrollTop")
    chat_after = (await metrics(page))["scrollTop"]
    check(f"{tag} inspector tiene scroll propio", ins["sh"] > ins["ch"] and ins_top > 0, f"scrollTop={ins_top} sh={ins['sh']} ch={ins['ch']}")
    check(f"{tag} scroll del inspector no mueve el chat", abs(chat_after - chat_before) <= 1)
    await hover_chat(page)
    await page.mouse.wheel(0, 300)
    await page.wait_for_timeout(250)
    ins_after = await page.evaluate("() => document.querySelector('.inspector-content').scrollTop")
    check(f"{tag} scroll del chat no mueve el inspector", abs(ins_after - ins_top) <= 1)


async def mobile_inspector_scroll(page, tag, vw, vh):
    await show_inspector_tab(page, vw)
    await page.mouse.move(vw / 2, vh / 2)
    await page.mouse.wheel(0, 600)
    await page.wait_for_timeout(250)
    sm = await page.evaluate("() => { const c = document.querySelector('.inspector-content'); return {sh: c.scrollHeight, ch: c.clientHeight, st: c.scrollTop}; }")
    check(f"{tag} inspector desplazable en movil", sm["sh"] <= sm["ch"] or sm["st"] > 0, str(sm))
    await show_chat_tab(page, vw)


async def inspector_checks(page, tag, vw, full):
    await run_scenario(page, vw, "Consulta que usa HERRAMIENTA y luego responde")
    check(f"{tag} decisiones continue_next_iteration y final_answer distinguidas", await decision_texts(page) == ["Continuar bucle", "Respuesta final"], str(await decision_texts(page)))

    await pick_iteration(page, 0)
    phases = await phase_states(page)
    check(f"{tag} siete fases visibles", len(phases) == 7)
    check(f"{tag} iteracion con herramienta: 6 completadas y sintesis omitida", classes(phases) == ["is-completed"] * 6 + ["is-skipped"], str(classes(phases)))
    await pick_phase(page, 6)
    reason = await page.locator(".phase-reason-text").first.text_content()
    check(f"{tag} sintesis omitida muestra motivo", "iteración en la que el modelo responde sin herramientas" in reason, reason)
    await pick_phase(page, 5)
    banner = await page.locator(".decision-banner").inner_text()
    check(f"{tag} banner continue_next_iteration", "Continuar bucle" in banner and "continue_next_iteration" in banner and "El bucle continúa" in banner, banner.replace("\n", " | "))
    await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_inspector_tool.png"))

    await pick_iteration(page, 1)
    phases = await phase_states(page)
    check(
        f"{tag} iteracion con respuesta final: fases de herramienta omitidas",
        classes(phases) == ["is-completed", "is-skipped", "is-skipped", "is-skipped", "is-skipped", "is-completed", "is-completed"],
        str(classes(phases)),
    )
    check(f"{tag} omitidas explican motivo desde evidencia", all("sin proponer herramientas" in p["title"] for p in phases[1:5]))
    await pick_phase(page, 5)
    banner = await page.locator(".decision-banner").inner_text()
    check(f"{tag} banner final_answer terminacion normal", "final_answer" in banner and "Terminación normal" in banner, banner.replace("\n", " | "))

    if full:
        await run_scenario(page, vw, "Pregunta DIRECTO conceptual")
        phases = await phase_states(page)
        check(
            f"{tag} respuesta directa sin herramientas",
            classes(phases) == ["is-completed", "is-skipped", "is-skipped", "is-skipped", "is-skipped", "is-completed", "is-completed"],
            str(classes(phases)),
        )
        await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_inspector_direct.png"))

        await run_scenario(page, vw, "Caso ESTANCA repetido")
        check(f"{tag} estancamiento diferenciado", (await decision_texts(page))[-1] == "Estancamiento detectado", str(await decision_texts(page)))
        await pick_iteration(page, 1)
        await pick_phase(page, 5)
        banner = await page.locator(".decision-banner").inner_text()
        reason = await page.locator(".phase-reason-text").first.text_content()
        check(f"{tag} estancamiento = condicion de seguridad con motivo", "Terminación por condición de seguridad" in banner and "Estancamiento detectado" in reason, banner.replace("\n", " | "))
        await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_inspector_stagnation.png"))

        await run_scenario(page, vw, "Caso TIMEOUT inferencia")
        check(f"{tag} timeout diferenciado", (await decision_texts(page)) == ["Tiempo agotado"], str(await decision_texts(page)))
        phases = await phase_states(page)
        check(f"{tag} timeout: inferencia y decision fallidas, resto omitido", classes(phases) == ["is-failed", "is-skipped", "is-skipped", "is-skipped", "is-skipped", "is-failed", "is-skipped"], str(classes(phases)))
        await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_inspector_timeout.png"))

        await run_scenario(page, vw, "Caso LIMITE de iteraciones")
        check(f"{tag} limite de iteraciones diferenciado de continuar", (await decision_texts(page))[-1] == "Límite de iteraciones", str(await decision_texts(page)))

        await run_scenario(page, vw, "Caso FATAL error")
        check(f"{tag} error fatal diferenciado", (await decision_texts(page))[-1] == "Error de ejecución", str(await decision_texts(page)))
        phases = await phase_states(page)
        check(f"{tag} error fatal marca inferencia fallida", phases[0]["cls"] == "is-failed", str(classes(phases)))

    mo = await metrics(page) if vw > 900 else {"docOverflowX": await page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")}
    check(f"{tag} sin desbordamiento horizontal con inspector", mo["docOverflowX"] <= 1, f"{mo['docOverflowX']}")
    await page.screenshot(path=os.path.join(OUT_DIR, f"{tag}_inspector_final.png"))


async def run_viewport(browser, name, vw, vh):
    ctx = await browser.new_context(viewport={"width": vw, "height": vh}, has_touch=vw <= 768)
    page = await ctx.new_page()
    page.on("console", lambda m: console_errors.append(f"[{name}] {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"[{name}] PAGEERROR {e}"))
    await install_stream_mock(page)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.wait_for_timeout(800)

    await page.locator("#agent-select").select_option("v2")
    await page.wait_for_timeout(300)

    await chat_checks(page, name, vw, vh)
    if vw > 900:
        await desktop_pane_checks(page, name, vw)
    else:
        await send(page, "Consulta que usa HERRAMIENTA y luego responde")
        await mobile_inspector_scroll(page, name, vw, vh)

    await inspector_checks(page, name, vw, name in FULL_SCENARIO_VIEWPORTS)
    await ctx.close()


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = sys.argv[1:]
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for name, w, h in VIEWPORTS:
            if only and name not in only:
                continue
            print(f"=== {name} {w}x{h} ===", flush=True)
            try:
                await run_viewport(browser, name, w, h)
            except Exception as exc:
                check(f"{name} ejecucion sin excepciones", False, repr(exc)[:300])
        await browser.close()

    check("sin errores de consola", not console_errors, "; ".join(console_errors[:5]))
    failed = [r for r in results if not r[1]]
    print(f"\nTOTAL {len(results)} checks, {len(failed)} fallidos")
    for r in failed:
        print("  FAIL:", r[0], r[2])
    sys.exit(1 if failed else 0)


asyncio.run(main())
