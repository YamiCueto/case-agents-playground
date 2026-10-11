import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

ARTIFACT_DIRS = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests", "e2e_artifacts", "ui5"),
    r"C:\Users\YAMI\.gemini\antigravity-ide\brain\13345f9f-22c0-433e-a9c7-839d00e4334f"
]

for d in ARTIFACT_DIRS:
    os.makedirs(d, exist_ok=True)

VIEWPORTS = [
    {"name": "desktop_1440", "width": 1440, "height": 900},
    {"name": "desktop_1280", "width": 1280, "height": 800},
    {"name": "tablet_768", "width": 768, "height": 1024},
    {"name": "mobile_390", "width": 390, "height": 844},
    {"name": "mobile_360", "width": 360, "height": 800},
]

def save_screenshot(page, base_name):
    saved_paths = []
    for d in ARTIFACT_DIRS:
        dest = os.path.join(d, f"{base_name}.png")
        page.screenshot(path=dest, full_page=False)
        saved_paths.append(dest)
    return saved_paths

def check_horizontal_overflow(page):
    return page.evaluate("""() => {
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
    }""")

def run_ui5_validation():
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "viewports_checked": [],
        "overflow_checks": [],
        "console_errors": [],
        "budget_checks": {},
        "redacted_checks": {},
        "pedagogy_triad_checks": {},
        "decisions_checks": {},
        "timeline_checks": {},
        "screenshots": []
    }

    print("======================================================================")
    print("AEP — VALIDACIÓN OFICIAL UI-5: STATE & MEMORY EXPERIENCE")
    print("======================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--enable-webgl",
                "--use-gl=angle",
                "--use-angle=gl",
                "--enable-features=Vulkan,DefaultANGLEVulkan",
                "--ignore-gpu-blocklist"
            ]
        )

        # ------------------------------------------------------------------
        # 1. VIEWPORTS RUNTIME & RESPONSIVE VALIDATION
        # ------------------------------------------------------------------
        for vp in VIEWPORTS:
            vp_name = vp["name"]
            w, h = vp["width"], vp["height"]
            print(f"\n---> Comprobando Viewport: {vp_name} ({w}x{h} px)...")

            page = browser.new_page(viewport={"width": w, "height": h})
            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

            page.goto("http://localhost:4200", wait_until="networkidle")
            page.wait_for_timeout(1000)

            # Switch to Agent v3
            agent_select = page.locator("#agent-select")
            if agent_select.count() > 0:
                agent_select.select_option("v3")
                page.wait_for_timeout(800)

            # Check overflow
            overflow = check_horizontal_overflow(page)
            report["overflow_checks"].append({
                "viewport": vp_name,
                "agent": "v3",
                "overflow": overflow
            })
            if overflow["hasOverflow"]:
                print(f"  [ALERTA DESPLAZAMIENTO] {vp_name}: scrollWidth={overflow['scrollWidth']} > clientWidth={overflow['clientWidth']} (+{overflow['delta']}px)")
            else:
                print(f"  [OK SIN DESPLAZAMIENTO] {vp_name}: scrollWidth={overflow['scrollWidth']} <= clientWidth={overflow['clientWidth']}")

            # Save screenshot
            paths = save_screenshot(page, f"ui5_state_memory_{vp_name}")
            report["screenshots"].extend(paths)
            report["viewports_checked"].append(vp_name)

            if console_errors:
                report["console_errors"].extend([{"viewport": vp_name, "error": err} for err in console_errors])

            page.close()

        # ------------------------------------------------------------------
        # 2. FUNCTIONAL VERIFICATION OF STATE & MEMORY INSPECTOR (1440x900)
        # ------------------------------------------------------------------
        print("\n---> Verificación Funcional de State & Memory Inspector...")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto("http://localhost:4200", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Select Agent v3
        page.locator("#agent-select").select_option("v3")
        page.wait_for_timeout(800)

        # Check V3MemoryInspector presence
        mem_inspector = page.locator("app-v3-memory-inspector")
        has_inspector = mem_inspector.count() > 0
        print(f"  V3MemoryInspectorComponent presente: {has_inspector}")

        # Check Pedagogical Triad Banner
        triad_banner = page.locator(".pedagogy-triad-card")
        has_triad = triad_banner.count() > 0
        triad_text = triad_banner.text_content() if has_triad else ""
        has_ram_tag = "Estado de Ejecución (RAM)" in triad_text
        has_conv_tag = "Memoria Conversacional" in triad_text
        has_dec_tag = "Memoria de Decisiones" in triad_text

        report["pedagogy_triad_checks"] = {
            "present": has_triad,
            "has_ram": has_ram_tag,
            "has_conv": has_conv_tag,
            "has_decisions": has_dec_tag
        }
        print(f"  Tríada Pedagógica presente: {has_triad} (RAM: {has_ram_tag}, Conv: {has_conv_tag}, Dec: {has_dec_tag})")

        # Check Context Budget Structure
        budget_sec = page.locator(".budget-section")
        has_budget = budget_sec.count() > 0
        estimate_chip = page.locator(".estimate-chip")
        has_estimate_chip = estimate_chip.count() > 0 and "ESTIMADO" in (estimate_chip.text_content() or "")
        limit_chip = page.locator(".limit-chip")
        has_limit_chip = limit_chip.count() > 0

        # Check Absence of REDACTED or NaN in Memory Inspector
        inspector_text = mem_inspector.text_content() or ""
        has_redacted = "***REDACTED***" in inspector_text
        has_nan = "NaN" in inspector_text

        report["redacted_checks"] = {
            "has_redacted_string": has_redacted,
            "has_nan_string": has_nan,
            "passed": not has_redacted and not has_nan
        }
        print(f"  Verificación REDACTED / NaN: REDACTED={has_redacted}, NaN={has_nan} -> {'[PASS]' if not has_redacted and not has_nan else '[FAIL]'}")

        # Execute Live Agent v3 query to verify SSE memory hydration & persistence
        print("\n---> Ejecutando Consulta Real en Agent v3 contra FastAPI y llama.cpp...")
        chat_input = page.locator("#chat-input, textarea.chat-input")
        if chat_input.count() > 0:
            chat_input.fill("Consulta el ticket TICK-1001 y resume su estado y prioridad")
            send_btn = page.locator("#send-button, button.btn-send")
            if send_btn.count() > 0:
                send_btn.click()
                print("  Consulta enviada. Esperando eventos de streaming SSE...")
                
                # Wait for execution to finish and persist turn in MySQL
                try:
                    page.wait_for_selector(".persistence-node", timeout=25000)
                    print("  [OK] Evento TURN_PERSISTED confirmado y renderizado en timeline.")
                except Exception:
                    print("  [TIMEOUT ESPERANDO TURN_PERSISTED] Esperando hasta 12s adicionales...")
                    page.wait_for_timeout(12000)

                # Re-check Memory Inspector with hydrated/live state
                post_text = mem_inspector.text_content() or ""
                has_post_redacted = "***REDACTED***" in post_text
                has_post_nan = "NaN" in post_text
                
                # Check segmented bar segments
                seg_system = page.locator(".seg-system")
                seg_dec = page.locator(".seg-decisions")
                seg_hist = page.locator(".seg-history")
                seg_query = page.locator(".seg-query")
                seg_avail = page.locator(".seg-available")

                segments_ok = (seg_system.count() > 0 and 
                               seg_dec.count() > 0 and 
                               seg_hist.count() > 0 and 
                               seg_query.count() > 0 and 
                               seg_avail.count() > 0)

                print(f"  Segmentos de barra Stitch presentes: {segments_ok}")
                print(f"  Verificación Post-Ejecución REDACTED: {has_post_redacted}, NaN: {has_post_nan}")

                # Check Decisions and Provenance
                dec_sec = page.locator(".decisions-section")
                dec_cards = page.locator(".decision-chip-card")
                print(f"  Tarjetas de decisiones activas renderizadas: {dec_cards.count()}")

                # Check Timeline Events
                timeline = page.locator(".timeline-section")
                hydration_nodes = page.locator(".hydration-node")
                persisted_nodes = page.locator(".persistence-node")
                print(f"  Nodos de hidratación: {hydration_nodes.count()}, Nodos de persistencia: {persisted_nodes.count()}")

                report["budget_checks"] = {
                    "has_budget": has_budget,
                    "has_estimate_chip": has_estimate_chip,
                    "has_limit_chip": has_limit_chip,
                    "segments_present": segments_ok,
                    "post_redacted": has_post_redacted,
                    "post_nan": has_post_nan
                }

                report["decisions_checks"] = {
                    "count": dec_cards.count(),
                    "section_present": dec_sec.count() > 0
                }

                report["timeline_checks"] = {
                    "hydration_count": hydration_nodes.count(),
                    "persisted_count": persisted_nodes.count()
                }

                # Capture post-query state screenshot
                paths = save_screenshot(page, "ui5_agent_v3_live_hydrated_memory")
                report["screenshots"].extend(paths)

        page.close()
        browser.close()

    # Save JSON report
    report_path = os.path.join(ARTIFACT_DIRS[0], "ui5_validation_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print("\n======================================================================")
    print(f"Reporte de validación Playwright guardado en: {report_path}")
    print("======================================================================")
    return report

if __name__ == "__main__":
    run_ui5_validation()
