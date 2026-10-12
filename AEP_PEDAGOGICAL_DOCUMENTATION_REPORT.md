# Informe de Auditoría, Validación y Documentación Pedagógica en AEP

**Proyecto:** Agent Engineering Playground (AEP)  
**Ruta local:** `C:\Users\YAMI\Documents\clase cfa lab03`  
**Repositorio:** `https://github.com/YamiCueto/case-agents-playground`  
**Currículo:** CASE OS — Módulo M05 (*Agent Architecture & Engineering*)  
**Fecha:** 2026-10-12  
**Autor:** Senior AI Engineer, Technical Writer & Diseñador Instruccional  

---

## 1. Estado Inicial Encontrado y Diagnóstico

Al iniciar la sesión de continuidad (handoff):
- Se comprobó que el hotfix crítico de Agent v4 (`a8cef11`) había sido completado y commiteado previamente.
- El agente anterior había comenzado la redacción de la documentación pedagógica en `docs/aprendices/`, dejando 5 archivos creados (`catalogo-herramientas.md`, `guia-runtime-inspector.md`, `agent-v1-tool-calling.md`, `agent-v2-agent-loop.md`, `agent-v3-state-memory.md`) y scripts de prueba en `scratch/` (`run_prompts.py`, `run_v3_memory.py`).
- Faltaban los componentes prioritarios:
  - Guía pedagógica exhaustiva de **Agent v4 (Planning & Task Decomposition)**.
  - Índice pedagógico general **`README.md`** y guía de **`troubleshooting.md`**.
  - Integración contextual en la interfaz Angular sin duplicación manual de contenido.
  - Validación de enlaces y pruebas automatizadas frontend/backend.

---

## 2. Trabajo Previo Conservado

Se auditó y preservó el trabajo válido del agente anterior:
1. `docs/aprendices/catalogo-herramientas.md`: Especificación de herramientas reales de tickets (`get_ticket_by_id`, `list_tickets`, `identify_overdue_tickets`, `create_ticket`) y ejecutores de v4.
2. `docs/aprendices/guia-runtime-inspector.md`: Explicación de los componentes visuales existentes (avatar 3D, timeline, traza de decisiones, visor DAG, inspector de memoria).
3. `docs/aprendices/agent-v1-tool-calling.md`: Guía de Tool Calling con estructura A–H y diagrama de secuencia.
4. `docs/aprendices/agent-v2-agent-loop.md`: Guía de Agent Loop con estructura A–H, presupuesto de ejecución y diagrama de flujo.
5. `docs/aprendices/agent-v3-state-memory.md`: Guía de State & Memory con estructura A–H y tríada pedagógica.
6. Datos de ejecución verificada en `scratch/prompt_runs.json` y `scratch/v3_out.txt`.

---

## 3. Archivos Creados y Modificados

### 3.1. Archivos Creados
- **`docs/aprendices/agent-v4-planning.md`**: Guía pedagógica completa para Agent v4 con estructura A–H, diagramas Mermaid de DAG (G1) y replanning (G2), explicación de ejecutores `TOOL`/`RUNTIME`/`MODEL`, `PlanValidator`, 5 laboratorios guiados y tratamiento de `Runtime Stall` (G3).
- **`docs/aprendices/README.md`**: Índice general de bienvenida, mapa de navegación, tabla comparativa de capacidades acumuladas y reglas de oro para los aprendices.
- **`docs/aprendices/troubleshooting.md`**: Manual de resolución de fallos reales (conectividad, modelos, base de datos, bucles atascados, aislamiento de memoria y planes bloqueados).
- **`scripts/sync_docs.py`**: Pipeline de fuente única que copia los Markdown a `frontend/public/docs/aprendices/` y compila `guides_manifest.json` con secciones y tablas de prompts estructuradas.
- **`frontend/src/app/models/learner-guide.models.ts`**: Tipos e interfaces TypeScript para la guía contextual.
- **`frontend/src/app/services/learner-guide.service.ts`**: Servicio reactivo Angular con señales para consultar el manifiesto y documentos extra.
- **`frontend/src/app/components/learner-guide-drawer/learner-guide-drawer.component.ts`**: Componente de interfaz de usuario con navegación por pestañas (*¿Qué hace?*, *¿Qué puedo escribir?*, *Herramientas*, *¿Qué NO hace?*, *Laboratorios*, *Runtime Inspector*, *Documentación completa*), botones para copiar prompts con feedback y soporte para teclado/móvil.
- **`frontend/src/app/components/learner-guide-drawer/learner-guide-drawer.component.spec.ts`**: Pruebas unitarias completas del componente de guía.
- **`AEP_PEDAGOGICAL_DOCUMENTATION_REPORT.md`**: Este informe consolidado.

