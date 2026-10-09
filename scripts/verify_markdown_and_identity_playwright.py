import os
import sys
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\YAMI\.gemini\antigravity-ide\brain\83dd13a3-09f5-475a-9dec-5221efcc702a"


def run_audit() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.goto("http://127.0.0.1:4200", wait_until="networkidle")
        page.wait_for_timeout(2000)

        header_logo = page.locator(".logo-badge").inner_text()
        assert "AEP" in header_logo, f"Logo badge esperado AEP pero fue: {header_logo}"

        page.locator("#agent-select").select_option("v1")
        page.wait_for_timeout(1000)

        chat_input = page.locator("#chat-input")
        send_btn = page.locator("#send-button")

        chat_input.fill("Consulta el ticket TICK-1001 y dime su estado")
        send_btn.click()

        page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
        page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)

        assert page.locator(".markdown-body").count() > 0

        shot1 = os.path.join(ARTIFACT_DIR, "agent_v1_natural_status_desktop.png")
        page.screenshot(path=shot1)
        print(f"[AUDIT] Guardado: {shot1}")

        chat_input.fill("Presenta una tabla Markdown con las columnas Codigo, Titulo, Estado y Prioridad del ticket TICK-1001")
        send_btn.click()

        page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
        page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)

        shot2 = os.path.join(ARTIFACT_DIR, "agent_v1_markdown_table_desktop.png")
        page.screenshot(path=shot2)
        print(f"[AUDIT] Guardado: {shot2}")

        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(1000)

        shot3 = os.path.join(ARTIFACT_DIR, "agent_v1_markdown_mobile_390.png")
        page.screenshot(path=shot3)
        print(f"[AUDIT] Guardado: {shot3}")

        chat_input.fill("Qué es un ticket de soporte técnico?")
        send_btn.click()

        page.locator(".loading-dots").wait_for(state="attached", timeout=10000)
        page.locator(".loading-dots").wait_for(state="detached", timeout=60000)
        page.wait_for_timeout(2000)

        shot4 = os.path.join(ARTIFACT_DIR, "agent_v1_conceptual_mobile_390.png")
        page.screenshot(path=shot4)
        print(f"[AUDIT] Guardado: {shot4}")

        browser.close()


if __name__ == "__main__":
    run_audit()
