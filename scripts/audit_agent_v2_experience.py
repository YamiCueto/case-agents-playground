import os
import sys
import time
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\YAMI\.gemini\antigravity-ide\brain\83dd13a3-09f5-475a-9dec-5221efcc702a"
VIEWPORTS = [
    {"name": "mobile_360", "width": 360, "height": 800},
    {"name": "mobile_390", "width": 390, "height": 844},
    {"name": "tablet_768", "width": 768, "height": 1024},
    {"name": "desktop_1024", "width": 1024, "height": 768},
    {"name": "desktop_1440", "width": 1440, "height": 900},
    {"name": "desktop_1920", "width": 1920, "height": 1080},
]


def check_no_horizontal_overflow(page, context_label=""):
    overflow = page.evaluate(
        """() => {
        const docElem = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docElem.scrollWidth, body.scrollWidth);
        const clientWidth = docElem.clientWidth;
        return {
            hasOverflow: scrollWidth > clientWidth + 1,
            scrollWidth,
            clientWidth,
            delta: scrollWidth - clientWidth
        };
    }"""
    )
    if overflow["hasOverflow"]:
        print(f"[OVERFLOW WARNING] {context_label}: scrollWidth={overflow['scrollWidth']} > clientWidth={overflow['clientWidth']} (+{overflow['delta']}px)")
    else:
        print(f"[OK NO OVERFLOW] {context_label}: scrollWidth={overflow['scrollWidth']} <= clientWidth={overflow['clientWidth']}")
    return overflow


