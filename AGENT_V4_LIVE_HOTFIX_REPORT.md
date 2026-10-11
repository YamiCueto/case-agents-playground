# INFORME TÉCNICO DE HOTFIX CRÍTICO — AGENT V4 (M05-L05)
## Estabilización de Ejecución Live, Catálogo de Herramientas Soberano y Gobernanza de Replanning

**Fecha de Ejecución:** 11 de Octubre de 2026  
**Proyecto:** `C:\Users\YAMI\Documents\clase cfa lab03`  
**Entorno:** CASE OS — Agent Engineering Playground (AEP)  
**Versión Agéntica:** Agent v4 — Planning & Task Decomposition  
**Estado:** **ESTABILIZADO Y VERIFICADO (100% PASS)**

---

## 1. CAUSA RAÍZ EXACTA DEL ERROR REPRODUCIDO

Al ejecutar desde `http://localhost:4200` con la persona **Carlos Mario Restrepo (`usr_carlos`)**, Agente **Agent v4**, la consulta:
```text
Diagnosticar ticket TICK-1001 y proponer plan
```
se observaba la detención prematura con `S1 FAILED`, `S2/S3 DEPENDENCY_FAILED`, terminación en `PLAN_BLOCKED` (`no_executable_steps`), y la anomalía visual de `Rev 1 Archivada` y `Rev 1 Activa` simultáneas.

La investigación exhaustiva determinó las siguientes **7 causas raíz concatenadas**:

1. **Alucinación de Herramienta en Planificadores (`get_customer_tickets`):**
   - En `src/agents/v4_planning/mock_planner.py`, el plan por defecto para consultas no relacionadas con DevOps tenía hardcodeado `action="get_customer_tickets"`.
   - En `src/agents/v4_planning/planner.py`, el `system_prompt` inducía textualmente al modelo a usar `get_customer_tickets`, y su bloque de fallback determinista repetía dicha herramienta inexistente.
   - La herramienta `get_customer_tickets` **no existe** en el runtime Python ni en MySQL (`ticket_tools.py` define exclusivamente: `get_ticket_by_id`, `list_tickets`, `create_ticket`, `identify_overdue_tickets`).

2. **Carencia de Validación Semántica en `PlanValidator`:**
   - `PlanValidator.validate()` únicamente evaluaba la aciclicidad y existencia de nodos en el grafo DAG (validation-time estructural).
   - No verificaba si las herramientas estaban registradas en el catálogo ni validaba sus argumentos contra los modelos Pydantic oficiales (`ARGUMENT_MODELS`).
   - Por esta razón, el runtime emitía `PLAN_VALIDATED` para un plan inviable y comenzaba a ejecutar S1, fallando recién en tiempo de ejecución de la herramienta.

3. **Discrepancia en Firmas y Parámetros en `StepExecutor`:**
   - En `src/agents/v4_planning/executor.py`, el set `ticket_tool_actions` contenía herramientas obsoletas/inexistentes (`get_ticket`, `get_customer_tickets`, etc.).
   - Al invocar `execute_tool_step`, el orquestador enviaba `{}` vacío en lugar de propagar los argumentos del paso (`current_step.arguments`), impidiendo que `ticket_code: "TICK-1001"` llegara a `execute_tool_call()`.

4. **Colisión de Atributo en `analyze_ticket_data`:**
   - En `execute_runtime_step` para `analyze_ticket_data`, se retornaba `"status": status` (ej. `"OPEN"`), sobreescribiendo el indicador de éxito del runtime `"status": "success"`. Esto hacía que el orquestador interpretara erróneamente que S2 había fallado (`obs.get("status") != "success"`).

5. **Anomalía de Replanting y Snapshot Prematuro (`Rev 1 Archivada` vs `Rev 1 Activa`):**
   - En `src/agents/v4_planning/orchestrator.py` (`run` y `run_stream`), cuando un paso fallaba, se ejecutaba `snapshot = state.current_plan.clone(); state.plan_history.append(snapshot)` **antes** de saber si `active_planner.replan()` producía una revisión válida.
   - Cuando el planificador retornaba `None` (sin alternativa de contingencia), `state.current_plan` seguía siendo `revision: 1`, pero `plan_history` ya contenía un clon con `revision: 1`.
   - En el frontend (`PlanDAGViewerComponent`), `allRevisions` concatenaba `planHistory` con `currentPlan`, produciendo dos botones idénticos: `Rev 1 Archivada` y `Rev 1 Activa`.

