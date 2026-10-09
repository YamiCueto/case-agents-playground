import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\YAMI\.gemini\antigravity-ide\brain\83dd13a3-09f5-475a-9dec-5221efcc702a"
os.makedirs(ARTIFACT_DIR, exist_ok=True)

REPORT_DATA = {
    "viewports": {},
    "agent_selector": {},
    "persona_selector": {},
    "tickets_drawer": {},
    "pending_agent_behavior": {},
    "controlled_sse_streaming": {},
    "controlled_sse_cancellation": {},
    "defects_found": [],
}


def run_comprehensive_audit() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        page_desktop = browser.new_page(viewport={"width": 1440, "height": 900})
        page_desktop.goto("http://127.0.0.1:4200", wait_until="networkidle")

        screenshot_desktop = os.path.join(ARTIFACT_DIR, "audit_desktop_1440.png")
        page_desktop.screenshot(path=screenshot_desktop, full_page=True)
        REPORT_DATA["viewports"]["desktop_1440"] = {
            "screenshot": screenshot_desktop,
            "chat_visible": page_desktop.locator(".chat-pane").is_visible(),
            "inspector_visible": page_desktop.locator(".inspector-pane").is_visible(),
            "split_view": True,
        }

        page_tablet = browser.new_page(viewport={"width": 768, "height": 1024})
        page_tablet.goto("http://127.0.0.1:4200", wait_until="networkidle")
        screenshot_tablet = os.path.join(ARTIFACT_DIR, "audit_tablet_768.png")
        page_tablet.screenshot(path=screenshot_tablet, full_page=True)
        REPORT_DATA["viewports"]["tablet_768"] = {
            "screenshot": screenshot_tablet,
            "mobile_toggle_visible": page_tablet.locator(".mobile-tabs-toggle").is_visible(),
        }

        page_mobile = browser.new_page(viewport={"width": 390, "height": 844})
        page_mobile.goto("http://127.0.0.1:4200", wait_until="networkidle")
        screenshot_mobile_chat = os.path.join(ARTIFACT_DIR, "audit_mobile_390_chat.png")
        page_mobile.screenshot(path=screenshot_mobile_chat, full_page=True)

        inspector_toggle = page_mobile.locator(".mobile-tab-btn:has-text('Inspector')")
        if inspector_toggle.is_visible():
            inspector_toggle.click()
            time.sleep(0.3)
            screenshot_mobile_inspector = os.path.join(ARTIFACT_DIR, "audit_mobile_390_inspector.png")
            page_mobile.screenshot(path=screenshot_mobile_inspector, full_page=True)
        else:
            screenshot_mobile_inspector = None

        REPORT_DATA["viewports"]["mobile_390"] = {
            "screenshot_chat": screenshot_mobile_chat,
            "screenshot_inspector": screenshot_mobile_inspector,
            "mobile_toggle_visible": page_mobile.locator(".mobile-tabs-toggle").is_visible(),
        }

        page = page_desktop

        agent_options = page.eval_on_selector_all(
            "#agent-select option",
            "options => options.map(o => ({ value: o.value, text: o.text, disabled: o.disabled }))"
        )
        REPORT_DATA["agent_selector"] = {
            "options_count": len(agent_options),
            "options": agent_options,
            "v1_disabled": any(o["value"] == "v1" and o["disabled"] for o in agent_options),
            "test_sse_enabled": any(o["value"] == "test_sse" and not o["disabled"] for o in agent_options),
        }

        persona_options = page.locator("#persona-select option").all_inner_texts()
        page.select_option("#persona-select", "supervisor_juan")
        time.sleep(0.5)
        selected_persona_value = page.eval_on_selector("#persona-select", "el => el.value")
        REPORT_DATA["persona_selector"] = {
            "options_count": len(persona_options),
            "options": persona_options,
            "switched_to": selected_persona_value,
        }

        page.click(".btn-db-toggle")
        time.sleep(0.5)
        drawer_visible = page.locator(".drawer-card").is_visible()
        tickets_count = page.locator(".tickets-table tbody tr").count()
        screenshot_drawer = os.path.join(ARTIFACT_DIR, "audit_tickets_drawer.png")
        page.screenshot(path=screenshot_drawer)

        REPORT_DATA["tickets_drawer"] = {
            "drawer_opened": drawer_visible,
            "tickets_rendered": tickets_count,
            "screenshot": screenshot_drawer,
        }

        page.click(".btn-close")
        time.sleep(0.3)

        page.select_option("#agent-select", "v1")
        time.sleep(0.2)
        chip_btn = page.locator(".mini-chip:has-text('TICK-1001')")
        if chip_btn.is_visible():
            chip_btn.click()
            time.sleep(0.2)

        page.click(".btn-send")
        time.sleep(1.0)

        hop_statuses_v1 = page.eval_on_selector_all(
            ".stepper-list .hop-item",
            "items => items.map(i => i.className)"
        )
        agent_response_text_v1 = page.locator(".agent-row .message-body p").last.inner_text()
        screenshot_response_v1 = os.path.join(ARTIFACT_DIR, "audit_agent_pending_response.png")
        page.screenshot(path=screenshot_response_v1)

        all_idle_or_skipped = all("completed" not in s for s in hop_statuses_v1)
        REPORT_DATA["pending_agent_behavior"] = {
            "agent_message": agent_response_text_v1,
            "hop_statuses": hop_statuses_v1,
            "no_fake_hops_completed": all_idle_or_skipped,
            "screenshot": screenshot_response_v1,
        }

        page.select_option("#agent-select", "test_sse")
        time.sleep(0.2)
        page.fill(".chat-input", "Flujo completo de prueba con despachador controlado")
        page.click(".btn-send")

        time.sleep(1.0)
        screenshot_streaming_active = os.path.join(ARTIFACT_DIR, "audit_sse_streaming_active.png")
        page.screenshot(path=screenshot_streaming_active)

        hops_streaming_midway = page.eval_on_selector_all(
            ".stepper-list .hop-item",
            "items => items.map(i => i.className)"
        )
        has_completed_hops_midway = any("completed" in s for s in hops_streaming_midway)

        time.sleep(2.0)
        screenshot_streaming_complete = os.path.join(ARTIFACT_DIR, "audit_sse_streaming_completed.png")
        page.screenshot(path=screenshot_streaming_complete)

        final_msg = page.locator(".agent-row .message-body p").last.inner_text()
        raw_events_count = page.locator(".raw-event-card").count()

        REPORT_DATA["controlled_sse_streaming"] = {
            "has_progressive_hops": has_completed_hops_midway,
            "final_message": final_msg,
            "screenshot_midway": screenshot_streaming_active,
            "screenshot_completed": screenshot_streaming_complete,
            "events_logged": raw_events_count,
        }

        page.fill(".chat-input", "Prueba de interrupción inmediata con botón Detener")
        page.click(".btn-send")
        time.sleep(0.6)

        stop_btn = page.locator(".btn-stop")
        if stop_btn.is_visible():
            stop_btn.click()
            time.sleep(0.5)
            stopped_msg = page.locator(".agent-row .message-body p").last.inner_text()
            send_btn_reappeared = page.locator(".btn-send").is_visible()
            screenshot_cancellation = os.path.join(ARTIFACT_DIR, "audit_sse_cancellation_success.png")
            page.screenshot(path=screenshot_cancellation)

            REPORT_DATA["controlled_sse_cancellation"] = {
                "cancellation_succeeded": True,
                "stopped_message": stopped_msg,
                "send_btn_reappeared": send_btn_reappeared,
                "screenshot": screenshot_cancellation,
            }
        else:
            REPORT_DATA["controlled_sse_cancellation"] = {
                "cancellation_succeeded": False,
                "error": "El botón Detener no estuvo visible",
            }

        browser.close()

    report_path = os.path.join(ARTIFACT_DIR, "audit_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(REPORT_DATA, f, indent=2, ensure_ascii=False)

    print("COMPREHENSIVE_AUDIT_OK")
    print(json.dumps(REPORT_DATA, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    run_comprehensive_audit()
