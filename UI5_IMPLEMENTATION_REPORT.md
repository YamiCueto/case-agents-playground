# AEP — Informe Oficial de Implementación | Fase UI-5: State & Memory Experience

**Proyecto:** `YamiCueto/case-agents-playground`  
**Fase Autorizada:** Exclusivamente UI-5 (State & Memory Experience)  
**Fecha de Certificación:** 2026-10-10  
**Rol:** Senior Angular 22 Architect, UX Engineer y Especialista en Observabilidad de Agentes LLM  
**Estado:** **COMPLETADO Y CERTIFICADO AL 100%** (Esperando autorización para UI-6)

---

## 1. COMPONENTES Y ARCHIVOS MODIFICADOS

| Archivo / Componente | Capa | Modificaciones Clave |
|---|---|---|
| `frontend/src/app/components/runtime-inspector/v3-memory-inspector/v3-memory-inspector.component.ts` | Frontend (Angular 22) | Rediseño integral basado en Stitch: barra de presupuesto horizontal segmentada (cyan, violeta, azul, esmeralda, superficie neutra), banner de la tríada pedagógica (RAM ≠ Conversacional ≠ Decisiones), tarjetas de Decision Inspector con alcance en español (`PERSISTENTE`, `SESIÓN`, `EFÍMERO`), origen MySQL verificado, y línea de tiempo de persistencia reactiva. |
| `frontend/src/app/components/runtime-inspector/v3-memory-inspector/v3-memory-inspector.component.spec.ts` | Frontend (Vitest) | Nuevas pruebas para validación de la barra segmentada Stitch, banner de la tríada pedagógica, defensa contra valores `REDACTED` o `NaN`, y verificación de procedencia MySQL. |
| `frontend/src/app/services/event-store.service.ts` | Frontend (Signals/Store) | Incorporación de parser numérico seguro `parseSafeMetric` para métricas de tokens en el evento `MEMORY_HYDRATED`; traducción de títulos de los 7 hops a español sin duplicaciones. |
| `frontend/src/app/components/runtime-inspector/runtime-inspector.component.ts` | Frontend (Angular 22) | Limpieza de títulos de hops duplicados (`HOP 1 - HOP 1`); traducción de pestañas y botones a español (`Bucle y memoria v3`, `Recorrido de ejecución`, `Reproducir ejecución`, `MODO REPRODUCCIÓN`). |
| `frontend/src/app/components/runtime-inspector/runtime-inspector.component.spec.ts` | Frontend (Vitest) | Actualización de expectativas para pestañas en español. |
| `frontend/src/app/components/header/header.component.ts` | Frontend (Angular 22) | Traducción de botones de reproducción (`Reproducir`, `MODO REPRODUCCIÓN`). |
| `src/domain/memory/policy.py` | Backend (Dominio/Seguridad) | Corrección de raíz para falsos positivos de `MemoryPolicy.is_sensitive_key` que redactaban métricas legítimas de presupuesto de tokens (`querytokensest`, `systemprompttokens`, etc.) manteniendo protección estricta sobre secretos reales. |
| `tests/unit/test_v3_domain_memory.py` | Backend (Pytest) | Pruebas unitarias de sanitización selectiva: validación de preservación de métricas de tokens y redacción estricta de credenciales/tokens de acceso. |
| `tests/integration/test_v3_stage4_orchestrator.py` | Backend (Pytest) | Corrección de condición de carrera concurrente en prueba de reanudación de tareas pendientes. |
| `tests/conftest.py` | Backend (Pytest Fixtures) | Actualización de fixture de base de datos de prueba para refrescar marcas temporales relativas de SLA y limpiar comentarios residuales en el ticket 1 evitando desbordamiento de contexto en Agent v1. |
| `scripts/validate_ui5_state_and_memory.py` | E2E (Playwright) | Script de validación automatizada en 5 viewports con backend real (FastAPI + MySQL + llama.cpp). |

---

## 2. DIFERENCIAS RESPECTO A LA REFERENCIA DE GOOGLE STITCH

El diseño implementado reproduce con fidelidad la composición visual de la columna derecha de Google Stitch (`docs/design/aep_desktop_workspace_agent_v3_state_memory/code.html`), incorporando adaptaciones pedagógicas justificadas:

1. **Barra de Presupuesto Segmentada:**
   - *Stitch:* Barra segmentada estática con colores representativos.
   - *Implementado:* Barra viva y reactiva con anchos porcentuales calculados por Angular Signals (`calcPercentage`), tooltips accesibles con conteo de tokens y porcentajes, y colores de diseño: Cyan (`--accent-cyan`), Violeta (`--accent-violet`), Azul (`#3b82f6`), Esmeralda (`--accent-emerald`) y Superficie neutra (`#1e293b`).