### 3.2. Archivos Modificados
- **`frontend/package.json`**: Incorporación de scripts `"sync:docs"` y `"prebuild"` para compilar automáticamente la documentación antes de cada build.
- **`frontend/src/app/components/header/header.component.ts`**: Integración del botón accesible **Guía del aprendiz** con icono de libro en la barra de acciones superior.
- **`frontend/src/app/app.ts`**: Registro de `LearnerGuideDrawerComponent` y manejo de estado de apertura/cierre sincronizado con la versión del agente.
- **`frontend/src/app/app.html`**: Enlace del evento en el header y renderizado condicional accesible de `app-learner-guide-drawer`.

---

## 4. Matriz de Trazabilidad: Capacidad → Versión → Código → Ejercicio

| Capacidad Curricular | Versión | Archivo / Función en Código | Ejercicio en Guía |
|---|---|---|---|
| **Tool Calling Elemental** (proponer ≠ ejecutar) | Agent v1 | `src/agents/v1_tool_calling/agent.py` (`run_agent_v1_stream`) | Lab 1 (respuesta directa) y Lab 2 (`Consulta el ticket TICK-1001 y dime su estado`) |
| **Validación de Contratos Pydantic** | Agent v1–v4 | `src/agents/tools/ticket_tools.py` (`ARGUMENT_MODELS`) | Lab 4 en v1 (`Consulta el ticket TICK-9999`) y Lab 4 en v4 |
| **Agent Loop Reactivo e Iteraciones** | Agent v2 | `src/agents/v2_agent_loop/engine.py` | Lab 1 y Lab 2 en v2 (`Consulta TICK-1001 y TICK-1003 y compara su prioridad`) |
| **Presupuesto y Parada del Bucle** | Agent v2 | `src/agents/v2_agent_loop/state.py` (`max_iterations=5`) | Lab 3 y Lab 5 en v2 (`Lista los tickets OPEN y dime cuáles están vencidos`) |
| **Detección de Ciclos Repetitivos** | Agent v2 | `src/agents/v2_agent_loop/engine.py` (`LOOP_REPETITION_DETECTED`) | Sección G de v2 y troubleshooting §3.2 |
| **Persistencia Conversacional en MySQL** | Agent v3 | `src/domain/memory/` y `src/agents/v3_state_and_memory/` | Lab 1 en v3 (`Hola, ¿qué puedes hacer por mí?` → `TURN_PERSISTED`) |
| **Decisiones Explícitas Versionadas** | Agent v3 | `src/domain/memory/decision_record.py` | Lab 2 en v3 (`Recuerda que mi canal preferido: email` → `DECISION_SAVED`) |
| **Aislamiento por Identidad Simulada** | Agent v3 | `src/agents/v3_state_and_memory/identity.py` | Lab 4 en v3 (Consulta con `usr_laura` muestra `decisions_count: 0`) |
| **Directiva de Frescura Operativa** | Agent v3 | `src/agents/v3_state_and_memory/context_builder.py` | Lab 3 en v3 (`¿Cuál es el estado de TICK-1001?` vuelve a consultar MySQL) |
| **Structured Planning DAG (G1)** | Agent v4 | `src/domain/planning/validator.py` y `orchestrator.py` | Lab 1 en v4 (`Diagnosticar ticket TICK-1001 y proponer plan`) |
| **Ejecutores Soberanos (TOOL, RUNTIME, MODEL)** | Agent v4 | `src/agents/v4_planning/executor.py` | Lab 2 en v4 (`Revisar tickets vencidos por SLA y proponer plan`) |
| **Topología Multi-Dependencia (DevOps)** | Agent v4 | `src/domain/planning/catalog.py` (DevOps tools) | Lab 3 en v4 (`Auditar el último despliegue e incidentes recientes`) |
| **Tolerancia a Fallos y Runtime Stall (G3)** | Agent v4 | `src/agents/v4_planning/orchestrator.py` (`no_executable_steps`) | Lab 4 en v4 (`Diagnosticar ticket TICK-9999 y proponer plan`) |
| **Auditoría de Revisiones y DAG Viewer** | Agent v4 | `frontend/src/app/components/runtime-inspector/plan-dag-viewer/` | Lab 5 en v4 (Análisis de Rev 1, dependencias y observaciones fácticas) |

---

## 5. Ejemplos Realmente Probados contra el Backend Live

Todos los prompts descritos en las guías fueron ejecutados contra el servidor local de FastAPI (`http://localhost:8000/api/chat/stream`) y el modelo local Qwen en el puerto 8080. Los resultados reales obtenidos fueron:

1. **v1 — `Consulta el ticket TICK-1001 y dime su estado`**  
   *Eventos:* `USER_REQUEST` → `MODEL_INFERENCE_1` → `TOOL_PROPOSAL` → `ARGUMENT_VALIDATION` → `CPU_TOOL_EXECUTION` → `TOOL_RESULT_INJECTION` → `FINAL_SYNTHESIS` → `RUN_COMPLETED` (`tools_executed: 1`).  
   *Respuesta:* Confirmó estado `OPEN` del incidente "Bloqueo transaccional en módulo de captación".

