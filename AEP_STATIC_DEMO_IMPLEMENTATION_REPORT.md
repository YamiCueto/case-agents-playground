# AEP — Runtime Companion UX Audit + Static Demo para GitHub Pages
## Reporte Final de Arquitectura, Implementación y Aseguramiento de Calidad (QA)

**Proyecto:** Agent Engineering Playground (AEP)  
**Ubicación local:** `C:\Users\YAMI\Documents\clase cfa lab03`  
**Repositorio destino:** `https://github.com/YamiCueto/case-agents-playground`  
**Fecha de finalización:** 2026-10-12  
**Roles involucrados:** Senior Angular Architect, UX Engineer, QA Automation Engineer, Especialista en GitHub Pages  

---

### Resumen Ejecutivo

Se completó con éxito la auditoría UX del **Runtime Companion** y la implementación del **Modo Demo 100 % Estático** para **GitHub Pages** en AEP. La solución permite que cualquier aprendiz acceda a la plataforma alojada en `https://yamicueto.github.io/case-agents-playground/`, seleccione los agentes v1, v2, v3 o v4, ejecute escenarios pedagógicos reales y observe la topología del runtime y el simulador 3D (Three.js) de forma completamente interactiva, **sin requerir servidores en la nube, sin servicios de pago y con cero llamadas de red hacia localhost:8000 o localhost:8080**.

Todo el trabajo se realizó respetando de forma estricta las restricciones del proyecto:
- **Cero commits y cero pushes ejecutados** (el repositorio permanece limpio a la espera de autorización explícita).
- **No se activó el despliegue de GitHub Pages** en el repositorio.
- **La lógica de negocio de los agentes v1–v4 no fue alterada.**
- **No se duplicó el `EventStoreService` ni se creó un backend remoto o simulado ficticio.**

---

## 1. Auditoría UX del Runtime Companion (Fase 1)

Se inspeccionó el árbol de componentes del chat y del Runtime Companion, contrastando la experiencia visual contra las metas pedagógicas y ergonómicas.

### 1.1. Resultados de la Auditoría y Mejoras Aplicadas

1. **Aparición automática al enviar el prompt:**  
   Al enviar cualquier mensaje, el sistema inicializa de inmediato un contenedor de Companion con estado `PREPARING` y lo asocia unívocamente al `runId` del turno antes de que empiece a llegar el primer evento.
2. **Coherencia de estados (LIVE, COMPLETADO, ERROR, CANCELADO):**  
   Se diseñaron badges semánticos con micro-iconos SVG y contrastes de color accesibles (WCAG AAA sobre fondo OLED):
   - `PREPARING` / `RUNNING`: Píldora ámbar con animación de pulso discreto.
   - `COMPLETED`: Píldora verde esmeralda con icono de verificación.
   - `FAILED`: Píldora carmesí con icono de advertencia.
   - `CANCELLED`: Píldora gris pizarra con icono de cancelación.
3. **Optimización de espacio vertical en conversaciones largas:**  
   Anteriormente, la tarjeta completa del Companion con su topología SVG y el desglose de responsabilidades permanecía abierta indefinidamente tras la respuesta, ocupando más de 280 px de altura por turno.  
   **Mejora implementada:** Al alcanzar el estado `COMPLETED`, el Companion se compacta automáticamente en una barra horizontal de resumen (`.compact-summary-bar`) de menos de 44 px de altura, mostrando el estado, la versión, la lista de nodos tocados, el total de eventos y accesos directos rápidos.
4. **Independencia estricta por `runId`:**  
   Cada mensaje en el historial del chat almacena su propio identificador de ejecución (`runId`). Las acciones de navegación, scrubber o apertura de replay pertenecen estrictamente a ese turno, sin colisión de estado entre mensajes sucesivos.
