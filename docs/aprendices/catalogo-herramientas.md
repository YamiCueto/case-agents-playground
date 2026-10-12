# Catálogo de herramientas para aprendices

> Volver al [índice](README.md) · Guías: [v1](agent-v1-tool-calling.md) · [v2](agent-v2-agent-loop.md) · [v3](agent-v3-state-memory.md) · [v4](agent-v4-planning.md)

Este catálogo se verificó contra el código (`src/agents/tools/ticket_tools.py`, `src/domain/planning/catalog.py` y `src/agents/v4_planning/executor.py`). Si el código cambia, este documento debe revisarse.

> [!IMPORTANT]
> **"Registrada" no significa "disponible para cualquier cosa".** Una herramienta existe en el runtime, pero el agente solo puede proponerla si aparece en el catálogo que se le entrega, y solo se ejecuta si sus argumentos son válidos y el usuario activo está autorizado.

## 1. Herramientas reales sobre tickets (MySQL)

Estas cuatro herramientas son las únicas **registradas en el runtime** y disponibles para v1, v2, v3 y v4 (en v4 las invoca el *plan*, no el modelo directamente).

| Nombre exacto | Descripción | Versiones | Args requeridos | Args opcionales | Tipo |
|---|---|---|---|---|---|
| `get_ticket_by_id` | Devuelve el detalle de un ticket por su código. | v1, v2, v3, v4 | `ticket_code` (ej. `TICK-1001`) | — | **Lectura** |
| `list_tickets` | Lista tickets, con filtros opcionales. | v1, v2, v3, v4 | — | `status`, `priority`, `category_code`, `limit` (por defecto 10) | **Lectura** |
| `identify_overdue_tickets` | Devuelve los tickets con SLA vencido (revisa hasta 100). | v1, v2, v3, v4 | — (no recibe argumentos) | — | **Lectura** |
| `create_ticket` | Crea un ticket nuevo. | v1, v2, v3, v4 | `title`, `description`, `priority`, `category_code` | — | **ESCRITURA** |

### Ejemplos de prompt natural

| Herramienta | Prompt de ejemplo |
|---|---|
| `get_ticket_by_id` | `Consulta el ticket TICK-1001 y dime su estado` |
| `list_tickets` | `Lista los tickets con prioridad CRITICAL` |
| `identify_overdue_tickets` | `Identifica los tickets vencidos según SLA` |
| `create_ticket` | *(no se propone como ejercicio, ver advertencia)* |

### Detalle por herramienta

| Herramienta | Efectos secundarios | Restricciones por usuario | Errores esperados |
|---|---|---|---|
| `get_ticket_by_id` | Ninguno. | Cualquier persona activa puede ver cualquier ticket (el laboratorio **no** filtra por propietario). Los comentarios internos (`is_internal`) se ocultan en los eventos que ve un usuario con rol `USER`. | `entidad_no_encontrada` (código inexistente), `parametros_invalidos` / `error_validacion` (falta `ticket_code` o formato no válido). |
| `list_tickets` | Ninguno. | Igual que la anterior. | `parametros_invalidos` si un filtro es inválido. Con filtros que no coinciden devuelve una lista vacía (no es un error). |
| `identify_overdue_tickets` | Ninguno. | Igual que la anterior. Los tickets `RESOLVED` y `CLOSED` nunca se consideran vencidos. | `excepcion_runtime` si falla la base de datos. |
| `create_ticket` | **Inserta un registro real en MySQL**, con código `TICK-{n}` y SLA según prioridad (CRITICAL 4 h, HIGH 12 h, MEDIUM 24 h, LOW 48 h). | Permitido para todos los roles activos del laboratorio. | `parametros_invalidos`, `error_validacion`, `validacion_de_dominio` (p. ej. categoría inexistente), `accion_no_autorizada`. |

> [!WARNING]
> **`create_ticket` modifica información real.** Cada ejecución crea un ticket que permanece en la base de datos. **No es un ejercicio inocuo**: no lo uses para "probar" y no lo pidas sin autorización del instructor. En v4, además, un plan generado por el modelo podría incluirla en su catálogo. Todos los prompts de las guías son de **solo lectura**.
>
> Nota de coherencia: el texto del esquema de `create_ticket` menciona la categoría `GENERAL`, pero los datos de ejemplo usan `DATABASE`, `NETWORK`, `SOFTWARE`, `HARDWARE` y `ACCESS`. Es una inconsistencia conocida; no la resuelvas por tu cuenta, consulta al instructor.

### Códigos de error que puede devolver el runtime