2. **v1 — `¿Cuál es el procedimiento general para atender un incidente?`**  
   *Eventos:* `USER_REQUEST` → `MODEL_INFERENCE_1` → `DIRECT_ANSWER` → `FINAL_SYNTHESIS` → `RUN_COMPLETED` (`tools_executed: 0`).  
   *Respuesta:* Respuesta directa conceptual sin llamadas a herramientas.

3. **v2 — `Consulta TICK-1001 y TICK-1003 y compara su prioridad`**  
   *Eventos:* `RUN_STARTED` → `ITERATION_STARTED` → Inferencia → 2 propuestas de herramienta consecutivas (`get_ticket_by_id` para ambos códigos) → `OBSERVATION_APPENDED` (×2) → Iteración 2 → `FINAL_SYNTHESIS` → `RUN_COMPLETED` (`stop_reason: final_answer`).  
   *Respuesta:* Comparó TICK-1001 (HIGH) con TICK-1003 (CRITICAL).

4. **v3 — `Recuerda que mi canal preferido: email`**  
   *Eventos:* `DECISION_SAVED` (`key: preferred_channel`, `value: EMAIL`, `scope: persistent`) → `MEMORY_HYDRATED` → `FINAL_SYNTHESIS` → `RUN_COMPLETED` → `TURN_PERSISTED`.

5. **v3 — `¿Cuál es mi canal preferido?` (Misma conversación con Carlos)**  
   *Eventos:* `MEMORY_HYDRATED` (`active_decisions: [{"key": "preferred_channel", "value": "EMAIL"}]`) → `FINAL_SYNTHESIS` → `RUN_COMPLETED`.  
   *Respuesta:* Respondió "EMAIL" basándose en la memoria hidratada sin llamar a herramientas.

6. **v3 — `¿Cuál es mi canal preferido?` (Con Laura `usr_laura`)**  
   *Eventos:* `MEMORY_HYDRATED` (`decisions_count: 0`, `active_decisions: []`) → `FINAL_SYNTHESIS`.  
   *Respuesta:* Indicó que no tiene acceso a preferencias para este usuario (aislamiento confirmado).

7. **v4 — `Diagnosticar ticket TICK-1001 y proponer plan`**  
   *Eventos:* `USER_REQUEST` → `MEMORY_HYDRATED` → `PLAN_GENERATED` → `PLAN_VALIDATED` → S1 `STEP_STARTED/COMPLETED` (`TOOL: get_ticket_by_id`) → S2 `STEP_STARTED/COMPLETED` (`RUNTIME: analyze_ticket_data`) → S3 `STEP_STARTED/COMPLETED` (`MODEL: synthesize_response`) → `PLAN_COMPLETED` → `FINAL_SYNTHESIS` → `RUN_COMPLETED` (`status: completed`).

8. **v4 — `Diagnosticar ticket TICK-9999 y proponer plan` (Escenario Negativo / Runtime Stall)**  
   *Eventos:* S1 falla con `entidad_no_encontrada` → Replanner devuelve `None` → S2 y S3 quedan bloqueados con dependencias insatisfechas → `PLAN_BLOCKED` (`reason: no_executable_steps`) → `FINAL_SYNTHESIS` → `RUN_COMPLETED` (`status: failed`).

---

## 6. Evidencia de la Integración en Angular

La integración se realizó respetando la arquitectura de AEP:
- **Botón en Header:** Se incorporó un botón `.btn-guide-toggle` accesible con icono SVG y etiqueta *"Guía del aprendiz"*, estilizado en armonía con el botón existente *"Tickets MySQL"*.
- **Drawer Deslizante:** Implementado como `app-learner-guide-drawer`, con overlay semitransparente (`backdrop-filter: blur(8px)`), `role="dialog"`, `aria-modal="true"` y soporte para cerrar con la tecla `Esc`.
- **Selector de Versión Integrado:** Los botones `v1`, `v2`, `v3` y `v4` en el drawer permiten al estudiante consultar la documentación de cualquier versión y opcionalmente cambiar la versión activa del playground.
- **Pestañas de Navegación Temática:**
  - *¿Qué hace?*: Renderiza el objetivo pedagógico, los conceptos y el diagrama Mermaid.
  - *¿Qué puedo escribir?*: Muestra una tabla con cada intención, capacidad, resultado esperado y un botón interactivo **Copiar prompt** que escribe en el portapapeles y muestra *"¡Copiado!"* por 2 segundos.
  - *Herramientas*: Resumen visual de herramientas de lectura vs. escritura (con advertencias de impacto en MySQL).
  - *¿Qué NO hace?*: Banner de advertencia con las limitaciones reales de la versión.
  - *Laboratorios*: Acordeón con los 5 ejercicios completos, precondiciones, pasos y botón de copiado de prompt.
  - *Runtime Inspector*: Guía de interpretación visual de eventos y fases.
  - *Documentación completa*: Visor de Markdown completo con selector para alternar entre la guía de la versión, el catálogo general, la guía del inspector, troubleshooting y el README.