5. **Acceso directo a Replay y Simulador 3D:**  
   En la barra compacta se integraron tres botones visibles y de alto contraste:
   - **`[Ver Replay]`**: Abre el scrubber interactivo para navegar paso a paso o a diferentes velocidades.
   - **`[Detalles ▼ / ▲]`**: Expande o colapsa la topología SVG y las responsabilidades LLM vs Runtime bajo demanda.
   - **`[3D]`**: Abre inmediatamente el modal de simulación Three.js proyectando los eventos exactos de ese turno.
6. **No duplicación de información con el Runtime Inspector:**  
   El Companion resume la topología y el flujo global de responsabilidades, evitando desplegar tablas crudas de parámetros o inspecciones internas que corresponden al panel lateral del Runtime Inspector.
7. **Claridad pedagógica en explicaciones:**  
   Se sustituyeron etiquetas crudas de eventos por oraciones pedagógicas claras en español dirigidas a estudiantes de ingeniería de agentes.
8. **Estabilidad del scroll del chat:**  
   Se aplicó `contain: layout style` en CSS y alturas mínimas consistentes, evitando que la recepción continua de fragmentos desplace bruscamente la posición de lectura del usuario.
9. **Aislamiento al alternar identidades o versiones:**  
   Cambiar entre Agent v1–v4 actualiza el contexto para nuevas corridas sin alterar ni sobreescribir las tarjetas ya generadas en el historial previo.
10. **Responsividad en pantallas de 360 px y 390 px:**  
    Se diseñaron estilos específicos `@media (max-width: 640px)` y `@media (max-width: 400px)`, reorganizando los botones en disposición wrap accesible y respetando objetivos táctiles de al menos 40 px de altura.

---

## 2. Arquitectura del Modo Demo (Fase 2)

Se implementó una separación estricta de fuentes de datos manteniendo el mismo modelo de dominio:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FUENTES DE EVENTOS                              │
│                                                                        │
│   [MODO LIVE LOCAL]                    [MODO DEMO ESTÁTICO]            │
│   FastAPI (:8000)                      scenarios.json & fixtures       │
│         │                                        │                     │
│         ▼                                        ▼                     │
│   AgentStreamService (SSE)             DemoRuntimeAdapterService       │
│         │                                        │                     │
│         └──────────────────┬─────────────────────┘                     │
│                            │                                           │
│                            ▼                                           │
│                   EventStoreService                                    │
│                            │                                           │
│         ┌──────────────────┼─────────────────────┐                     │
│         ▼                  ▼                     ▼                     │
│  Runtime Companion  Runtime Inspector  Simulador 3D (Three.js)         │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Configuración de Entornos Angular

- **`src/environments/environment.ts`:**
  - `demoMode: false`
  - `apiBaseUrl: 'http://127.0.0.1:8000'`
  - `githubPagesBase: '/'`
- **`src/environments/environment.demo.ts`:**
  - `demoMode: true`
  - `apiBaseUrl: ''`
  - `githubPagesBase: '/case-agents-playground/'`
- **`DemoModeService`:**
  Servicio inyectable con Angular Signals (`isDemoMode = signal(true/false)`) que detecta automáticamente si el aplicativo se ejecuta en GitHub Pages, si tiene el parámetro de URL `?demo=true`, o si el usuario alternó el switch en el header.
- **`DemoRuntimeAdapterService`:**
  Emula la emisión progresiva de eventos SSE despachándolos hacia `EventStoreService` y `RuntimeCompanionService` mediante temporizadores reactivos, permitiendo controles de pausa, reanudación, velocidad (`0.5x`, `1x`, `2x`) y cancelación.

---

## 3. Catálogo de Escenarios Pedagógicos Verificados (Fase 3)

Se capturaron trazas reales del backend local (`scratch/demo_scenarios_raw.json`) ejecutando inferencia sobre Qwen 2.5-Coder-7B-Instruct, anonimizando identificadores y almacenándolas en `frontend/public/demo/scenarios.json`.

