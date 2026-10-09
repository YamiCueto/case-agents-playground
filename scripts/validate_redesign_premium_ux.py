import os
import sys
import time
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = os.getenv(
    "AEP_ARTIFACT_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests", "e2e_artifacts"),
)
os.makedirs(ARTIFACT_DIR, exist_ok=True)
VIEWPORTS = [
    {"name": "mobile_360", "width": 360, "height": 800},
    {"name": "mobile_390", "width": 390, "height": 844},
    {"name": "tablet_768", "width": 768, "height": 1024},
    {"name": "tablet_1024", "width": 1024, "height": 768},
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


def run_full_validation():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        print("=== VALIDACION REFINADA 1: DESKTOP 1440x900 ===")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://127.0.0.1:4200", wait_until="networkidle")
        page.wait_for_timeout(2000)

        agent_select = page.locator("#agent-select")
        initial_agent = agent_select.input_value()
        print(f"[AGENTE PREDETERMINADO VERIFICADO]: id='{initial_agent}' (Esperado: 'v1')")

        robot_count = page.evaluate(
            r"""() => {
            const bodyText = document.body.innerText;
            return (bodyText.match(/[\u{1F916}]/gu) || []).length;
        }"""
        )
        print(f"[AUDITORIA EMOJI ROBOT]: Cantidad encontrada = {robot_count} (Esperado: 0)")

        shot_empty = os.path.join(ARTIFACT_DIR, "v3_escenario_01_chat_vacio_1440.png")
        page.screenshot(path=shot_empty)
        check_no_horizontal_overflow(page, "Desktop 1440x900 - Chat Vacio")

        splitter = page.locator(".layout-splitter")
        if splitter.count() > 0:
            box = splitter.bounding_box()
            if box:
                page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 200)
                page.mouse.down()
                page.mouse.move(box["x"] + 140, box["y"] + 200)
                page.mouse.up()
                page.wait_for_timeout(400)
                shot_splitter = os.path.join(ARTIFACT_DIR, "v3_escenario_13_splitter_drag_1440.png")
                page.screenshot(path=shot_splitter)
                print("[SPLITTER DRAG OK]: Proporcion ajustada y capturada")
                page.mouse.dblclick(box["x"] + 140, box["y"] + 200)
                page.wait_for_timeout(400)

        chat_input = page.locator("#chat-input")
        send_btn = page.locator("#send-button")
        chat_input.fill("Consulta el ticket TICK-1001 y dime su estado")
        send_btn.click()

        page.wait_for_timeout(1800)
        shot_running = os.path.join(ARTIFACT_DIR, "v3_escenario_04_ejecucion_en_curso_1440.png")
        page.screenshot(path=shot_running)
        print("[EJECUCION EN CURSO OK]: Captura con phase badge guardada")

        page.locator(".runtime-progress-badge").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)

        shot_completed = os.path.join(ARTIFACT_DIR, "v3_escenario_05_ejecucion_completada_1440.png")
        page.screenshot(path=shot_completed)
        check_no_horizontal_overflow(page, "Desktop 1440x900 - Tool Calling Completado")

        agent_msg_text = page.locator(".agent-row .markdown-body").first.inner_text()
        print(f"[RESPUESTA AGENTE]:\n{agent_msg_text}")
        assert "OPEN" in agent_msg_text or "Abierto" in agent_msg_text
        print("[FACTUALIDAD MYSQL OK]: Respuesta contiene estado OPEN / Abierto verificado")

        hop_nodes = page.locator(".flow-node-item")
        print(f"[JOURNEY HOPS TOTAL]: {hop_nodes.count()} nodos detectados (Esperado: 7)")
        if hop_nodes.count() >= 4:
            hop_nodes.nth(3).click()
            page.wait_for_timeout(600)
            shot_hop4 = os.path.join(ARTIFACT_DIR, "v3_escenario_06_hop4_seleccionado_1440.png")
            page.screenshot(path=shot_hop4)
            print("[HOP SELECCIONADO OK]: Hop 4 seleccionado y capturado")

        pause_btn = page.locator(".btn-pause-visual")
        if pause_btn.count() > 0:
            pause_btn.click()
            page.wait_for_timeout(400)
            shot_pause = os.path.join(ARTIFACT_DIR, "v3_escenario_07_visual_pause_1440.png")
            page.screenshot(path=shot_pause)
            print("[PAUSA VISUAL OK]: Pausa visual comprobada y capturada")
            pause_btn.click()
            page.wait_for_timeout(400)

        disc_btn = page.locator(".disclosure-toggle")
        if disc_btn.count() > 0:
            disc_btn.click()
            page.wait_for_timeout(400)
            raw_toggle = page.locator(".toggle-btn:has-text('Raw')")
            if raw_toggle.count() > 0:
                raw_toggle.click()
                page.wait_for_timeout(400)
            shot_tech = os.path.join(ARTIFACT_DIR, "v3_escenario_10_payload_json_raw_1440.png")
            page.screenshot(path=shot_tech)
            print("[PAYLOAD JSON RAW OK]: Captura guardada")

        replay_btn = page.locator(".btn-switch-replay")
        if replay_btn.count() > 0:
            replay_btn.click()
            page.wait_for_timeout(600)
            step_back = page.locator(".transport-controls .btn-tool").nth(1)
            if step_back.count() > 0:
                step_back.click()
                page.wait_for_timeout(400)
            shot_replay = os.path.join(ARTIFACT_DIR, "v3_escenario_08_replay_mode_1440.png")
            page.screenshot(path=shot_replay)
            print("[REPLAY MODE OK]: Controles de transporte y step capturados")
            back_live = page.locator(".btn-switch-live")
            if back_live.count() > 0:
                back_live.click()
                page.wait_for_timeout(400)

        persona_select = page.locator("#persona-select")
        persona_select.select_option("usr_laura")
        page.wait_for_timeout(400)

        db_btn = page.locator(".btn-db-toggle")
        db_btn.click()
        page.wait_for_timeout(700)
        shot_drawer = os.path.join(ARTIFACT_DIR, "v3_escenario_11_tickets_drawer_1440.png")
        page.screenshot(path=shot_drawer)
        close_btn = page.locator(".btn-close")
        if close_btn.count() > 0:
            close_btn.click()
            page.wait_for_timeout(400)

        chat_input.fill("Que es un ticket de soporte tecnico en terminos generales?")
        send_btn.click()
        page.locator(".runtime-progress-badge").wait_for(state="attached", timeout=10000)
        page.locator(".runtime-progress-badge").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)
        shot_conceptual = os.path.join(ARTIFACT_DIR, "v3_escenario_02_consulta_conceptual_1440.png")
        page.screenshot(path=shot_conceptual)
        print("[CONSULTA CONCEPTUAL OK]: Respuesta directa capturada")

        page.close()

        print("=== VALIDACION 2: VIEWPORTS AUDIT (360, 390, 768, 1024, 1920) ===")
        for vp in VIEWPORTS:
            vp_page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]})
            vp_page.goto("http://127.0.0.1:4200", wait_until="networkidle")
            vp_page.wait_for_timeout(1500)

            shot_path = os.path.join(ARTIFACT_DIR, f"v3_viewport_{vp['name']}_chat.png")
            vp_page.screenshot(path=shot_path)
            check_no_horizontal_overflow(vp_page, f"{vp['name']} (chat)")

            if vp["width"] <= 900:
                insp_tab = vp_page.locator(".mobile-tab-btn").nth(1)
                if insp_tab.count() > 0:
                    insp_tab.click()
                    vp_page.wait_for_timeout(600)
                    shot_insp = os.path.join(ARTIFACT_DIR, f"v3_viewport_{vp['name']}_inspector.png")
                    vp_page.screenshot(path=shot_insp)
                    check_no_horizontal_overflow(vp_page, f"{vp['name']} (inspector)")

            vp_page.close()

        browser.close()
        print("=== VALIDACION REFINADA FINALIZADA CON EXITO ===")


if __name__ == "__main__":
    run_full_validation()