6. **Clasificación Errónea de Error Técnico como `no_executable_steps`:**
   - Un error técnico de integración (herramienta inexistente) provocaba que los pasos dependientes S2 y S3 quedaran bloqueados por dependencia no satisfecha. El runtime clasificaba esto como el caso curricular G3 (`no_executable_steps`), ocultando el fallo técnico de integración como si fuera un estancamiento legítimo de dependencias.

7. **Error de Firma en LLM y Ausencia de Límites de Generación:**
   - `LLMPlanner.create_plan` invocaba `self.provider.chat_completion(...)`, método inexistente en `ModelProvider` (el método oficial es `generate(...)`), levantando `AttributeError` silencioso que enviaba el flujo al fallback con la herramienta inexistente.
   - Adicionalmente, al no limitar `max_tokens`, el modelo local Qwen generaba cadenas reflexivas `<think>` de miles de tokens, provocando latencias excesivas.

---

## 2. ARCHIVOS MODIFICADOS Y CREADOS

| Archivo | Tipo de Cambio | Responsabilidad |
|---|---|---|
| `src/domain/planning/catalog.py` | **NUEVO** | Fuente única de verdad del catálogo unificado (`REGISTERED_TICKET_TOOLS`, `REGISTERED_DEVOPS_TOOLS`, `REGISTERED_RUNTIME_ACTIONS`, `REGISTERED_MODEL_ACTIONS`, validación Pydantic y documentación de prompts). |
| `src/domain/planning/entities.py` | Modificado | Agregado `arguments: Dict[str, Any]` a `PlanStep` y serialización en `to_dict()`. |
| `src/domain/planning/validator.py` | Modificado | Incorporación de validación semántica previa (`unknown_tool`, `invalid_tool_arguments`, `unknown_runtime_action`, `unknown_model_action`). Rechaza planes inviables antes de ejecutar S1. |
| `src/agents/v4_planning/executor.py` | Modificado | Integración con `REGISTERED_TICKET_TOOLS`, paso de `current_step.arguments`, resolución de colisión de status en `analyze_ticket_data` y generación de síntesis grounded para tickets y SLA. |
| `src/agents/v4_planning/mock_planner.py` | Modificado | Descomposición basada en intención canónica (`get_ticket_by_id`, `identify_overdue_tickets`, `list_tickets`). Eliminación total de `get_customer_tickets`. Contingencia S2 acotada a `get_latest_deployment`. |
| `src/agents/v4_planning/planner.py` | Modificado | Inyección del catálogo oficial en prompts, captura de argumentos, invocación correcta a `provider.generate(timeout=8.0, max_tokens=512)` y fallback grounded canónico. |
| `src/agents/v4_planning/orchestrator.py` | Modificado | Paso de `current_step.arguments`, emisión de `VALIDATION_ERROR` ante planes inválidos sin emitir `PLAN_VALIDATED`, archivado de snapshot en `plan_history` únicamente ante replanning exitoso, e instanciación de `LLMPlanner` en streaming Live. |
| `src/agents/common/providers.py` | Modificado | Soporte de `max_tokens` (default seguro 1024) y control de timeout en `OpenAICompatibleProvider.generate()`. |
| `frontend/src/app/services/event-store.service.ts` | Modificado | Guarda para evitar duplicados en `planHistory`. |
| `frontend/src/app/components/runtime-inspector/plan-dag-viewer/plan-dag-viewer.component.ts` | Modificado | Filtro estricto `snap.revision < currentRev` en `allRevisions`, erradicando la visualización dual `Rev 1 Archivada` / `Rev 1 Activa`. |
| `tests/unit/test_agent_v4_planning.py` | Modificado | Pruebas formales de aceptación para Caso Live A (`TICK-1001`), Caso Live B (`SLA`), Negativo C (`unknown_tool`), Negativo D (`invalid_tool_arguments`), y rechazo en streaming SSE. |

---

## 3. CATÁLOGO REAL DE HERRAMIENTAS (ANTES VS DESPUÉS)