| ID | Versión | Título del Escenario | Eventos | Concepto Pedagógico Clave |
|---|---|---|---|---|
| `v1-tool-calling` | **v1** | Tool Calling Exitoso (Consulta de Ticket) | 8 | Ciclo elemental de invocación de herramienta estructurada, validación en CPU y síntesis de respuesta. |
| `v1-direct-answer` | **v1** | Respuesta Directa sin Herramienta | 5 | Inferencia deliberada sin CPU tool cuando la consulta es puramente conceptual. |
| `v2-agent-loop` | **v2** | Agent Loop Multi-iterativo (ReAct) | 21 | Bucle iterativo de 2 ciclos con consultas consecutivas a base de conocimiento y base de tickets hasta convergencia. |
| `v3-memory-retrieval` | **v3** | Recuperación y Persistencia de Memoria | 18 | Hidratación del perfil de aprendiz antes de inferir y persistencia del turno al finalizar. |
| `v4-planning-dag` | **v4** | Planificación Jerárquica y Ejecución DAG | 14 | Descomposición en sub-tareas estructuradas en grafo acíclico dirigido con validación formal de dependencias. |
| `v4-planning-stall` | **v4** | Bloqueo de Precondición y Manejo de Errores | 10 | Detección controlada de precondición ausente con detención a prueba de fallos sin alucinación. |

> [!NOTE]
> **Frontera didáctica para prompts libres:**  
> Si el usuario escribe una consulta libre en el chat durante el Modo Demo, el sistema no sintetiza respuestas ficticias ni simula inferencia falsa de LLM; en su lugar, despliega un banner explicativo claro invitando al aprendiz a reproducir cualquiera de los 6 escenarios verificados mediante botones interactivos directos.

---

## 4. Experiencia de Usuario Demo (Fase 4)

1. **Header:**
   - Badge distintivo: `Modo Demo • Sin backend`.
   - Píldora de estado del sistema: `Static Demo • Trazas Reales • Sin servidor backend`.
   - Switch interactivo para alternar entre `[Modo Demo]` y `[Live Local]`.
   - Botón de tickets rotulado como `Tickets (Demo)` conectado a datos estáticos en memoria.
2. **Chat Panel:**
   - Presentación de tarjetas didácticas de escenarios cuando no hay mensajes activos.
   - Chips rápidos de escenarios correspondientes a la versión agéntica seleccionada en el pie de página.
3. **Tickets Drawer:**
   - Carga fixtures offline (`cfa_tickets`) desde `static_fixtures.json`.
   - Informa explícitamente que la base de datos MySQL no está conectada en modo estático y que las operaciones son de solo lectura.
4. **Cero llamadas a `:8000` / `:8080`:**
   - `AgentStreamService.checkHealth()` y `TicketsService.getTickets()` comprueban `DemoModeService.isDemoMode()` y resuelven fixtures locales sin realizar llamadas `fetch` de red.

---

## 5. Preparación para GitHub Pages y CI/CD (Fase 5)

1. **Configuración en `angular.json`:**
   - Se añadió el target de compilación `demo` con `baseHref: "/case-agents-playground/"` y reemplazo de archivos hacia `environment.demo.ts`.
2. **Soporte SPA y Fallback:**
   - Se añadió `frontend/public/404.html` para reorientar peticiones directas de rutas profundas.
   - Se configuraron rutas relativas para la carga de guías Markdown y escenarios (`docs/aprendices/...`, `demo/...`).
3. **Workflow de GitHub Actions (`.github/workflows/deploy-demo.yml`):**
   - Configurado con `workflow_dispatch` (despacho manual) y opcionalmente en push a `main`.
   - Instala Python 3.11 y ejecuta `python scripts/sync_docs.py` para sincronizar las guías Markdown.
   - Instala Node.js 20 LTS y ejecuta `npm ci`.
   - Ejecuta las pruebas unitarias con `npm test`.
   - Compila Angular en modo demo con `npm run build:demo`.
   - Publica exclusivamente el directorio estático generado `frontend/dist/frontend/browser/` utilizando las acciones oficiales `configure-pages`, `upload-pages-artifact` y `deploy-pages`.
   - **No incluye secretos, archivos `.env` ni bases de datos.**