- **Diseño Responsive:** Totalmente funcional y probado desde 360 px (pestañas con desplazamiento horizontal, tablas adaptadas) hasta pantallas panorámicas de escritorio.

---

## 7. Resultados de Pruebas Automatizadas

1. **Compilación de Producción Angular (`npm run build`):**
   - Ejecutó previamente `python ../scripts/sync_docs.py` (sincronizó 8 documentos y generó `guides_manifest.json` en `public/docs/aprendices/`).
   - Generó el bundle de producción en **3.48 segundos** sin errores tipográficos ni advertencias bloqueantes.

2. **Pruebas Unitarias Frontend (`npx ng test --watch=false`):**
   - **9 suites de prueba** ejecutadas.
   - **69 pruebas unitarias** pasando satisfactoriamente (incluyendo las nuevas pruebas de `LearnerGuideDrawerComponent`).
   - Pruebas existentes de `App`, `Avatar3D`, `DecisionTrace`, `PlanDAGViewer`, `TechnicalViewer`, `V2LoopFlow` y `V3MemoryInspector` intactas.

3. **Pruebas Unitarias Backend (`pytest tests/unit/ -v`):**
   - **78 pruebas unitarias** pasando en 3.67 segundos.
   - Cubriendo `test_agent_v1.py`, `test_agent_v4_planning.py`, `test_domain_rules.py`, `test_ticket_service.py`, `test_v3_domain_memory.py` y `tests/unit/v2/`.

4. **Verificación Estática de Enlaces:**
   - Un script Python verificó todos los enlaces relativos entre los 8 archivos de `docs/aprendices/` sin detectar enlaces rotos.

---

## 8. Limitaciones Detectadas y Pendientes

- **Agent v5 y v6 no implementados:** Se mantuvo la directiva de no tocar ni simular Agent v5 ni v6. Sus opciones en el selector de AEP continúan deshabilitadas con la etiqueta *"Próximamente"*.
- **Herramienta `create_ticket`:** Sigue disponible en el backend para v1–v4, pero la documentación advierte enfáticamente a los aprendices no utilizarla en ejercicios libres para evitar contaminar la base de datos local.
- **Herramientas DevOps simuladas en v4:** Se explicó con claridad a los aprendices que `get_recent_incidents` y `get_latest_deployment` devuelven datos fijos de laboratorio y no consultan clusters reales.
- **Inconsistencia de Categorías:** Se documentó en el catálogo que el esquema de `create_ticket` menciona `GENERAL`, pero las categorías activas en los seed data son `DATABASE`, `NETWORK`, `SOFTWARE`, `HARDWARE` y `ACCESS`.

---

## 9. Instrucciones para el Instructor Durante la Clase

1. **Apertura de la sesión:**
   - Solicita a los aprendices abrir `http://localhost:4200` y comprobar que la cabecera muestre los tres semáforos en verde (*FastAPI :8000 • Modelo: Conectado • MySQL: Conectado*).
   - Indícales hacer clic en el botón superior **Guía del aprendiz** para tener las instrucciones al alcance sin cambiar de ventana.

2. **Secuencia de talleres recomendada:**
   - **Taller 1 (L02 - Agent v1):** Ejecutar Lab 1 (respuesta directa) y Lab 2 (consulta de ticket). Señalar la pestaña *Inferencia observable* vs. *Herramientas* en el Runtime Inspector.
   - **Taller 2 (L03 - Agent v2):** Ejecutar Lab 2 (comparación de TICK-1001 y TICK-1003). Demostrar cómo el bucle acumula dos observaciones antes de pasar a la síntesis.
   - **Taller 3 (L04 - Agent v3):** Ejecutar Lab 2 (guardar preferencia) y luego Lab 4 (cambiar de Carlos a Laura) para ilustrar el aislamiento de memoria en MySQL.
   - **Taller 4 (L05 - Agent v4):** Ejecutar Lab 1 (diagnóstico con DAG) y luego Lab 4 (`TICK-9999`) para evidenciar el mecanismo de seguridad de *Runtime Stall*.

3. **Resolución de dudas frecuentes:**
   - Si un estudiante reporta que el agente "olvidó" algo, guíalo a la pestaña **¿Qué NO hace?** o a **Troubleshooting §4.1**.
   - Si el modelo tarda en responder, recuérdales que están ejecutando un modelo local de inferencia y que pueden observar el latido en el Runtime Inspector.