### Antes del Hotfix (Inconsistente y Disperso)
```text
MockPlanner:          get_customer_tickets (Inexistente)
LLMPlanner prompt:    get_ticket, get_customer_tickets, get_recent_incidents
StepExecutor:         get_ticket, assign_ticket, add_ticket_comment, change_ticket_priority, get_customer_tickets
ticket_tools.py:      get_ticket_by_id, list_tickets, create_ticket, identify_overdue_tickets
PlanValidator:        No verificaba catálogo (aceptaba cualquier string)
```

### Después del Hotfix (`src/domain/planning/catalog.py` — Única Fuente de Verdad)

```python
# 1. HERRAMIENTAS EXTERNAS (executor: TOOL)
REGISTERED_TICKET_TOOLS = {
    "get_ticket_by_id",       # Requiere: ticket_code (ej. TICK-1001) -> Pydantic: GetTicketArgs
    "list_tickets",           # Opcionales: status, priority, category_code, limit -> Pydantic: ListTicketsArgs
    "create_ticket",          # Requiere: title, description, priority, category_code -> Pydantic: CreateTicketArgs
    "identify_overdue_tickets"# Sin argumentos obligatorios -> Pydantic: IdentifyOverdueArgs
}

REGISTERED_DEVOPS_TOOLS = {
    "get_recent_incidents",
    "get_latest_deployment",
    "get_deployment_from_cache",
    "unrecoverable_legacy_call"
}

# 2. ACCIONES DETERMINISTAS EN SOFTWARE (executor: RUNTIME)
REGISTERED_RUNTIME_ACTIONS = {
    "correlate_incidents_with_deployment",
    "analyze_ticket_data",
    "verify_sla_compliance",
    "filter_active_tickets",
    "analyze_query"
}

# 3. ACCIONES DE INFERENCIA Y SÍNTESIS (executor: MODEL)
REGISTERED_MODEL_ACTIONS = {
    "synthesize_response",
    "generate_incident_recommendation",
    "synthesize_report",
    "summarize_ticket_status"
}
```

---

## 4. EVIDENCIA DE EJECUCIÓN LIVE EXITOSA

### Consulta Ejecutada en Entorno Real:
- **URL:** `http://localhost:4200`
- **Operador:** Carlos Mario Restrepo (`usr_carlos`)
- **Agente:** Agent v4 — Planning [Operativo (L05)]
- **Query:** `Diagnosticar ticket TICK-1001 y proponer plan`

### Resultado Visual Observado en la Interfaz (Three.js + DAG + Chat):
- **Estado Global:** `PLAN COMPLETADO` (Píldora verde esmeralda activa, sin estancamiento).
- **Selector de Revisiones:** Un único estado activo `Rev 1 Activa` (sin duplicidad de `Rev 1 Archivada`).
- **Nodos del Grafo DAG (3/3 Completados):**
  1. `S1` `[TOOL]` `COMPLETADO` &bull; `get_ticket_by_id` &bull; Args: `{"ticket_code": "TICK-1001"}`
  2. `S2` `[RUNTIME]` `COMPLETADO` &bull; `analyze_ticket_data` &bull; Depende de: `S1`
  3. `S3` `[MODEL]` `COMPLETADO` &bull; `synthesize_response` &bull; Depende de: `S2`

### Respuesta Grounded Sintetizada en Chat (Datos Reales de MySQL):
```markdown
Diagnóstico y Plan de Acción para Ticket TICK-1001
Resumen Técnico del Incidente:
- Código: TICK-1001
- Título: Bloqueo transaccional en módulo de captación
- Estado Actual: OPEN
- Nivel de Prioridad: HIGH
- Categoría Técnica: DATABASE
- Reportado por: usr_carlos
- SLA Vencido: SÍ (fuera de SLA, requiere atención prioritaria)

Detalle del Problema:
La tabla de aportes registra bloqueos recurrentes durante el cierre diario

Plan de Acción Propuesto:
1. Contención Inmediata: Asignar ingeniero especialista en database para diagnosticar bloqueos concurrentes.
2. Inspección de Transacciones: Analizar las sentencias SQL en las tablas afectadas durante ventanas de alta carga.
3. Gobernanza y Cierre: Actualizar el estado del ticket y registrar notas técnicas de resolución conforme a las políticas de la cooperativa.
```

---

## 5. SECUENCIA CRONOLÓGICA DE EVENTOS SSE EMITIDOS

Durante la ejecución Live verificada se emitieron los siguientes 14 eventos con correlación estricta y `agent_version: "v4"`:

| # | Event Type | Phase | Iter | Payload Significativo |
|---|---|---|---|---|
| 1 | `USER_REQUEST` | init | 0 | `{"query": "Diagnosticar ticket TICK-1001 y proponer plan", "persona": "usr_carlos"}` |
| 2 | `MEMORY_HYDRATED` | init | 0 | `{"conversation_id": "conv-v4-...", "turns_count": 1, "active_decisions": []}` |
| 3 | `PLAN_GENERATED` | planning | 0 | `{"goal": "...", "revision": 1, "steps_count": 3}` |
| 4 | `PLAN_VALIDATED` | planning | 0 | `{"is_valid": true, "revision": 1, "steps_count": 3}` |
| 5 | `STEP_STARTED` | execution | 1 | `{"step_id": "S1", "action": "get_ticket_by_id", "executor": "tool"}` |
| 6 | `STEP_COMPLETED` | execution | 1 | `{"step_id": "S1", "status": "completed", "duration_ms": 3.8, "data": {"code": "TICK-1001"}}` |
| 7 | `STEP_STARTED` | execution | 2 | `{"step_id": "S2", "action": "analyze_ticket_data", "executor": "runtime"}` |
| 8 | `STEP_COMPLETED` | execution | 2 | `{"step_id": "S2", "status": "completed", "duration_ms": 0.4, "is_overdue": true}` |
| 9 | `STEP_STARTED` | execution | 3 | `{"step_id": "S3", "action": "synthesize_response", "executor": "model"}` |
| 10 | `STEP_COMPLETED` | execution | 3 | `{"step_id": "S3", "status": "completed", "duration_ms": 0.2, "recommendation": "..."}` |
| 11 | `PLAN_COMPLETED` | completion | 3 | `{"goal": "...", "revision": 1, "is_completed": true}` |
| 12 | `FINAL_SYNTHESIS` | synthesis | 3 | `{"answer": "### Diagnóstico y Plan de Acción para Ticket TICK-1001...", "revisions_count": 1}` |
| 13 | `RUN_COMPLETED` | complete | 3 | `{"status": "completed", "stop_reason": "plan_completed", "total_tools_executed": 1}` |
| 14 | `TURN_PERSISTED` | memory | 3 | `{"conversation_id": "...", "turn_id": "turn-v4-..."}` |

---

## 6. REVISIÓN Y HISTORIAL DEL DAG

### Escenario Sin Contingencias (Caso Live A / Caso G1):
- `plan_history`: Vacío (`[]`).
- `current_plan`: Revisión 1.
- Visualización: Botón único `Rev 1 Activa`. No se archiva ningún snapshot porque la ejecución transcurrió sin contingencias.

### Escenario Con Replanning Adaptativo (Caso G2 — Fallo en S2):
- Evento disparador: `STEP_FAILED` en `S2` (`get_latest_deployment`).
- El planificador propone `new_plan` (Revisión 2 con nodo de contingencia `S2b`).
- Snapshot de Revisión 1 se archiva en `plan_history` con `isArchived: true`.
- Se emite `REPLANNING_TRIGGERED` y `PLAN_REVISION_CREATED` (`new_revision: 2`).
- Visualización: Dos botones identificados unívocamente:
  - `[Rev 1 Archivada]` &rarr; Muestra el snapshot inmutable con `S2 FAILED`.
  - `[Rev 2 Activa]` &rarr; Muestra el plan adaptado con `S2 SKIPPED` y `S2b COMPLETED`.
- Invariante de Meta: `rev1.goal == rev2.goal` estrictamente garantizada.

### Escenario Con Rechazo Previo (Caso Negativo C / D):
- Un plan con `action: "get_customer_tickets"` o argumentos inválidos es rechazado por `PlanValidator` **antes de ejecutar S1**.
- Emite: `VALIDATION_ERROR` (`error_code: "unknown_tool"` o `"invalid_tool_arguments"`).
- Emite: `RUN_COMPLETED` (`status: "rejected"`, `stop_reason: "unknown_tool"`).
- **NO emite `PLAN_VALIDATED` ni entra al bucle de ejecución.**

---

## 7. MATRIZ DE RESULTADOS DE PRUEBAS AUTOMATIZADAS