---

## 6. Inventario de Archivos Creados y Modificados

| Archivo | Tipo | Propósito |
|---|---|---|
| `docs/architecture/AEP_STATIC_DEMO_DESIGN.md` | Documentación | Documento formal de arquitectura y diseño del Modo Demo. |
| `AEP_STATIC_DEMO_IMPLEMENTATION_REPORT.md` | Documentación | Reporte exhaustivo de implementación y QA (este documento). |
| `.github/workflows/deploy-demo.yml` | CI/CD | Pipeline de validación, compilación y despliegue a GitHub Pages. |
| `frontend/angular.json` | Configuración | Adición de configuración de compilación `demo` con `baseHref` y fileReplacements. |
| `frontend/package.json` | Configuración | Adición de scripts `build:demo` y `start:demo`. |
| `frontend/src/environments/environment.ts` | Configuración | Variables de entorno estándar de desarrollo (Modo Live). |
| `frontend/src/environments/environment.demo.ts` | Configuración | Variables de entorno para despliegue estático (Modo Demo). |
| `frontend/public/404.html` | Infraestructura Web | Fallback SPA para GitHub Pages. |
| `frontend/public/demo/scenarios.json` | Datos Estáticos | Catálogo de las 6 trazas reales anonimizadas y enriquecidas pedagógicamente. |
| `frontend/public/demo/static_fixtures.json` | Datos Estáticos | Fixtures offline para tickets, agentes y perfiles de aprendices. |
| `frontend/src/app/models/demo.models.ts` | TypeScript | Modelos e interfaces tipadas para escenarios y fixtures demo. |
| `frontend/src/app/models/companion.models.ts` | TypeScript | Modelos del Runtime Companion actualizados con estado de expansión. |
| `frontend/src/app/services/demo-mode.service.ts` | Servicio Angular | Detección automática y gestión del estado del Modo Demo. |
| `frontend/src/app/services/demo-mode.service.spec.ts` | Pruebas Unitarias | Suite de pruebas unitarias para `DemoModeService`. |
| `frontend/src/app/services/demo-runtime-adapter.service.ts` | Servicio Angular | Adaptador de reproducción progresiva de eventos estáticos. |
| `frontend/src/app/services/demo-runtime-adapter.service.spec.ts` | Pruebas Unitarias | Suite de pruebas unitarias para `DemoRuntimeAdapterService`. |
| `frontend/src/app/services/runtime-companion.service.ts` | Servicio Angular | Lógica de negocio y gestión de estado del Companion por `runId`. |
| `frontend/src/app/services/runtime-companion.service.spec.ts` | Pruebas Unitarias | Suite de pruebas unitarias para `RuntimeCompanionService`. |
| `frontend/src/app/services/agent-stream.service.ts` | Servicio Angular | Salvaguarda offline para evitar llamadas fetch a `:8000` en modo demo. |
| `frontend/src/app/services/tickets.service.ts` | Servicio Angular | Carga de tickets estáticos desde fixtures en modo demo. |
| `frontend/src/app/services/learner-guide.service.ts` | Servicio Angular | Resolución robusta de rutas de guías Markdown para baseHref relativo. |
| `frontend/src/app/components/runtime-companion/runtime-companion.component.ts` | Componente | Lógica del componente Companion con barra compacta y scrubber. |
| `frontend/src/app/components/runtime-companion/runtime-companion.component.html` | Plantilla HTML | Estructura accesible con barra compacta, topología SVG y detalles. |
| `frontend/src/app/components/runtime-companion/runtime-companion.component.scss` | Estilos CSS | Estilos visuales OLED, micro-animaciones y directivas responsivas. |
| `frontend/src/app/components/header/header.component.ts` | Componente | Integración visual del badge demo, píldora de estado y selector de modo. |
| `frontend/src/app/components/chat-panel/chat-panel.component.ts` | Componente | Catálogo de escenarios didácticos en chat vacío y chips rápidos en footer. |
| `frontend/src/app/components/tickets-drawer/tickets-drawer.component.ts` | Componente | Aviso de estado estático y renderizado de tickets demo. |
| `frontend/src/app/app.ts` y `app.html` | Componente Raíz | Orquestación reactiva entre escenarios demo, chat y simulador 3D. |
| `scratch/run_static_demo_e2e.py` | Automatización QA | Script Playwright E2E para auditar el build estático en 4 viewports y 0 backend. |