2. **Desglose de Métricas de Presupuesto:**
   - *Stitch:* Lista de 2 columnas de leyenda.
   - *Implementado:* Cuadrícula 2x2 optimizada para viewports desde 1280px con tarjetas semánticas, puntos de color, conteo estimado y porcentaje relativo a los 4,096 tokens efectivos.
3. **Tríada Pedagógica de Memoria:**
   - *Stitch:* Título genérico "State & Memory Inspector".
   - *Implementado:* Tarjeta educativa desplegable que resuelve directamente la confusión didáctica entre:
     - **Estado de Ejecución (RAM):** Efímero del Agent Loop, destruido al finalizar la llamada SSE.
     - **Memoria Conversacional (MySQL):** Historial por `conversation_id`, recuperado con `MEMORY_HYDRATED` y persistido con `TURN_PERSISTED`.
     - **Memoria de Decisiones (Gobernada):** Preferencias persistentes por persona (`usr_carlos` vs. `usr_laura`).
4. **Tareas Pendientes (HITL):**
   - *Stitch:* Tarjeta de tareas pendientes con estado vacío.
   - *Implementado:* Respeto al criterio pedagógico de Fase UI-5: cuando no hay tareas pendientes, se muestra un estado sutil no intrusivo (`Tareas Pendientes (0)`) para que HITL no opaque la observabilidad de memoria.

---

## 3. EVIDENCIA VISUAL ANTES / DESPUÉS

### Vista Global de Agent v3 — State & Memory (1440 × 900 px)

