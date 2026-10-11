import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

ARTIFACT_DIRS = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests", "e2e_artifacts", "ui3"),
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

AGENTS = ["v1", "v2", "v3"]

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

def run_ui3_validation():
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "viewports_checked": [],
        "agent_checks": {},
        "header_controls": {},
        "overflow_checks": [],
        "measurements_1280": {},
        "screenshots": []
    }

    print("======================================================================")
    print("AEP — VALIDACIÓN OFICIAL UI-3: PLAYWRIGHT & RESPONSIVE LAYOUT")
    print("======================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ------------------------------------------------------------------
        # 1. PRUEBA EXHAUSTIVA DE VIEWPORTS & AGENTES
        # ------------------------------------------------------------------
        for vp in VIEWPORTS:
            vp_name = vp["name"]
            w, h = vp["width"], vp["height"]
            print(f"\n---> Comprobando Viewport: {vp_name} ({w}x{h} px)...")

            page = browser.new_page(viewport={"width": w, "height": h})
            page.goto("http://localhost:4200", wait_until="networkidle")
            page.wait_for_timeout(1000)

            overflow = check_horizontal_overflow(page)
            report["overflow_checks"].append({
                "viewport": vp_name,
                "agent": "v1-initial",
                "overflow": overflow
            })
            if overflow["hasOverflow"]:
                print(f"  [ALERTA DESPLAZAMIENTO] {vp_name}: scrollWidth={overflow['scrollWidth']} > clientWidth={overflow['clientWidth']} (+{overflow['delta']}px)")
            else:
                print(f"  [OK SIN DESPLAZAMIENTO] {vp_name}: scrollWidth={overflow['scrollWidth']} <= clientWidth={overflow['clientWidth']}")

            # Para cada agente en este viewport
            for agent_id in AGENTS:
                agent_select = page.locator("#agent-select")
                agent_select.select_option(agent_id)
                page.wait_for_timeout(600)

                # Tomar captura específica para v3 en cada resolución o para todos en 1280
                ss_name = f"ui3_{vp_name}_{agent_id}"
                paths = save_screenshot(page, ss_name)
                report["screenshots"].append({"name": ss_name, "paths": paths})

                # Si es 1280 px y v3, medir columnas detalladamente
                if vp_name == "desktop_1280" and agent_id == "v3":
                    col_metrics = page.evaluate("""() => {
                        const main = document.querySelector('.playground-main');
                        const chat = document.querySelector('.chat-pane');
                        const inspector = document.querySelector('.inspector-pane');
                        const memory = document.querySelector('.memory-pane');
                        return {
                            mainWidth: main ? main.getBoundingClientRect().width : 0,
                            chatWidth: chat ? chat.getBoundingClientRect().width : 0,
                            inspectorWidth: inspector ? inspector.getBoundingClientRect().width : 0,
                            memoryWidth: memory ? memory.getBoundingClientRect().width : 0,
                            hasChat: !!chat,
                            hasInspector: !!inspector,
                            hasMemory: !!memory
                        };
                    }""")
                    report["measurements_1280"] = col_metrics
                    print(f"  [MÉTRICAS 1280px v3]: Main={col_metrics['mainWidth']:.1f}px | Chat={col_metrics['chatWidth']:.1f}px | Inspector={col_metrics['inspectorWidth']:.1f}px | Memoria={col_metrics['memoryWidth']:.1f}px")
                    assert col_metrics["hasChat"] and col_metrics["hasInspector"] and col_metrics["hasMemory"], "Faltan columnas en 1280px v3"
                    assert col_metrics["chatWidth"] >= 280, "Chat comprimido en 1280px"
                    assert col_metrics["inspectorWidth"] >= 400, "Inspector comprimido en 1280px"
                    assert col_metrics["memoryWidth"] >= 260, "Memoria comprimida en 1280px"

                # Si es tablet (768px) y v3, comprobar que existe el subnav y alternar
                if vp_name == "tablet_768" and agent_id == "v3":
                    subnav_visible = page.locator(".tablet-v3-subnav").is_visible()
                    print(f"  [TABLET 768px SUBNAV]: visible={subnav_visible}")
                    if subnav_visible:
                        # Alternar a memoria
                        mem_btn = page.locator(".tablet-subnav-btn", has_text="Estado y memoria")
                        if mem_btn.is_visible():
                            mem_btn.click()
                            page.wait_for_timeout(300)
                            save_screenshot(page, f"ui3_{vp_name}_v3_memory_tab")
                            # Regresar a inspector
                            insp_btn = page.locator(".tablet-subnav-btn", has_text="Inspector de ejecución")
                            insp_btn.click()
                            page.wait_for_timeout(300)

                # Si es mobile (390px o 360px), comprobar pestañas móviles
                if vp_name in ["mobile_390", "mobile_360"] and agent_id == "v3":
                    mob_toggle = page.locator(".mobile-tabs-toggle").is_visible()
                    print(f"  [MOBILE {vp_name} TABS]: visible={mob_toggle}")
                    # Probar clic en tab Ejecución
                    page.locator(".mobile-tab-btn", has_text="Ejecución").click()
                    page.wait_for_timeout(300)
                    save_screenshot(page, f"ui3_{vp_name}_v3_tab_ejecucion")
                    # Probar clic en tab Memoria
                    page.locator(".mobile-tab-btn", has_text="Memoria").click()
                    page.wait_for_timeout(300)
                    save_screenshot(page, f"ui3_{vp_name}_v3_tab_memoria")
                    # Volver a Conversación
                    page.locator(".mobile-tab-btn", has_text="Conversación").click()
                    page.wait_for_timeout(300)

            page.close()

        # ------------------------------------------------------------------
        # 2. PRUEBA DE CABECERA UNIFICADA & PAUSA VISUAL (1440px)
        # ------------------------------------------------------------------
        print("\n---> Verificando Cabecera Unificada y Controles de Reproducción...")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://localhost:4200", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Seleccionar v3
        page.locator("#agent-select").select_option("v3")
        page.wait_for_timeout(500)

        # Verificar telemetría en cabecera
        env_text = page.locator(".env-status-pill").inner_text()
        print(f"  [TELEMETRÍA CABECERA]: {env_text}")
        report["header_controls"]["telemetry"] = env_text

        # Verificar pastilla inicial EN VIVO
        live_pill = page.locator(".header-status-pill")
        initial_pill_text = live_pill.inner_text()
        print(f"  [ESTADO INICIAL RUNTIME]: {initial_pill_text}")
        report["header_controls"]["initial_state"] = initial_pill_text
        assert "EN VIVO" in initial_pill_text, f"Esperado EN VIVO, recibido: {initial_pill_text}"

        # Comprobar botón Pausar
        pause_btn = page.locator(".btn-pause-ctrl")
        print(f"  [BOTÓN PAUSA]: Texto = '{pause_btn.inner_text().strip()}'")
        pause_btn.click()
        page.wait_for_timeout(400)

        paused_pill_text = page.locator(".header-status-pill").inner_text()
        print(f"  [ESTADO TRAS PAUSA VISUAL]: {paused_pill_text}")
        report["header_controls"]["paused_state"] = paused_pill_text
        assert "PAUSA VISUAL" in paused_pill_text, f"Esperado PAUSA VISUAL, recibido: {paused_pill_text}"

        pause_btn_after = page.locator(".btn-pause-ctrl").inner_text().strip()
        print(f"  [BOTÓN TRAS PAUSA]: Texto = '{pause_btn_after}'")
        assert "Reanudar" in pause_btn_after, f"Esperado Reanudar, recibido: {pause_btn_after}"

        # Guardar captura en estado Pausa Visual
        save_screenshot(page, "ui3_desktop_1440_v3_visual_paused")

        # Reanudar
        page.locator(".btn-pause-ctrl").click()
        page.wait_for_timeout(400)
        resumed_pill_text = page.locator(".header-status-pill").inner_text()
        print(f"  [ESTADO TRAS REANUDAR]: {resumed_pill_text}")
        assert "EN VIVO" in resumed_pill_text, f"Esperado EN VIVO tras reanudar, recibido: {resumed_pill_text}"

        # Guardar captura de estado final
        save_screenshot(page, "ui3_desktop_1440_v3_resumed_live")

        page.close()
        browser.close()

    print("\n======================================================================")
    print("VALIDACIÓN PLAYWRIGHT COMPLETADA EXITOSAMENTE (0 ERRORES)")
    print("======================================================================")
    return report

if __name__ == "__main__":
    report = run_ui3_validation()
    out_json = os.path.join(ARTIFACT_DIRS[0], "ui3_validation_report.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"Reporte JSON guardado en: {out_json}")