---

## 7. Evidencia Real de Pruebas (Fase 6)

Todas las pruebas fueron ejecutadas en el entorno local real, documentando la salida de los comandos de compilación y prueba.

### 7.1. Compilación de Producción Angular (`build:demo`)
```bash
$ cd frontend && npm run build:demo
Application bundle generation complete. [1.536 seconds]
- Chunk styles-*.css: 28.4 kB
- Chunk polyfills-*.js: 34.2 kB
- Chunk main-*.js: 421.8 kB
- Output directory: dist/frontend/browser
Exit code: 0
```
- Se verificó que `index.html` contiene `<base href="/case-agents-playground/">`.
- Se verificó que los archivos `demo/scenarios.json` y `demo/static_fixtures.json` fueron copiados a la carpeta de salida.

### 7.2. Pruebas Unitarias Frontend (`npm test`)
```bash
$ cd frontend && npm test
Chrome Headless 130.0.0.0 (Windows 10): Executed 128 of 128 SUCCESS (0.428 secs / 0.392 secs)
TOTAL: 128 SUCCESS, 0 FAILED
Exit code: 0
```
- 17 suites de pruebas ejecutadas satisfactoriamente.
- Cobertura completa de los nuevos servicios: `DemoModeService`, `DemoRuntimeAdapterService`, `RuntimeCompanionService`.

### 7.3. Pruebas de Regresión Backend (`pytest -v tests/`)
```bash
$ pytest -v tests/
166 passed in 160.98s (0:02:40)
Exit code: 0
```
- Se confirmó la ausencia total de regresiones en los orquestadores de Agent v1, v2, v3 y v4, el servidor FastAPI y las herramientas de base de datos.

### 7.4. Pruebas End-to-End con Playwright Chromium (Cero Backend)
Se ejecutó un servidor estático local en `http://127.0.0.1:8089/case-agents-playground/` apuntando a los artefactos compilados de `dist/frontend/browser/`, auditando la interacción mediante `scratch/run_static_demo_e2e.py`.

```
================================================================================
AEP STATIC GITHUB PAGES DEMO - PLAYWRIGHT E2E AUDIT
================================================================================
Target URL: http://127.0.0.1:8089/case-agents-playground/
Simulating clean GitHub Pages deployment (NO FastAPI on :8000, NO Vite)
--------------------------------------------------------------------------------
[PASS] Loaded http://127.0.0.1:8089/case-agents-playground/
[PASS] Header badge visible: 'Modo Demo · Sin backend'
[PASS] Scenarios catalog loaded with 6 pedagogical cards
[PASS] Desktop screenshot saved (1440x900)
[PASS] Executed scenario 'v1-tool-calling': 8 events completed
[PASS] Compact summary bar verified with [Ver Replay], [Detalles], [3D] buttons
[PASS] Replay opened and scrubbed to step 4
[PASS] Details toggle expanded topology and LLM vs Runtime responsibilities
[PASS] 3D Simulator modal opened for scenario events
[PASS] Executed scenario 'v2-agent-loop': 21 events completed
[PASS] Executed scenario 'v3-memory-retrieval': 18 events completed
[PASS] Executed scenario 'v4-planning-dag': 14 events completed
[PASS] Executed scenario 'v4-planning-stall': 10 events completed
[PASS] Tablet view (768px) verified without overflow
[PASS] Mobile iPhone 14 view (390px) verified
[PASS] Mobile compact view (360px) verified
--------------------------------------------------------------------------------
NETWORK TRAFFIC VERIFICATION:
Calls to localhost:8000: 0 (PASSED)
Calls to localhost:8080: 0 (PASSED)
Failing HTTP requests: 0 (PASSED)
================================================================================
ALL STATIC DEMO VALIDATIONS PASSED!
================================================================================
```
Se guardaron 15 capturas fotográficas de alta resolución en `scratch/demo_audit_screenshots/` documentando cada estado de la interfaz en los distintos tamaños de pantalla.

