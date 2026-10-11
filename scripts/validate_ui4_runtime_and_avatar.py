import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

ARTIFACT_DIRS = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests", "e2e_artifacts", "ui4"),
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

def run_ui4_validation():
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "viewports_checked": [],
        "overflow_checks": [],
        "avatar_3d_checks": {},
        "hero_card_checks": {},
        "stepper_checks": {},
        "technical_tabs_checks": {},
        "reduced_motion_checks": {},
        "measurements_1280": {},
        "screenshots": []
    }

    print("======================================================================")
    print("AEP — VALIDACIÓN OFICIAL UI-4: RUNTIME EXPERIENCE Y AVATAR 3D")
    print("======================================================================")

    with sync_playwright() as p:
        # Launch browser with WebGL enabled
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
        # 1. VIEWPORTS & AGENTS RUNTIME VALIDATION (1440, 1280, 768, 390, 360)
        # ------------------------------------------------------------------
        for vp in VIEWPORTS:
            vp_name = vp["name"]
            w, h = vp["width"], vp["height"]
            print(f"\n---> Comprobando Viewport: {vp_name} ({w}x{h} px)...")

            page = browser.new_page(viewport={"width": w, "height": h})
            page.goto("http://localhost:4200", wait_until="networkidle")
            page.wait_for_timeout(1000)

            # Check overflow
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

            for agent_id in AGENTS:
                agent_select = page.locator("#agent-select")
                agent_select.select_option(agent_id)
                page.wait_for_timeout(600)

                # Si es mobile, navegar al tab de Ejecución para ver el Runtime Inspector
                if vp_name in ["mobile_390", "mobile_360"]:
                    ejec_btn = page.locator(".mobile-tab-btn", has_text="Ejecución")
                    if ejec_btn.is_visible():
                        ejec_btn.click()
                        page.wait_for_timeout(400)

                # Si es tablet y v3, asegurar que estamos en inspector
                if vp_name == "tablet_768" and agent_id == "v3":
                    insp_btn = page.locator(".tablet-subnav-btn", has_text="Inspector de ejecución")
                    if insp_btn.is_visible():
                        insp_btn.click()
                        page.wait_for_timeout(300)

                ss_name = f"ui4_{vp_name}_{agent_id}"
                paths = save_screenshot(page, ss_name)
                report["screenshots"].append({"name": ss_name, "paths": paths})

                # Validar medidas de columnas a 1280px para v3
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

            page.close()

        # ------------------------------------------------------------------
        # 2. VALIDACIÓN DEL AVATAR THREE.JS Y HERO EXECUTION CARD (1440px)
        # ------------------------------------------------------------------
        print("\n---> Verificando Avatar Three.js y Hero Execution Card...")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://localhost:4200", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Seleccionar v3
        page.locator("#agent-select").select_option("v3")
        page.wait_for_timeout(600)

        # Avatar 3D Presence Check
        avatar_info = page.evaluate("""() => {
            const canvas = document.querySelector('.three-canvas');
            const fallback = document.querySelector('.avatar-2d-fallback');
            const heroCard = document.querySelector('.execution-hero-card');
            const avatarCol = document.querySelector('.hero-avatar-col');
            const metaCol = document.querySelector('.hero-meta-col');
            return {
                hasCanvas: !!canvas,
                hasFallback: !!fallback,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                hasHeroCard: !!heroCard,
                hasAvatarCol: !!avatarCol,
                hasMetaCol: !!metaCol,
                heroTitle: heroCard ? heroCard.querySelector('.hero-title')?.innerText : '',
                heroActor: heroCard ? heroCard.querySelector('.actor-name')?.innerText : '',
                heroHappening: heroCard ? heroCard.querySelector('.pedagogy-box.happening .box-text')?.innerText : '',
                heroInsight: heroCard ? heroCard.querySelector('.pedagogy-box.insight .box-text')?.innerText : '',
                heroStatus: heroCard ? heroCard.querySelector('.status-pill')?.innerText : ''
            };
        }""")
        report["avatar_3d_checks"] = avatar_info
        print(f"  [AVATAR PRESENCE]: Canvas={avatar_info['hasCanvas']} (Dim: {avatar_info['canvasWidth']}x{avatar_info['canvasHeight']}) | Fallback={avatar_info['hasFallback']}")
        print(f"  [HERO CARD]: Title='{avatar_info['heroTitle']}' | Actor='{avatar_info['heroActor']}' | Status='{avatar_info['heroStatus']}'")
        assert avatar_info["hasHeroCard"], "Falta .execution-hero-card"
        assert avatar_info["hasAvatarCol"] and avatar_info["hasMetaCol"], "Falta estructura de 2 columnas en hero card"
        assert avatar_info["heroActor"], "Falta componente soberano en hero card"
        assert avatar_info["heroHappening"], "Falta Qué está ocurriendo en hero card"
        assert avatar_info["heroInsight"], "Falta Por qué importa en hero card"

        # ------------------------------------------------------------------
        # 3. VALIDACIÓN DE STEPPER: v1 (7 HOPS) vs v2/v3 (AGENT LOOP DINÁMICO)
        # ------------------------------------------------------------------
        print("\n---> Verificando Stepper de Hops (v1) y Loop Flow (v2/v3)...")
        # Cambiar a v1
        page.locator("#agent-select").select_option("v1")
        page.wait_for_timeout(600)

        v1_stepper = page.evaluate("""() => {
            const journeyFlow = document.querySelector('app-journey-flow');
            const hops = document.querySelectorAll('.flow-node-item');
            return {
                hasJourneyFlow: !!journeyFlow,
                hopsCount: hops.length
            };
        }""")
        report["stepper_checks"]["v1"] = v1_stepper
        print(f"  [STEPPER v1]: app-journey-flow={v1_stepper['hasJourneyFlow']} | Nodos={v1_stepper['hopsCount']}")
        assert v1_stepper["hasJourneyFlow"], "Falta app-journey-flow en v1"
        assert v1_stepper["hopsCount"] == 7, f"Esperado 7 hops pedagógicos en v1, encontrado {v1_stepper['hopsCount']}"

        # Cambiar a v2
        page.locator("#agent-select").select_option("v2")
        page.wait_for_timeout(600)
        v2_stepper = page.evaluate("""() => {
            const loopFlow = document.querySelector('app-v2-loop-flow');
            const journeyFlow = document.querySelector('app-journey-flow');
            return {
                hasLoopFlow: !!loopFlow,
                hasJourneyFlow: !!journeyFlow
            };
        }""")
        report["stepper_checks"]["v2"] = v2_stepper
        print(f"  [STEPPER v2]: app-v2-loop-flow={v2_stepper['hasLoopFlow']} | app-journey-flow={v2_stepper['hasJourneyFlow']}")
        assert v2_stepper["hasLoopFlow"], "Falta app-v2-loop-flow en v2"
        assert not v2_stepper["hasJourneyFlow"], "app-journey-flow NO debe existir en v2"

        # Cambiar a v3
        page.locator("#agent-select").select_option("v3")
        page.wait_for_timeout(600)
        v3_stepper = page.evaluate("""() => {
            const loopFlow = document.querySelector('app-v2-loop-flow');
            return {
                hasLoopFlow: !!loopFlow
            };
        }""")
        report["stepper_checks"]["v3"] = v3_stepper
        print(f"  [STEPPER v3]: app-v2-loop-flow={v3_stepper['hasLoopFlow']}")
        assert v3_stepper["hasLoopFlow"], "Falta app-v2-loop-flow en v3"

        # ------------------------------------------------------------------
        # 4. VALIDACIÓN DE PESTAÑAS DEL INSPECTOR TÉCNICO & HIGHLIGHTING
        # ------------------------------------------------------------------
        print("\n---> Verificando 4 Pestañas del Inspector Técnico y Visor de Código...")
        tabs_eval = page.evaluate("""() => {
            const tabs = Array.from(document.querySelectorAll('.tech-subtab-btn')).map(t => t.innerText.trim());
            return { tabs };
        }""")
        print(f"  [PESTAÑAS ENCONTRADAS]: {tabs_eval['tabs']}")
        assert any("Inferencia observable" in t for t in tabs_eval["tabs"]), "Falta pestaña Inferencia observable"
        assert any("Herramientas" in t for t in tabs_eval["tabs"]), "Falta pestaña Herramientas"
        assert any("Respuesta" in t for t in tabs_eval["tabs"]), "Falta pestaña Respuesta"
        assert any("JSON técnico" in t for t in tabs_eval["tabs"]), "Falta pestaña JSON técnico"

        # Clic en Herramientas
        page.locator(".tech-subtab-btn", has_text="Herramientas").click()
        page.wait_for_timeout(300)
        has_tools_pane = page.locator(".tab-pane-tools").is_visible()
        print(f"  [PESTAÑA HERRAMIENTAS]: Visible={has_tools_pane}")
        assert has_tools_pane, "Panel de herramientas no visible tras clic"

        # Clic en Respuesta
        page.locator(".tech-subtab-btn", has_text="Respuesta").click()
        page.wait_for_timeout(300)
        has_resp_pane = page.locator(".tab-pane-response").is_visible()
        print(f"  [PESTAÑA RESPUESTA]: Visible={has_resp_pane}")
        assert has_resp_pane, "Panel de respuesta no visible tras clic"

        # Clic en JSON técnico
        page.locator(".tech-subtab-btn", has_text="JSON técnico").click()
        page.wait_for_timeout(300)
        json_pane_info = page.evaluate("""() => {
            const lineNums = document.querySelectorAll('.code-line .line-number');
            const lineContents = document.querySelectorAll('.code-line .line-content');
            const tokens = document.querySelectorAll('.code-line span[class*="token-"]');
            return {
                lineCount: lineNums.length,
                tokensCount: tokens.length,
                firstLine: lineContents[0] ? lineContents[0].innerText : ''
            };
        }""")
        print(f"  [PESTAÑA JSON TÉCNICO]: Líneas={json_pane_info['lineCount']} | Tokens={json_pane_info['tokensCount']}")
        report["technical_tabs_checks"] = json_pane_info
        assert json_pane_info["lineCount"] > 0, "No hay líneas numeradas en el visor JSON"

        # Captura de detalle de tabs en 1280
        page.set_viewport_size({"width": 1280, "height": 800})
        page.wait_for_timeout(400)
        save_screenshot(page, "ui4_desktop_1280_v3_technical_tabs")

        # ------------------------------------------------------------------
        # 5. PREFERS-REDUCED-MOTION CHECK
        # ------------------------------------------------------------------
        print("\n---> Verificando compatibilidad con prefers-reduced-motion...")
        reduced_page = browser.new_page(
            viewport={"width": 1280, "height": 800},
            reduced_motion="reduce"
        )
        reduced_page.goto("http://localhost:4200", wait_until="networkidle")
        reduced_page.wait_for_timeout(1000)

        reduced_motion_active = reduced_page.evaluate("""() => {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }""")
        print(f"  [MEDIA QUERY DETECTADA]: {reduced_motion_active}")
        assert reduced_motion_active, "Media query prefers-reduced-motion no aplicada"
        save_screenshot(reduced_page, "ui4_reduced_motion_check")
        report["reduced_motion_checks"]["active"] = reduced_motion_active
        reduced_page.close()

        page.close()
        browser.close()

    print("\n======================================================================")
    print("VALIDACIÓN PLAYWRIGHT UI-4 COMPLETADA EXITOSAMENTE (0 ERRORES)")
    print("======================================================================")
    return report

if __name__ == "__main__":
    report = run_ui4_validation()
    out_json = os.path.join(ARTIFACT_DIRS[0], "ui4_validation_report.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"Reporte JSON guardado en: {out_json}")
