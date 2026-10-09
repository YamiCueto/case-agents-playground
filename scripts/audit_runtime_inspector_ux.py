import os
import sys
import time
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\YAMI\.gemini\antigravity-ide\brain\83dd13a3-09f5-475a-9dec-5221efcc702a"
VIEWPORTS = [
    {"name": "mobile_360", "width": 360, "height": 800},
    {"name": "mobile_390", "width": 390, "height": 844},
    {"name": "tablet_768", "width": 768, "height": 1024},
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


def audit_full_experience():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        print("=== ESCENARIO 1 & 5: Tool Calling Real, Replay Mode y Wrapped/Raw en 1440x900 ===")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://127.0.0.1:4200", wait_until="networkidle")
        page.wait_for_timeout(2000)

        agent_select = page.locator("#agent-select")
        agent_select.select_option("v1")
        page.wait_for_timeout(500)

        chat_input = page.locator("#chat-input")
        send_btn = page.locator("#send-button")

        chat_input.fill("Consulta el ticket TICK-1001 y dime su estado")
        send_btn.click()

        page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
        page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2500)

        s1_path = os.path.join(ARTIFACT_DIR, "audit_1440_tool_calling_journey.png")
        page.screenshot(path=s1_path, full_page=False)
        print(f"[CAPTURA] Escenario 1 guardado: {s1_path}")
        check_no_horizontal_overflow(page, "1440 Tool Calling Final")

        disclosure_btn = page.locator(".disclosure-toggle")
        if disclosure_btn.count() > 0:
            disclosure_btn.first.click()
            page.wait_for_timeout(800)
            s1_tech_path = os.path.join(ARTIFACT_DIR, "audit_1440_technical_payload_wrapped.png")
            page.screenshot(path=s1_tech_path, full_page=False)
            check_no_horizontal_overflow(page, "1440 Technical Wrapped")

            raw_btn = page.locator(".btn-mode:has-text('Raw')")
            if raw_btn.count() > 0:
                raw_btn.first.click()
                page.wait_for_timeout(800)
                s1_raw_path = os.path.join(ARTIFACT_DIR, "audit_1440_technical_payload_raw.png")
                page.screenshot(path=s1_raw_path, full_page=False)
                check_no_horizontal_overflow(page, "1440 Technical Raw")

        replay_btn = page.locator(".btn-switch-replay")
        if replay_btn.count() > 0:
            replay_btn.first.click()
            page.wait_for_timeout(1000)

            step_back_btn = page.locator(".btn-tool:has-text('⏮')")
            if step_back_btn.count() > 0:
                step_back_btn.first.click()
                page.wait_for_timeout(500)
                step_back_btn.first.click()
                page.wait_for_timeout(500)

            speed_2x = page.locator(".btn-speed:has-text('2x')")
            if speed_2x.count() > 0:
                speed_2x.first.click()
                page.wait_for_timeout(300)

            s_replay_path = os.path.join(ARTIFACT_DIR, "audit_1440_replay_mode.png")
            page.screenshot(path=s_replay_path, full_page=False)
            print(f"[CAPTURA] Escenario 5 Replay guardado: {s_replay_path}")

            node_hop2 = page.locator(".flow-node:has-text('HOP 2')")
            if node_hop2.count() > 0:
                node_hop2.first.click()
                page.wait_for_timeout(500)
                s_hop2_path = os.path.join(ARTIFACT_DIR, "audit_1440_replay_node_jump.png")
                page.screenshot(path=s_hop2_path, full_page=False)

            live_btn = page.locator(".btn-switch-live")
            if live_btn.count() > 0:
                live_btn.first.click()
                page.wait_for_timeout(500)

        page.close()

        print("=== ESCENARIO 2: Consulta Conceptual sin Herramientas ===")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://127.0.0.1:4200", wait_until="networkidle")
        page.wait_for_timeout(1500)

        page.locator("#agent-select").select_option("v1")
        chat_input = page.locator("#chat-input")
        send_btn = page.locator("#send-button")

        chat_input.fill("Que es un ticket de soporte tecnico en terminos generales?")
        send_btn.click()

        page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
        page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)

        s2_path = os.path.join(ARTIFACT_DIR, "audit_conceptual_skipped_hops.png")
        page.screenshot(path=s2_path, full_page=False)
        print(f"[CAPTURA] Escenario 2 Conceptual guardado: {s2_path}")
        check_no_horizontal_overflow(page, "1440 Conceptual Direct Answer")
        page.close()

        print("=== AUDITORÍA RESPONSIVE EN 5 VIEWPORTS ===")
        for vp in VIEWPORTS:
            page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]})
            page.goto("http://127.0.0.1:4200", wait_until="networkidle")
            page.wait_for_timeout(1500)

            page.locator("#agent-select").select_option("v1")
            chat_input = page.locator("#chat-input")
            send_btn = page.locator("#send-button")

            chat_input.fill("Consulta el ticket TICK-1002")
            send_btn.click()

            page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
            page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
            page.wait_for_timeout(2000)

            check_no_horizontal_overflow(page, f"Viewport {vp['name']} Chat")

            inspector_tab = page.locator(".mobile-tab-btn:has-text('Inspector')")
            if inspector_tab.count() > 0 and inspector_tab.is_visible():
                mobile_chat_path = os.path.join(ARTIFACT_DIR, f"audit_viewport_{vp['name']}_{vp['width']}x{vp['height']}_chat.png")
                page.screenshot(path=mobile_chat_path, full_page=False)

                inspector_tab.click()
                page.wait_for_timeout(800)

            vp_path = os.path.join(ARTIFACT_DIR, f"audit_viewport_{vp['name']}_{vp['width']}x{vp['height']}_inspector.png")
            page.screenshot(path=vp_path, full_page=False)
            print(f"[CAPTURA] Viewport {vp['name']} guardado: {vp_path}")
            check_no_horizontal_overflow(page, f"Viewport {vp['name']} Inspector")

            disc = page.locator(".disclosure-toggle")
            if disc.count() > 0:
                try:
                    page.locator(".inspector-content").evaluate("el => el.scrollTop = el.scrollHeight")
                    page.wait_for_timeout(300)
                    disc.first.click(timeout=5000)
                    page.wait_for_timeout(500)
                    vp_disc_path = os.path.join(ARTIFACT_DIR, f"audit_viewport_{vp['name']}_disclosure.png")
                    page.screenshot(path=vp_disc_path, full_page=False)
                    check_no_horizontal_overflow(page, f"Viewport {vp['name']} Disclosure")
                except Exception as e:
                    print(f"[NOTE] Disclosure click on {vp['name']}: {e}")

            page.close()

        print("=== ESCENARIO 4 & 6: Cancelación y Pausa Visual ===")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://127.0.0.1:4200", wait_until="networkidle")
        page.wait_for_timeout(1500)

        page.locator("#agent-select").select_option("v1")
        pause_btn = page.locator(".btn-pause-visual")
        if pause_btn.count() > 0:
            pause_btn.first.click()
            page.wait_for_timeout(500)
            s_pause_path = os.path.join(ARTIFACT_DIR, "audit_visual_pause_active.png")
            page.screenshot(path=s_pause_path, full_page=False)
            print(f"[CAPTURA] Pausa visual activa: {s_pause_path}")
            pause_btn.first.click()
            page.wait_for_timeout(500)

        chat_input = page.locator("#chat-input")
        send_btn = page.locator("#send-button")
        chat_input.fill("Consulta el ticket TICK-1003 y analiza su urgencia")
        send_btn.click()

        cancel_btn = page.locator("#cancel-button")
        try:
            cancel_btn.wait_for(state="visible", timeout=3000)
            cancel_btn.click()
            page.wait_for_timeout(1500)
            s_cancel_path = os.path.join(ARTIFACT_DIR, "audit_cancellation_sse.png")
            page.screenshot(path=s_cancel_path, full_page=False)
            print(f"[CAPTURA] Cancelación SSE: {s_cancel_path}")
        except Exception as e:
            print(f"[NOTE] Cancel test note: {e}")

        print("=== ESCENARIO 8: Navegación por Teclado ===")
        page.keyboard.press("Tab")
        page.keyboard.press("Tab")
        page.keyboard.press("Tab")
        page.wait_for_timeout(300)
        s_keyboard_path = os.path.join(ARTIFACT_DIR, "audit_keyboard_navigation.png")
        page.screenshot(path=s_keyboard_path, full_page=False)
        print(f"[CAPTURA] Teclado: {s_keyboard_path}")

        page.close()
        browser.close()
        print("=== AUDITORÍA COMPLETA FINALIZADA CON ÉXITO ===")


if __name__ == "__main__":
    audit_full_experience()