### Pruebas Unitarias Backend (Pytest):
```text
tests/unit/test_agent_v4_planning.py:
  test_plan_validator_rejects_empty_goal .................... PASS
  test_plan_validator_rejects_empty_steps ................... PASS
  test_plan_validator_rejects_empty_step_id ................. PASS
  test_plan_validator_rejects_duplicate_step_ids ............ PASS
  test_plan_validator_rejects_nonexistent_dependency ........ PASS
  test_plan_validator_rejects_self_dependency ............... PASS
  test_plan_validator_rejects_static_cycle_in_dag ........... PASS
  test_plan_validator_rejects_three_node_static_cycle ....... PASS
  test_skipped_semantic_unjustified_does_not_complete_plan .. PASS
  test_skipped_semantic_justified_completes_plan ............ PASS
  test_plan_clone_creates_independent_snapshot .............. PASS
  test_caso_g1_structured_planning_success .................. PASS
  test_caso_g2_replanning_and_goal_invariant ................ PASS
  test_caso_g3_runtime_stall_no_executable_steps ............ PASS
  test_agent_v4_stream_observability ........................ PASS
  test_hotfix_live_a_ticket_especifico_diagnostico_y_plan ... PASS
  test_hotfix_live_b_tickets_vencidos_sla ................... PASS
  test_hotfix_negativo_c_rechazo_herramienta_inexistente .... PASS
  test_hotfix_negativo_d_rechazo_argumentos_invalidos ....... PASS
  test_hotfix_streaming_rechaza_plan_invalido ............... PASS
Total: 20/20 PASSED en 1.84s
```

### Suite Completa Unitarias (`tests/unit`):
```text
78/78 PASSED en 3.48s (v1, v2, v3, v4 y servicios de dominio)
```

### Suite de Integración (`tests/integration`):
```text
81/81 PASSED en 111.87s (MySQL repositories, test_api, migraciones, streams v2/v3/v4)
```

### Suite E2E (`tests/e2e`):
```text
7/7 PASSED en 46.87s (Qwen local LLM y factuality evaluation)
```

### Pruebas Frontend (Vitest):
```text
Test Files: 8 passed (8)
Tests:      64 passed (64)
Duration:   2.27s
```

### Compilación Frontend (Angular 22 Production Build):
```text
ng build -> Application bundle generation complete. [4.28s] -> Exit Code: 0
```

---

## 8. CONFIRMACIÓN DE AUSENCIA DE REGRESIONES

1. **Agentes Anteriores (v1, v2, v3):**
   - Agent v1 (Tool Calling): Intacto y verificado en tests unitarios e integración.
   - Agent v2 (Agent Loop): Idempotencia, detección de ciclos y presupuestos de tiempo intactos.
   - Agent v3 (State & Memory): Persistencia de turnos en MySQL, hidratación contextual de decisiones y presupuesto de tokens plenamente operativos y preservados en v4.
2. **Base de Datos Soberana MySQL:**
   - No se aplicaron modificaciones destructivas a `cfa_tickets`.
   - Las pruebas transaccionales se aislaron de acuerdo con los estándares curriculares.
3. **Restricciones de Alcance:**
   - No se implementó código de Agent v5 (Guardrails/HITL).
   - No se crearon herramientas ficticias ni simulaciones paralelas.
   - Se mantuvo la compatibilidad total con Three.js, SSE, memoria y diseño de la aplicación.

---

## 9. CONCLUSIÓN Y DICTAMEN FINAL

El problema que ocasionaba la terminación prematura en `no_executable_steps` y la duplicación de `Rev 1` en Agent v4 fue **corregido en su totalidad**:

- Se estableció una **única fuente de verdad** para las capacidades agénticas mediante `src/domain/planning/catalog.py`.
- `PlanValidator` ahora ejerce **gobernanza semántica previa**, bloqueando herramientas inexistentes antes de iniciar la ejecución.
- La consulta sobre tickets específicos (`TICK-1001`) ejecuta la herramienta real `get_ticket_by_id` contra MySQL y formula un diagnóstico grounded completo que alcanza `PLAN_COMPLETED`.
- La gobernanza de revisiones archivadas garantiza que no existan etiquetas de revisión duplicadas ni snapshots anómalos.
- La suite completa de pruebas unitarias, de integración, vitest, build y verificación visual en navegador certifica el **100% de éxito funcional**.

**Dictamen:** **AGENT V4 LIVE HOTFIX APROBADO PARA PRODUCCIÓN LOCAL.**