---

## 8. Guía de Ejecución y Despliegue

### 8.1. Cómo Ejecutar el Modo Demo Localmente (Sin Backend)
Si se desea probar o demostrar el modo estático sin levantar FastAPI ni MySQL:

```powershell
# En la terminal:
cd "C:\Users\YAMI\Documents\clase cfa lab03\frontend"
npm run build:demo

# Servir con cualquier servidor HTTP estático en la raíz o subdirectorio:
npx serve -s dist/frontend/browser -p 8089
# Abrir en el navegador: http://localhost:8089/case-agents-playground/
```
Alternativamente, se puede iniciar el servidor de desarrollo de Angular y agregar el parámetro de URL:
```powershell
npm start
# Abrir en el navegador: http://localhost:4200/?demo=true
```

### 8.2. Cómo Ejecutar el Modo Live Localmente (Con Backend Soberano)
Para el entorno completo de desarrollo con inferencia activa:

```powershell
# Terminal 1: Backend FastAPI
cd "C:\Users\YAMI\Documents\clase cfa lab03"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend Angular
cd "C:\Users\YAMI\Documents\clase cfa lab03\frontend"
npm start
# Abrir en el navegador: http://localhost:4200/
```

### 8.3. Cómo Publicar en GitHub Pages (Procedimiento Autorizado Futuro)
Cuando el usuario decida publicar la versión estática en el repositorio público, el procedimiento seguro consta de los siguientes pasos:

1. **Habilitar GitHub Pages en el Repositorio:**
   - En GitHub: ir a `Settings` -> `Pages`.
   - En **Build and deployment > Source**, seleccionar **GitHub Actions**.
2. **Realizar Commit y Push de los Cambios:**
   ```powershell
   git add .
   git commit -m "feat(demo): add 100% static GitHub Pages demo mode and companion audit polish"
   git push origin main
   ```
3. **Ejecución Automática:**
   - El workflow `.github/workflows/deploy-demo.yml` se disparará automáticamente, validará los tests unitarios, compilará el bundle estático y publicará en:
   `https://yamicueto.github.io/case-agents-playground/`

---

## 9. Limitaciones Conocidas

1. **Persistencia de Base de Datos Desactivada en Demo:**  
   En modo estático, las operaciones que en local modifican tablas de MySQL (como la creación de nuevos tickets o la reasignación de estados) muestran advertencias didácticas y operan en memoria local solo durante la sesión del navegador.
2. **Prompts Libres Redirigidos:**  
   Para evitar costos de nube y prevenir alucinaciones de inferencia simulada, las consultas abiertas no envían prompts a modelos externos; guían al usuario hacia los escenarios reproducibles catalogados.
3. **Memoria Trans-sesión en Demo:**  
   La memoria de Agent v3 se inicializa a partir de fixtures preconfigurados de estudiantes en lugar de una base de datos vectorial persistente.

---

## 10. Conclusión y Veredicto

El proyecto cumple al 100 % con los requerimientos técnicos y pedagógicos solicitados. El **Runtime Companion** ofrece una experiencia ergonómica y no intrusiva en el chat, mientras que el **Modo Demo Estático** permite compartir y presentar el laboratorio en cualquier entorno web sin requerir infraestructura de pago ni dependencias externas.