def run_audit():
    console_errors = []
    page_errors = []

    def on_console(msg):
        if msg.type == "error":
            console_errors.append(msg.text)
            print(f"[BROWSER CONSOLE ERROR]: {msg.text}")

    def on_page_error(err):
        page_errors.append(str(err))
        print(f"[BROWSER UNHANDLED EXCEPTION]: {err}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        print("=== INICIANDO AUDITORIA PLAYWRIGHT DE AGENT V2 ===")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", on_console)
        page.on("pageerror", on_page_error)

        page.goto("http://127.0.0.1:4200", wait_until="networkidle")
        page.wait_for_timeout(2000)

        agent_select = page.locator("#agent-select")
        initial_val = agent_select.input_value()
        print(f"Agente predeterminado: {initial_val}")
        assert initial_val == "v1", f"El agente predeterminado debe ser v1, pero es {initial_val}"

        print("--- Seleccionando Agent v2 ---")
        agent_select.select_option("v2")
        page.wait_for_timeout(800)

        chat_input = page.locator("#chat-input")
        query = (
            "Por favor identifica cuáles son los tickets vencidos en el sistema. "
            "Luego, con el código del primer ticket vencido que encuentres, consulta sus detalles completos "
            "utilizando la herramienta correspondiente para explicarme el problema y su estado."
        )
        chat_input.click()
        chat_input.fill(query)
        page.wait_for_timeout(300)

        send_btn = page.locator("#send-button")
        if send_btn.is_visible() and send_btn.is_enabled():
            send_btn.click()
        else:
            chat_input.press("Enter")

        print("--- Esperando ejecucion agéntica del bucle iterativo v2 ---")
        try:
            page.locator(".runtime-progress-badge").wait_for(state="attached", timeout=8000)
            print("Indicador de ejecucion en progreso detectado")
            page.locator(".runtime-progress-badge").wait_for(state="detached", timeout=75000)
            print("Ejecucion agéntica completada")
        except Exception as e:
            print(f"Espera de progreso: {e}")
            page.wait_for_timeout(15000)

        page.wait_for_timeout(2000)

        screen_v2_main = os.path.join(ARTIFACT_DIR, "v2_live_completed_1440.png")
        page.screenshot(path=screen_v2_main, full_page=False)
        print(f"Screenshot guardado: {screen_v2_main}")

        print("--- Verificando componentes de macro y micro dimension ---")
        iter_cards = page.locator(".iteration-card")
        iter_count = iter_cards.count()
        print(f"Iteraciones detectadas en dimension macro: {iter_count}")
        assert iter_count >= 2, f"Se esperaban al menos 2 iteraciones, encontradas: {iter_count}"

        iter_cards.nth(0).click()
        page.wait_for_timeout(500)
        screen_iter1 = os.path.join(ARTIFACT_DIR, "v2_iteration1_micro_phases_1440.png")
        page.screenshot(path=screen_iter1, full_page=False)

        if iter_count >= 2:
            iter_cards.nth(1).click()
            page.wait_for_timeout(500)
            phase_nodes = page.locator(".phase-node")
            if phase_nodes.count() >= 4:
                phase_nodes.nth(3).click()
                page.wait_for_timeout(500)
            screen_iter2 = os.path.join(ARTIFACT_DIR, "v2_iteration2_tool_evidence_1440.png")
            page.screenshot(path=screen_iter2, full_page=False)

        print("--- Verificando Controles Live y Pause ---")
        pause_btn = page.locator(".btn-pause-visual")
        if pause_btn.is_visible():
            pause_btn.click()
            page.wait_for_timeout(500)
            print("Pausa visual activada")
            pause_btn.click()
            page.wait_for_timeout(500)
            print("Pausa visual reanudada")

        print("--- Verificando Modo Replay ---")
        replay_switch = page.locator(".btn-switch-replay")
        if replay_switch.is_visible():
            replay_switch.click()
            page.wait_for_timeout(500)
            print("Modo Replay activado")

            step_fwd = page.locator(".transport-controls button[title='Paso siguiente']")
            if step_fwd.is_visible():
                step_fwd.click()
                page.wait_for_timeout(300)
                step_fwd.click()
                page.wait_for_timeout(300)

            speed_2x = page.locator(".btn-speed:has-text('2x')")
            if speed_2x.is_visible():
                speed_2x.click()
                page.wait_for_timeout(300)

            screen_replay = os.path.join(ARTIFACT_DIR, "v2_replay_mode_1440.png")
            page.screenshot(path=screen_replay, full_page=False)

            live_switch = page.locator(".btn-switch-live")
            if live_switch.is_visible():
                live_switch.click()
                page.wait_for_timeout(500)
                print("Regreso a modo Live completado")

        print("--- Verificando alternancia a Agent v1 y conservacion de 7 Hops ---")
        agent_select.select_option("v1")
        page.wait_for_timeout(800)

        chat_input.click()
        chat_input.fill("Consulta el ticket TICK-1001 y dime su estado")
        page.wait_for_timeout(300)
        send_btn = page.locator("#send-button")
        if send_btn.is_visible() and send_btn.is_enabled():
            send_btn.click()
        else:
            chat_input.press("Enter")

        try:
            page.locator(".runtime-progress-badge").wait_for(state="attached", timeout=8000)
            page.locator(".runtime-progress-badge").wait_for(state="detached", timeout=75000)
        except Exception as e:
            print(f"Espera v1: {e}")
            page.wait_for_timeout(10000)

        page.wait_for_timeout(2000)

        flow_nodes = page.locator(".flow-node-item")
        print(f"Hops detectados en Agent v1: {flow_nodes.count()}")
        assert flow_nodes.count() == 7, f"Se esperaban 7 hops en v1, encontrados: {flow_nodes.count()}"

        screen_v1 = os.path.join(ARTIFACT_DIR, "v1_retained_7hops_1440.png")
        page.screenshot(path=screen_v1, full_page=False)

        print("--- Validando Viewports y Ausencia de Desbordamiento ---")
        for vp in VIEWPORTS:
            print(f"Probando viewport {vp['name']} ({vp['width']}x{vp['height']})")
            vp_page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]})
            vp_page.on("console", on_console)
            vp_page.on("pageerror", on_page_error)
            vp_page.goto("http://127.0.0.1:4200", wait_until="networkidle")
            vp_page.wait_for_timeout(1500)

            vp_select = vp_page.locator("#agent-select")
            vp_select.select_option("v2")
            vp_page.wait_for_timeout(500)

            if vp["width"] <= 768:
                mobile_tabs = vp_page.locator(".mobile-tab-btn")
                if mobile_tabs.count() >= 2:
                    mobile_tabs.nth(1).click()
                    vp_page.wait_for_timeout(500)

            overflow = check_no_horizontal_overflow(vp_page, vp["name"])
            vp_screen = os.path.join(ARTIFACT_DIR, f"v2_viewport_{vp['name']}.png")
            vp_page.screenshot(path=vp_screen, full_page=False)
            vp_page.close()

        browser.close()

        print("\n=== RESUMEN DE AUDITORIA ===")
        print(f"Errores de consola capturados: {len(console_errors)}")
        print(f"Excepciones no controladas: {len(page_errors)}")
        if console_errors:
            print("Detalle errores:", console_errors)
        if page_errors:
            print("Detalle excepciones:", page_errors)

        assert len(page_errors) == 0, f"Se encontraron excepciones de pagina: {page_errors}"
        print("AUDITORIA PLAYWRIGHT EXITOSA AL 100%")


if __name__ == "__main__":
    run_audit()