| Código | Qué significa | Qué puedes revisar |
|---|---|---|
| `herramienta_no_encontrada` | El modelo pidió una herramienta que no existe. | Es un error del modelo, no tuyo. Reformula la consulta. |
| `parametros_invalidos` | Los argumentos no tienen la forma esperada. | Revisa el evento de validación en el Inspector. |
| `error_validacion` | Un argumento falla el contrato (Pydantic). | Igual que arriba. |
| `entidad_no_encontrada` | El ticket no existe. | Verifica el código en el panel **Tickets MySQL**. |
| `accion_no_autorizada` | La persona activa no tiene permiso. | Cambia de persona o consulta al instructor. |
| `validacion_de_dominio` | La regla de negocio rechaza la operación. | Lee el mensaje devuelto. |
| `excepcion_runtime` | Fallo inesperado. | Comprueba conectividad (ver [troubleshooting](troubleshooting.md)). |
| `herramienta_no_soportada` | Herramienta registrada sin implementación ejecutable. | Avisa al instructor. |

> [!NOTE]
> En v2/v3, las herramientas mutativas se tratan con medidas extra (idempotencia y reintentos controlados). El código menciona `assign_ticket`, `change_ticket_status` y `add_comment` en sus listas de acciones mutativas, pero **no están registradas como herramientas**: si el modelo las propusiera, el resultado sería `herramienta_no_encontrada`. No las busques en la interfaz.

## 2. Catálogo de Planning (solo Agent v4)

El **PlanValidator** de v4 valida cada paso del plan contra un catálogo único (`src/domain/planning/catalog.py`). Hay tres ejecutores:

| Ejecutor | Qué hace | Acciones válidas |
|---|---|---|
| `TOOL` | Llama a una herramienta (real o simulada). | Las 4 herramientas reales de arriba + las 4 simuladas DevOps. |
| `RUNTIME` | Cálculo determinista dentro del runtime, sin modelo. | `correlate_incidents_with_deployment`, `analyze_ticket_data`, `verify_sla_compliance`, `filter_active_tickets`, `analyze_query` |
| `MODEL` | Paso de síntesis/redacción. | `synthesize_response`, `generate_incident_recommendation`, `synthesize_report`, `summarize_ticket_status` |

### Herramientas DevOps de v4: **simuladas**

| Nombre | Descripción | Datos |
|---|---|---|
| `get_recent_incidents` | Incidentes recientes. | **Simulados** (fijos en `executor.py`) |
| `get_latest_deployment` | Último despliegue. | **Simulados** |
| `get_deployment_from_cache` | Alternativa de respaldo para el despliegue. | **Simulados** |
| `unrecoverable_legacy_call` | Llamada de laboratorio que siempre falla. | Solo se alcanza desde pruebas automáticas |

> [!CAUTION]
> Los escenarios DevOps (incidentes y despliegues) usan datos **de laboratorio, no de un sistema real**. Sirven para practicar cómo se encadena un plan, no para diagnosticar infraestructura.

### Aclaraciones importantes sobre los pasos `RUNTIME` y `MODEL` de v4

- `filter_active_tickets` es un paso de laboratorio con comportamiento simplificado: **no sustituye** a un filtro real. No saques conclusiones de su conteo.
- Los pasos `MODEL` (`synthesize_response`, etc.) se resuelven hoy con **plantillas deterministas**, no con una inferencia del modelo. El texto "Plan de Acción Propuesto" que ves es una plantilla.
- Los pasos `TOOL` de un plan son validados antes de ejecutarse: si el nombre no existe o los argumentos son inválidos, el plan es **rechazado** (ver [guía v4](agent-v4-planning.md)).

## 3. Resumen de disponibilidad por versión

| Capacidad | v1 | v2 | v3 | v4 |
|---|---|---|---|---|
| `get_ticket_by_id`, `list_tickets`, `identify_overdue_tickets` | ✅ (1 por ejecución) | ✅ (varias por ejecución) | ✅ | ✅ (vía plan) |
| `create_ticket` (escritura) | ✅ (con cuidado) | ✅ (con cuidado) | ✅ (con cuidado) | ✅ (con cuidado) |
| Tools DevOps simuladas | ❌ | ❌ | ❌ | ✅ |
| Memoria persistente | ❌ | ❌ | ✅ | Guarda turnos de conversación |
| Plan DAG | ❌ | ❌ | ❌ | ✅ |
| HITL de aprobación (v5) | ❌ | ❌ | ❌ | ❌ (futuro) |
