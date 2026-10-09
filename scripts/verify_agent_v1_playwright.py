import os
import sys
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\YAMI\.gemini\antigravity-ide\brain\83dd13a3-09f5-475a-9dec-5221efcc702a"


def run_verification() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.goto("http://127.0.0.1:4200", wait_until="networkidle")
        page.wait_for_timeout(2000)

        agent_select = page.locator("#agent-select")
        agent_select.select_option("v1")
        page.wait_for_timeout(1000)

        chat_input = page.locator("#chat-input")
        send_btn = page.locator("#send-button")

        chat_input.fill("Consulta el ticket TICK-1001 y dime su estado")
        send_btn.click()

        page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
        page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)

        screenshot_v1_path = os.path.join(ARTIFACT_DIR, "agent_v1_tool_calling_success.png")
        page.screenshot(path=screenshot_v1_path)
        print(f"[VERIFIED] Screenshot 1 guardado en: {screenshot_v1_path}")

        events_tab_btn = page.locator(".tabs-bar button:has-text('Eventos Raw')")
        events_tab_btn.click()
        page.wait_for_timeout(1000)

        screenshot_raw_path = os.path.join(ARTIFACT_DIR, "agent_v1_raw_events_separation.png")
        page.screenshot(path=screenshot_raw_path)
        print(f"[VERIFIED] Screenshot Raw Events guardado en: {screenshot_raw_path}")

        hops_tab_btn = page.locator(".tabs-bar button:has-text('7 Hops')")
        hops_tab_btn.click()
        page.wait_for_timeout(500)

        chat_input.fill("Que es un ticket de soporte tecnico en terminos generales?")
        send_btn.click()

        page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
        page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)

        screenshot_conceptual_path = os.path.join(ARTIFACT_DIR, "agent_v1_conceptual_skipped_hops.png")
        page.screenshot(path=screenshot_conceptual_path)
        print(f"[VERIFIED] Screenshot Conceptual guardado en: {screenshot_conceptual_path}")

        browser.close()


if __name__ == "__main__":
    run_verification()