![Agent v3 Estado y Memoria en Vivo](file:///C:/Users/YAMI/.gemini/antigravity-ide/brain/13345f9f-22c0-433e-a9c7-839d00e4334f/ui5_agent_v3_live_hydrated_memory.png)

### Comparativa Visual Detallada

```
ANTES (UI-4 Baseline):
┌────────────────────────────────────────────────────────┐
│ Estado y Memoria (MySQL)                               │
│ Presupuesto: ***REDACTED*** / 4096 tokens             │
│ Barra monocromática o sin segmentación Stitch          │
│ Decisiones con etiquetas en inglés (PERSISTENT, SESSION)│
│ Sin diferenciación explícita de la tríada de memoria   │
│ Timeline sin insignias formales de confirmación MySQL  │
└────────────────────────────────────────────────────────┘

DESPUÉS (UI-5 Certificado):
┌────────────────────────────────────────────────────────┐
│ Estado y Memoria (MySQL) [v3]   CONV: conv-cfb9a266    │
│ ┌────────────────────────────────────────────────────┐ │
│ │ ℹ Tríada Pedagógica: Estado ≠ Conversacional ≠ Dec.│ │
│ │  1. RAM (Efímero)  2. MySQL (Turnos) 3. Decisiones │ │
│ └────────────────────────────────────────────────────┘ │
│ Presupuesto de Contexto  [ESTIMADO]  Límite: 4096 tok  │
│ [██ Cyan ][██ Violet ][██ Azul ][██ Emerald ][  Gris  ]│
│ Ocupación Inicial: ~436 / 4096 tokens (10.6%)         │
│ Margen Disponible Bucle: ~1480 tokens                  │
│ • Sistema: ~420 est. 10.3%  • Decisiones: ~0 est. 0.0% │
│ • Historial: ~0 est.  0.0%  • Consulta:   ~16 est. 0.4% │
│ ────────────────────────────────────────────────────── │
│ Decisiones Persistentes (0)   [Aislamiento por Persona]│
│ Sin preferencias inventadas (solo evidencia MySQL)    │
│ ────────────────────────────────────────────────────── │
│ Memoria Conversacional                                 │
│ ◉ MEMORY_HYDRATED  [Origen: MySQL]            22:48:00 │
│ │ Se recuperaron 0 turnos y 0 decisiones en MySQL     │
│ ◉ TURN_PERSISTED   [Confirmado en MySQL]      22:48:15 │
│   ID: tur-e7a1...  Conv: conv-cfb9...                  │
└────────────────────────────────────────────────────────┘
```

---

## 4. INVESTIGACIÓN Y CORRECCIÓN DEL PROBLEMA `***REDACTED***`

### Causa Raíz Identificada

La aparición de `***REDACTED***` en los campos numéricos del presupuesto no ocurría en la serialización JSON de Pydantic ni en Angular, sino en la interacción entre la política de seguridad backend y el EventStore frontend:

1. **Backend (`src/domain/memory/policy.py`):**
   - La constante `SENSITIVE_FIELD_NAMES` contenía la palabra clave `"token"`.
   - La heurística `is_sensitive_key` comprobaba si `"token"` estaba dentro del nombre de la clave.
   - Aunque existía una lista blanca `SAFE_METRIC_FIELD_NAMES`, esta solo cubría nombres en formato `snake_case` rígido (`query_tokens_est`, `system_prompt_tokens_est`).
   - Cuando el orquestador o SSE emitía nombres como `querytokens`, `querytokensest`, `systemprompttokens`, o claves directas con sufijos numéricos, la verificación caía en la regla genérica de `"token"` y redactaba el valor numérico transformándolo en la cadena `"***REDACTED***"`.
2. **Frontend (`frontend/src/app/services/event-store.service.ts`):**
   - El evaluador de Angular tomaba `stats['query_tokens'] || 0`. Como la cadena `"***REDACTED***"` es truthy en JavaScript, el string reemplazaba al número esperado.

### Solución Implementada (Defensa en Profundidad)

1. **Ampliación Segura de `MemoryPolicy`:**
   - Se expandió `SAFE_METRIC_FIELD_NAMES` con todas las variantes camelCase y sufijos de tokens métricos (`querytokens`, `querytokensest`, `systemprompttokens`, `systemprompttokensest`, `decisionstokens`, `historytokens`, `availablehistorybudget`, etc.).
   - Se ajustó la comprobación en `is_sensitive_key` para verificar primero si la clave es una métrica autorizada antes de aplicar la regla de sensibilidad por subcadena.
   - Se mantuvieron inalteradas las reglas estrictas de detección de secretos reales (`password`, `auth_token`, `access_token`, `api_key`, `token`, `bearer`, entropy de Shannon).
2. **Sanitización Numérica en Frontend (`EventStoreService`):**
   - Se implementó la función pura `parseSafeMetric(val, fallback)` que convierte estrictamente a número y detecta `NaN`. Cualquier cadena no numérica recibida se convierte de forma segura al fallback numérico (0 o 4096).
3. **Pruebas de Verificación:**
   - Prueba unitaria en `test_v3_domain_memory.py::test_memory_policy_preserves_token_budget_metrics_while_sanitizing_secrets` confirma que todas las métricas de tokens permanecen numéricas mientras secretos reales son redactados.
   - Prueba en `v3-memory-inspector.component.spec.ts` confirma que el HTML nunca renderiza `***REDACTED***` ni `NaN`.

---

## 5. MATRIZ DE PRUEBAS PASS / FAIL

### Resumen Ejecutivo

| Suite | Descubiertas | Ejecutadas | Aprobadas | Fallidas | Omitidas | Tasa de Éxito |
|---|---|---|---|---|---|---|
| **Vitest (Frontend)** | 45 | 45 | **45** | 0 | 0 | **100%** |
| **Angular Build (`ng build`)** | 1 | 1 | **1** | 0 | 0 | **100% (Exit 0)** |
| **Pytest (Backend Completo)** | 143 | 143 | **143** | 0 | 0 | **100%** |
| **Playwright (E2E 5 Viewports)** | 5 viewports | 5 viewports | **5** | 0 | 0 | **100%** |

### Desglose Pytest: Explicación de la Diferencia (133 vs. 143)

- **Línea base previa Fase 6.2:** 133 pruebas reportadas.
- **Pruebas añadidas en Fase 6.4 (Stage 4):** Exactamente **10 pruebas adicionales**:
  - `test_v3_stage4_orchestrator.py`: 8 pruebas de integración para el orquestador Stage 4, reanudación atómica HITL, prevención de dobles reanudaciones y flujo SSE dual.
  - `test_v3_domain_memory.py`: 2 pruebas unitarias adicionales para sliding window de tokens y preservación de métricas de políticas de memoria.
- **Total actual:** **143 pruebas descubiertas y ejecutadas exitosamente**.

### Desglose Vitest (Frontend)

- `runtime-inspector.component.spec.ts`: 6/6 PASS
- `app.spec.ts`: 5/5 PASS
- `presentation-controller.service.spec.ts`: 7/7 PASS
- `event-store.service.spec.ts`: 15/15 PASS
- `v3-memory-inspector.component.spec.ts`: 12/12 PASS (incluyendo Stitch bar, tríada y defensa REDACTED)

### Desglose Playwright E2E

- `desktop_1440` (1440 × 900): PASS (`scrollWidth` = 1440, `clientWidth` = 1440, delta = 0)
- `desktop_1280` (1280 × 800): PASS (`scrollWidth` = 1280, `clientWidth` = 1280, delta = 0)
- `tablet_768` (768 × 1024): PASS (`scrollWidth` = 768, `clientWidth` = 768, delta = 0)
- `mobile_390` (390 × 844): PASS (`scrollWidth` = 390, `clientWidth` = 390, delta = 0)
- `mobile_360` (360 × 800): PASS (`scrollWidth` = 360, `clientWidth` = 360, delta = 0)
- Errores de consola: **0 errores**.

---

## 6. EVIDENCIA DE EVENTOS SSE REALES (AGENT V3)

Durante la validación en vivo con FastAPI y llama.cpp, se registraron los siguientes eventos emitidos autoritativamente por el backend:

```json
// Evento 1: Hidratación inicial de memoria desde MySQL
{
  "type": "MEMORY_HYDRATED",
  "agent_version": "v3",
  "execution_id": "run-f921ab04-d2e8-4682-9e2e-8a2bf61a9bc3",
  "timestamp": "2026-10-10T22:48:00.120Z",
  "payload": {
    "conversation_id": "conv-cfb9a266",
    "turns_count": 0,
    "decisions_count": 0,
    "active_decisions": [],
    "stats": {
      "query_tokens": 16,
      "system_prompt_tokens": 420,
      "decisions_tokens": 0,
      "history_tokens": 0,
      "total_initial_tokens": 436,
      "available_history_budget": 1480,
      "max_context_budget": 4096
    }
  }
}

// Evento 2: Confirmación de persistencia del turno en MySQL
{
  "type": "TURN_PERSISTED",
  "agent_version": "v3",
  "execution_id": "run-f921ab04-d2e8-4682-9e2e-8a2bf61a9bc3",
  "timestamp": "2026-10-10T22:48:15.340Z",
  "payload": {
    "turn_id": "tur-e7a1b490",
    "conversation_id": "conv-cfb9a266",
    "status": "stored_in_mysql"
  }
}
```

---

## 7. RIESGOS TÉCNICOS PENDIENTES

1. **Acumulación de comentarios en tickets semilla:**
   - Durante pruebas repetidas de integración que invocan `add_comment` sobre tickets iniciales, el historial puede crecer si no se aísla por prueba. Se incorporó una limpieza en `tests/conftest.py` para asegurar que el ticket 1 no sobrepase el tamaño de contexto en Agent v1.
2. **Presupuesto inicial de bundles de Angular:**
   - El bundle inicial excede levemente el presupuesto de 1.00 MB fijado por defecto en Angular CLI (1.10 MB debido a Three.js procedural y los componentes ricos). Esto es un warning de compilación y no un error, pero puede optimizarse en la fase de empaquetado final mediante code-splitting del runtime de Three.js.

---

## 8. RECOMENDACIONES PARA UI-6 (GUARDRAILS & HUMAN-IN-THE-LOOP)

1. **Dedicación exclusiva de la experiencia HITL:**
   - Con la observabilidad de Estado y Memoria completada y consolidada en UI-5, la Fase UI-6 puede abordar a profundidad los flujos de autorización, reconciliación ante fallas y mitigación de riesgos de seguridad sin competir visualmente con el inspector de memoria.
2. **Reutilización de los contratos existentes:**
   - Los modelos `PendingTaskState`, `TaskRecoveryAlert` y el método `onSelectOption` de `V3MemoryInspectorComponent` ya están tipados y listos para conectarse con la interfaz expandida de Guardrails de UI-6.

---

## CRITERIO FINAL CUMPLIDO

La implementación permite a cualquier persona que aprende Agent Engineering identificar de inmediato y sin abrir el JSON técnico:
- **Qué contexto recibió el LLM** (prompt de sistema, consulta, decisiones e historial hidratado).
- **Cuánto presupuesto de contexto tiene disponible** (barra segmentada Stitch con números exactos y margen de bucle).
- **Qué información recuperó de MySQL** (insignia de hidratación confirmada con conteo de turnos y decisiones).
- **Qué decisiones o preferencias recuerda** (tarjetas de Decision Inspector aisladas por persona y versionadas).
- **Qué pertenece a la conversación actual vs. qué persiste entre conversaciones** (claramente explicitado en la tríada pedagógica).
- **Cuándo se confirma la escritura en memoria** (nodo `TURN_PERSISTED` confirmado en tiempo real).
- **Ausencia total de valores redactados erróneamente (`***REDACTED***` o `NaN`).**

*(Fin del informe UI-5. Detenido según instrucciones. Esperando aprobación oficial).*
