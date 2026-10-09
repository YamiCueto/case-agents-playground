# M05 · Taller Práctico — Evoluciona Agent v2 a Agent v3: State & Memory

## Guía de implementación para grupos de estudio · CASE Academy

- **Duración recomendada:** 75–90 minutos
- **Modalidad:** Trabajo colaborativo en grupos de estudio
- **Punto de partida obligatorio:** El proyecto funcional de **Agent v2** construido en L03
- **Entregable técnico:** Código Python ejecutable de **Agent v3** con `ExecutionState`, `MemoryStore` gobernado por software, aislamiento estricto por `subject_id`, inyección controlada (`hydrate`), persistencia autorizada (`write_back`) y validación de los **Casos F1** (continuidad de sesión), **F2** (persistencia y aislamiento de sujetos) y **F3** (decisión pendiente y reanudación).

---

## 1. Principio Rector del Taller

> **"No crees un agente nuevo. Toma el proyecto de Agent v2 que construiste en L03 y dótalo de Estado y Memoria."**

En el Taller 03 construiste **Agent v2**: un agente dotado de un Agent Loop iterativo capaz de encadenar llamadas a herramientas hasta alcanzar una respuesta final o un límite operacional (`max_iterations`).

Sin embargo, Agent v2 tiene una limitación crítica: **amnesia total entre ejecuciones**.
- Cada vez que llamas a `run_agent_v2()`, el historial de mensajes se inicializa vacío.
- Si el usuario dice *"¿Cuál era el pedido que vimos antes?"*, el agente no tiene idea.
- Si el usuario especificó una regla fija de negocio (*"Mi transportadora preferida es Servientrega"*), al siguiente turno o sesión la regla se esfuma.

En este taller no utilizaremos librerías externas opacas ni volcaremos ciegamente cientos de mensajes crudos al contexto. Construiremos una arquitectura de memoria en tres horizontes gobernada por software soberano.

---

## 2. Mapa de Evolución: De Agent v2 a Agent v3

```text
┌────────────────────────────────────────────────────────┐
│                      AGENT V2                          │
│                                                        │
│  ModelProvider / MockModelProviderV2  ✅ SE CONSERVA   │
│  TOOL_REGISTRY & execute_tool_call()  ✅ SE CONSERVA   │
│  Agent Loop (while iterativo)         ✅ SE CONSERVA   │
│  max_iterations                       ✅ SE CONSERVA   │
│  Pruebas A, B, C, D, E                ✅ SE CONSERVAN  │
│                                                        │
│  run_agent_v2()                       🔄 EVOLUCIONA    │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                      AGENT V3                          │
│                                                        │
│  ExecutionState (efímero intra-run)   🆕 NUEVO         │
│  MemoryItem & MemoryScope             🆕 NUEVO         │
│  MemoryStore (aislamiento subject_id) 🆕 NUEVO         │
│  MemoryPolicy (qué se guarda y qué no)🆕 NUEVO         │
│  hydrate() (inyección acotada)        🆕 NUEVO         │
│  write_back() (persistencia explícita)🆕 NUEVO         │
│  Caso F1 (Continuidad de Sesión)      🆕 NUEVO         │
│  Caso F2 (Persistencia & Aislamiento) 🆕 NUEVO         │
│  Caso F3 (Decisión pendiente)         🆕 NUEVO         │
│  run_agent_v3()                       🆕 NUEVO         │
└────────────────────────────────────────────────────────┘
```

---

## 3. Las Tres Reglas Arquitectónicas Inviolables

1. **Context Window ≠ Memory Store:**
   - La ventana de contexto es la memoria de trabajo temporal del LLM (tokens de entrada). Tiene costo económico, latencia y riesgo de desatención.
   - El `MemoryStore` es una estructura de almacenamiento persistente en disco/RAM gobernada por la aplicación en Python.
2. **Soberanía del Software sobre la Persistencia:**
   - El modelo **nunca** ejecuta sentencias `INSERT` o `UPDATE` directamente en la base de datos de memoria.
   - El software inspecciona las intenciones o aplica una `MemoryPolicy` determinista para decidir qué se guarda y qué se descarta.
3. **Scope y Aislamiento por `subject_id`:**
   - Toda memoria persistente debe pertenecer a un `subject_id` unívoco (usuario, cliente o tenant).
   - **Regla de seguridad:** Un `subject_id` jamás puede acceder ni recuperar memorias asociadas a otro `subject_id`.

---

## 4. Checklist de Migración

### No cambies esto todavía
- Tu dominio de negocio (logística, salud, banca, etc.).
- Tus datos simulados existentes (`DB_ORDERS`, `DB_CARRIERS`).
- Tus herramientas registradas (`get_order_status`, `get_shipping_provider`).
- Tu lógica de ejecución de tools (`execute_tool_call`).
- Tus casos de prueba de regresión: **A, B, C, D y E**. Deben continuar funcionando.

### Agrega en L04
1. **`ExecutionState`:** Dataclass que acompaña la ejecución interna de cada run (`run_id`, `iteration`, `tool_calls_executed`, `started_at`).
2. **`MemoryItem`:** Dataclass con `scope` (`"session"` vs `"persistent"`), `subject_id`, `session_id`, `key`, `value` y `timestamp`.
3. **`MemoryStore`:** Repositorio con métodos `search(subject_id, session_id)` y `save(item)`.
4. **`MemoryPolicy`:** Función que filtra datos sensibles (ej. rechaza contraseñas o tokens) y autoriza persistencia.
5. **`hydrate()`:** Función que lee las memorias relevantes y genera un bloque de contexto compacto para el prompt inicial.
6. **`write_back()`:** Función que extrae y almacena los hechos nuevos al finalizar el bucle con éxito.
7. **`run_agent_v3()`:** Función principal que orquesta Hydration → Loop de Agent v2 → Write-back.
8. **Validación de Casos F1, F2 y F3:**
   - **Caso F1:** Turno 1 crea contexto de sesión; Turno 2 consulta sin repetir la entidad explícita.
   - **Caso F2:** Usuario Carlos fija preferencia; en nueva sesión se recuerda. Usuario Laura entra y no recibe la preferencia de Carlos.
   - **Caso F3:** El agente detecta una decisión faltante, ofrece opciones numeradas y una alternativa libre, pausa la tarea y la reanuda cuando el mismo sujeto responde dentro de la misma sesión.

---

## 5. Hitos de Trabajo y Tiempos Estimados

| Hito | Actividad | Tiempo |
|---|---|---|
| **Hito 1** | Definición de contratos: `ExecutionState`, `MemoryItem` y `MemoryStore` | 15 min |
| **Hito 2** | Implementación de `MemoryPolicy`, `hydrate()` y `write_back()` | 15 min |
| **Hito 3** | Construcción de `run_agent_v3()` orquestando el ciclo completo | 15 min |
| **Hito 4** | Configuración de `MockModelProviderV3` y pruebas de regresión (A–E) | 15 min |
| **Hito 5** | Ejecución y verificación de los Casos F1 y F2 en consola | 15 min |
| **Hito 6** | Decisión pendiente, entrada libre y validación del Caso F3 | 15 min |

---

## 6. Scaffolding y Código de Evolución

Abre tu archivo de trabajo (puedes crear `agent_v3.py` partiendo de `agent_v2.py`).

### 6.1 Estructuras de Datos de Estado y Memoria

```python
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


# ---------------------------------------------------------------------------
# NIVEL 1: ExecutionState (Efímero intra-run — vive solo en el bucle)
# ---------------------------------------------------------------------------
@dataclass
class ExecutionState:
    run_id: str
    session_id: str
    subject_id: str
    messages: List[Dict[str, Any]]

    iteration: int = 0
    max_iterations: int = 5
    last_observation: Optional[Dict[str, Any]] = None
    termination_reason: Optional[str] = None
    tool_calls_executed: List[str] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)


# Nota arquitectónica sobre ExecutionState:
# session_id y subject_id forman parte del contexto de ejecución para que el
# loop sepa bajo qué sesión y sujeto opera, pero su presencia dentro de
# ExecutionState NO significa que el propio ExecutionState sea persistente.
# Al terminar la función, las referencias locales salen de alcance. Si ningún otro
# objeto conserva una referencia al ExecutionState, éste queda elegible para
# liberación/recolección. Para persistir hechos, se transfieren al MemoryStore.


# ---------------------------------------------------------------------------
# NIVEL 2 y 3: MemoryItem y MemoryStore (Persistencia gobernada por software)
# ---------------------------------------------------------------------------
@dataclass
class MemoryItem:
    id: str
    subject_id: str          # Identidad propietaria (ej: 'usr_carlos')
    session_id: Optional[str] # Sesión asociada (None si es global al sujeto)
    scope: str               # 'session' o 'persistent'
    key: str                 # 'preferred_carrier', 'last_order_queried'
    value: Any
    created_at: float = field(default_factory=time.time)


class MemoryStore:
    """
    Almacén de memoria gobernado por software.
    Garantiza aislamiento estricto por subject_id para evitar fugas multitenant.
    """
    def __init__(self):
        self._storage: List[MemoryItem] = []

    def save(self, item: MemoryItem) -> None:
        # Si ya existe una clave persistente para este sujeto, se actualiza
        for idx, existing in enumerate(self._storage):
            if (existing.subject_id == item.subject_id and
                existing.scope == item.scope and
                existing.key == item.key and
                (existing.session_id == item.session_id or item.scope == "persistent")):
                self._storage[idx] = item
                return
        self._storage.append(item)

    def search(self, subject_id: str, session_id: Optional[str] = None) -> List[MemoryItem]:
        """
        Recupera exclusivamente las memorias autorizadas para este subject_id.
        - Persistent memories del sujeto (cualquier sesión).
        - Session memories del sujeto coincidentes con la sesión activa.
        """
        results: List[MemoryItem] = []
        for item in self._storage:
            if item.subject_id != subject_id:
                continue  # Aislamiento riguroso: jamás devolver memorias de otro usuario
            if item.scope == "persistent":
                results.append(item)
            elif item.scope == "session" and session_id and item.session_id == session_id:
                results.append(item)
        return results


# ---------------------------------------------------------------------------
# POLÍTICA DE HIGIENE: Qué se permite guardar y qué queda estrictamente prohibido
# ---------------------------------------------------------------------------
FORBIDDEN_KEYWORDS = ["password", "token", "secret", "api_key", "clave", "credencial"]

def sanitize_and_validate_memory(key: str, value: Any) -> bool:
    """Verifica que no intentemos persistir credenciales ni secretos."""
    key_lower = key.lower()
    val_str = str(value).lower()
    for forbidden in FORBIDDEN_KEYWORDS:
        if forbidden in key_lower or forbidden in val_str:
            print(f"[SECURITY ALERT] Intento de persistir dato sensible bloqueado: '{key}'")
            return False
    return True
```

### 6.2 Funciones de Soporte: `hydrate()` y `write_back()`

```python
def hydrate_context(subject_id: str, session_id: str, memory_store: MemoryStore) -> str:
    """
    Recupera los recuerdos relevantes para este sujeto y sesión,
    y construye un bloque acotado y estructurado para inyectar al prompt.
    """
    memories = memory_store.search(subject_id=subject_id, session_id=session_id)
    if not memories:
        return ""

    lines = ["\n[MEMORIA ACTIVA RECUPERADA POR RUNTIME]"]
    for m in memories:
        scope_tag = "SESIÓN" if m.scope == "session" else "GLOBAL"
        lines.append(f"- ({scope_tag}) {m.key}: {m.value}")
    lines.append("[FIN DE MEMORIA RECUPERADA]\n")
    return "\n".join(lines)


def write_back_memory(
    subject_id: str,
    session_id: str,
    user_query: str,
    final_answer: str,
    tool_observations: List[Dict[str, Any]],
    memory_store: MemoryStore
) -> None:
    """
    Extrae hechos de forma controlada y los persiste en MemoryStore.
    En una aplicación real, aquí un clasificador o reglas deterministas
    identifican hechos clave.
    """
    # Regla 1: Si se consultó una orden, guardarla en SessionMemory como última orden activa
    for obs in tool_observations:
        if "order_id" in obs:
            memory_store.save(MemoryItem(
                id=str(uuid.uuid4())[:8],
                subject_id=subject_id,
                session_id=session_id,
                scope="session",
                key="last_order_queried",
                value=obs["order_id"]
            ))

    # Regla 2: Si el usuario manifestó preferencia explícita de transportadora
    query_lower = user_query.lower()
    if "prioriza" in query_lower or "preferida" in query_lower or "siempre usa" in query_lower:
        for carrier_name in ["servientrega", "envia", "coordinadora", "deprisa"]:
            if carrier_name in query_lower:
                val = carrier_name.capitalize()
                if sanitize_and_validate_memory("preferred_carrier", val):
                    memory_store.save(MemoryItem(
                        id=str(uuid.uuid4())[:8],
                        subject_id=subject_id,
                        session_id=None,  # Global al usuario
                        scope="persistent",
                        key="preferred_carrier",
                        value=val
                    ))
                    print(f"[MEMORY STORE] Preferencia persistente guardada para {subject_id}: preferred_carrier={val}")
```

### 6.3 Orquestación Principal: `run_agent_v3()`

```python
def run_agent_v3(
    user_query: str,
    provider: Any,
    memory_store: MemoryStore,
    session_id: str,
    subject_id: str,
    max_iterations: int = 5
) -> str:
    """
    Ejecuta el Agent Loop con soporte completo de State & Memory (Agent v3).

    Ciclo de vida:
    1. HYDRATE: Recupera memoria autorizada para subject_id y session_id.
    2. LOOP: Ejecuta bucle iterativo con ExecutionState local.
    3. WRITE-BACK: Persiste nuevos hechos bajo MemoryPolicy determinista.
    """
    run_id = f"run_{uuid.uuid4().hex[:8]}"
    print("=" * 70)
    print(f"INICIO DE EJECUCION — AGENT V3 [Run: {run_id}]")
    print(f"Subject: '{subject_id}' | Session: '{session_id}'")
    print("=" * 70)

    # 1. FASE DE HYDRATION (Pre-bucle)
    memory_context = hydrate_context(subject_id, session_id, memory_store)
    if memory_context:
        print(f"[HYDRATE] Contexto inyectado ({len(memory_context)} chars):\n{memory_context}")

    full_prompt = f"{memory_context}\nConsulta del usuario: {user_query}" if memory_context else user_query

    # 2. INICIALIZACIÓN DEL EXECUTION STATE
    exec_state = ExecutionState(
        run_id=run_id,
        session_id=session_id,
        subject_id=subject_id,
        max_iterations=max_iterations,
        messages=[{"role": "user", "content": full_prompt}]
    )

    tool_observations: List[Dict[str, Any]] = []

    # 3. AGENT LOOP (Gobernado por software)
    while exec_state.iteration < exec_state.max_iterations:
        exec_state.iteration += 1
        print(f"\n{'─' * 25} [ITERATION {exec_state.iteration} / {exec_state.max_iterations}] {'─' * 25}")

        response = provider.generate(messages=exec_state.messages, tools=TOOLS_SCHEMAS)

        # Condición de Parada 1: Final Answer
        if not response.tool_calls:
            print("[MODEL] Respuesta final alcanzada:")
            print(f"\n[FINAL ANSWER]\n{response.content}\n")
            exec_state.termination_reason = "final_answer"

            # 4. FASE DE WRITE-BACK (Post-bucle exitoso)
            write_back_memory(
                subject_id=subject_id,
                session_id=session_id,
                user_query=user_query,
                final_answer=response.content or "",
                tool_observations=tool_observations,
                memory_store=memory_store
            )
            return response.content or ""

        # Procesamiento de herramientas
        for tool_call in response.tool_calls:
            print(f"[MODEL] ToolCall: '{tool_call.name}'")
            exec_state.tool_calls_executed.append(tool_call.name)

            result = execute_tool_call(tool_call)
            exec_state.last_observation = result
            tool_observations.append(result)
            print(f"[OBSERVATION] {json.dumps(result)}")

            exec_state.messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": tool_call.id,
                    "type": "function",
                    "function": {"name": tool_call.name, "arguments": json.dumps(tool_call.arguments)}
                }]
            })
            exec_state.messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": tool_call.name,
                "content": json.dumps(result)
            })

    # Condición de Parada 2: Límite Operacional
    exec_state.termination_reason = "max_iterations_reached"
    print(f"\n[STOPPED] Excedido límite operacional de {max_iterations} iteraciones.")
    return f"Error: Tarea no concluida en {max_iterations} iteraciones."
```

### 6.4 Proveedor de Simulación: `MockModelProviderV3`

```python
class MockModelProviderV3:
    """
    Simulador determinista de protocolo para Agent v3.
    Reconoce memoria inyectada en el prompt para resolver consultas de sesión y preferencias.
    """
    def generate(self, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]) -> Any:
        from dataclasses import dataclass
        @dataclass
        class MockResp:
            content: Optional[str]
            tool_calls: list

        user_content = messages[0]["content"] if messages else ""

        # Caso F1 Turno 2: Pregunta por transportadora basándose en orden previa recordada en sesión
        if "transportadora asignada a ese envio" in user_content.lower() or "transportadora para ese pedido" in user_content.lower():
            if "last_order_queried: ORD-4091" in user_content:
                # Comprueba si ya ejecutó la tool
                tool_msgs = [m for m in messages if m.get("role") == "tool"]
                if not tool_msgs:
                    from dataclasses import dataclass
                    @dataclass
                    class TC:
                        id: str
                        name: str
                        arguments: dict
                    return MockResp(
                        content=None,
                        tool_calls=[TC(id="call_f1_carrier", name="get_shipping_provider", arguments={"order_id": "ORD-4091"})]
                    )
                else:
                    return MockResp(
                        content="Con base en la sesion anterior, el pedido ORD-4091 tiene asignada la transportadora Servientrega con guia SE-992144.",
                        tool_calls=[]
                    )

        # Caso F2: El usuario pide transportadora y tiene una preferencia persistente recordada
        if "preferred_carrier: Servientrega" in user_content and ("recomiendas" in user_content.lower() or "transportadora" in user_content.lower()):
            return MockResp(
                content="Dado que tu preferencia registrada es Servientrega, te recomiendo despachar con Servientrega.",
                tool_calls=[]
            )

        # Si no hay preferencia guardada, devuelve comportamiento estándar neutral
        if "recomiendas" in user_content.lower() and "preferred_carrier" not in user_content:
            return MockResp(
                content="No tienes una transportadora preferida configurada. Las opciones estándar disponibles son Envía y Coordinadora.",
                tool_calls=[]
            )

        # Consulta directa de prueba A-E estándar o registro de preferencia
        if "prioriza" in user_content.lower() or "preferida" in user_content.lower():
            return MockResp(
                content="Entendido. He registrado tu preferencia en el sistema.",
                tool_calls=[]
            )

        # Flujo estándar de consulta de orden (Caso F1 Turno 1)
        if "ord-4091" in user_content.lower():
            tool_msgs = [m for m in messages if m.get("role") == "tool"]
            if not tool_msgs:
                from dataclasses import dataclass
                @dataclass
                class TC:
                    id: str
                    name: str
                    arguments: dict
                return MockResp(
                    content=None,
                    tool_calls=[TC(id="call_ord_1", name="get_order_status", arguments={"order_id": "ORD-4091"})]
                )
            else:
                return MockResp(
                    content="El pedido ORD-4091 se encuentra 'ready_to_ship'.",
                    tool_calls=[]
                )

        return MockResp(content="Consulta procesada correctamente.", tool_calls=[])
```

---

## 7. Batería de Pruebas: Casos F1 y F2

Inserta este bloque al final de tu archivo para validar el comportamiento en la terminal:

```python
if __name__ == "__main__":
    memory_store = MemoryStore()
    provider = MockModelProviderV3()

    print("\n" + "=" * 75)
    print("DEMOSTRACIÓN CASO F1: CONTINUIDAD DE SESIÓN (INTER-TURN)")
    print("=" * 75)

    session_alpha = "sess_colombia_101"
    carlos_id = "usr_carlos_01"

    # Turno 1: Carlos pregunta por el estado de una orden
    print("\n>>> TURNO 1: Consulta inicial de orden")
    ans1 = run_agent_v3(
        user_query="¿Cuál es el estado del pedido ORD-4091?",
        provider=provider,
        memory_store=memory_store,
        session_id=session_alpha,
        subject_id=carlos_id
    )

    # Turno 2: Carlos hace una pregunta de seguimiento elíptica (sin repetir ORD-4091)
    print("\n>>> TURNO 2: Consulta elíptica en la misma sesión")
    ans2 = run_agent_v3(
        user_query="¿Cuál es la transportadora asignada a ese envio?",
        provider=provider,
        memory_store=memory_store,
        session_id=session_alpha,
        subject_id=carlos_id
    )

    print("\n" + "=" * 75)
    print("DEMOSTRACIÓN CASO F2: PERSISTENCIA GLOBAL Y AISLAMIENTO DE USUARIOS")
    print("=" * 75)

    # Paso 1: Carlos declara su preferencia persistente en una nueva sesión
    session_beta = "sess_colombia_102"
    print("\n>>> Carlos declara preferencia persistente:")
    run_agent_v3(
        user_query="Para todos mis futuros pedidos, prioriza siempre Servientrega.",
        provider=provider,
        memory_store=memory_store,
        session_id=session_beta,
        subject_id=carlos_id
    )

    # Paso 2: Carlos inicia otra sesión completamente nueva semanas después
    session_gamma = "sess_colombia_103"
    print("\n>>> Carlos consulta recomendación en nueva sesión (debe recordar Servientrega):")
    ans_carlos = run_agent_v3(
        user_query="¿Qué transportadora me recomiendas para despachar hoy?",
        provider=provider,
        memory_store=memory_store,
        session_id=session_gamma,
        subject_id=carlos_id
    )

    # Paso 3: Laura entra como un nuevo usuario en su propia sesión
    session_laura = "sess_laura_201"
    laura_id = "usr_laura_02"
    print("\n>>> Laura consulta recomendación (NO DEBE heredar la preferencia de Carlos):")

    # 1. GARANTÍA PRIMARIA DE AISLAMIENTO: Inspeccionar frontera de memoria
    laura_memories = memory_store.search(
        subject_id=laura_id,
        session_id=session_laura
    )
    assert not any(m.subject_id == carlos_id for m in laura_memories), \
        "Fallo crítico de seguridad: search() para Laura devolvió registros de Carlos."
    assert not any("Servientrega" in str(m.value) for m in laura_memories), \
        "Fallo de aislamiento: la memoria persistente de Carlos ingresó al espacio de Laura."

    # Comprobar que hydrate_context() para Laura no contiene la preferencia de Carlos
    laura_hydrated = hydrate_context(subject_id=laura_id, session_id=session_laura, memory_store=memory_store)
    assert "preferred_carrier: Servientrega" not in laura_hydrated, \
        "Fallo crítico de seguridad: el contexto hidratado de Laura contiene la preferencia de Carlos."

    # 2. COMPROBACIÓN SECUNDARIA: Respuesta del modelo/agente
    ans_laura = run_agent_v3(
        user_query="¿Qué transportadora me recomiendas para despachar hoy?",
        provider=provider,
        memory_store=memory_store,
        session_id=session_laura,
        subject_id=laura_id
    )

    print("\n" + "=" * 75)
    print("VERIFICACIÓN FINAL DE AISLAMIENTO:")
    print(f"Respuesta a Carlos: {ans_carlos}")
    print(f"Respuesta a Laura:  {ans_laura}")
    assert "Servientrega" in ans_carlos, "Fallo: Carlos debía recordar Servientrega."
    assert "Servientrega" not in ans_laura, "Fallo de comportamiento: Laura adoptó la preferencia de Carlos."
    print("\n¡TODAS LAS PRUEBAS DE STATE & MEMORY SUPERADAS CON ÉXITO!")
```

---

## 8. Reto Guiado: Caso F3 — Decisión Pendiente y Reanudación

Hasta ahora, Agent v3 recuerda hechos y preferencias. En este reto también debe recordar que dejó una tarea **en espera de una decisión del usuario**.

Ejemplo esperado:

```text
Usuario: Organiza el envío del pedido ORD-4091.

Agente:
Necesito que elijas la prioridad:
1. Menor costo
2. Entrega más rápida
3. Otra opción

Usuario: Necesito que llegue antes del viernes.
Agente: Continúa la solicitud original aplicando la condición escrita.
```

### 8.1 Regla arquitectónica

Una decisión pendiente **no es todavía una preferencia persistente**:

- La solicitud original, la pregunta, las opciones y la respuesta viven en `SessionMemory` y se aíslan mediante `subject_id` + `session_id`.
- Elegir `2` solo resuelve la tarea actual.
- Solo una frase explícita como *"para todos mis pedidos futuros"* puede pasar por `MemoryPolicy` y convertirse en memoria persistente.
- El agente no ejecuta la acción dependiente mientras la decisión siga en estado `pending`.

No presentes este ejercicio como HITL formal: en L04 estamos practicando continuidad conversacional. Los permisos, aprobaciones sensibles y escalamiento humano se desarrollan en L06.

### 8.2 Contrato mínimo a implementar

Agrega una estructura tipada para representar la pausa:

```python
@dataclass
class PendingDecision:
    decision_id: str
    subject_id: str
    session_id: str
    original_request: str
    question: str
    options: List[str]
    allow_custom_answer: bool = True
    status: str = "pending"
    selected_value: Optional[str] = None
```

Guárdala como un `MemoryItem` de alcance `session` con la clave `pending_decision`. El valor puede ser la instancia serializada o un diccionario equivalente.

### 8.3 Flujo que deben construir

```text
Petición incompleta
      ↓
El modelo propone opciones estructuradas
      ↓
El runtime valida y guarda pending_decision
      ↓
La terminal muestra 1, 2, 3 y solicita texto
      ↓
El usuario elige un número o escribe otra condición
      ↓
El runtime recupera la decisión por subject_id + session_id
      ↓
Valida, marca resolved y reanuda original_request
```

En la versión de terminal, el campo de texto se representa con `input()`:

```python
def ask_user_decision(pending: PendingDecision) -> str:
    print(pending.question)
    for index, option in enumerate(pending.options, start=1):
        print(f"{index}. {option}")
    if pending.allow_custom_answer:
        custom_index = len(pending.options) + 1
        print(f"{custom_index}. Otra opción")

    answer = input("¿Cuál eliges? > ").strip()
    if pending.allow_custom_answer and answer == str(len(pending.options) + 1):
        return input("Describe tu condición > ").strip()
    return answer
```

Implementa la resolución con software determinista:

```python
def resolve_decision(answer: str, pending: PendingDecision) -> str:
    normalized = answer.strip()

    if normalized.isdigit():
        option_index = int(normalized) - 1
        if 0 <= option_index < len(pending.options):
            return pending.options[option_index]

    if pending.allow_custom_answer and normalized:
        return normalized

    raise ValueError("La decisión no contiene una selección válida.")
```

Después de resolverla, actualiza `status="resolved"`, asigna `selected_value` y reanuda la solicitud original. No envíes una respuesta vacía o inválida al modelo como si fuera una decisión válida.

### 8.4 Prueba de aceptación del Caso F3

Construye una demostración reproducible que compruebe:

1. Carlos pide organizar `ORD-4091` sin indicar prioridad.
2. El agente genera dos opciones concretas y una tercera opción `Otra`, que abre la entrada de texto libre.
3. La decisión se guarda con `scope="session"`, `subject_id=carlos_id` y la sesión activa.
4. La respuesta `2` se resuelve como `"Entrega más rápida"`.
5. La respuesta `3` solicita un texto adicional; una condición como `"Debe llegar antes del viernes"` es válida.
6. Laura u otra sesión no pueden consultar ni resolver la decisión de Carlos.
7. Al resolverse, el estado cambia de `pending` a `resolved` y el agente retoma `original_request`.
8. La selección no aparece como preferencia persistente salvo que el usuario lo ordene explícitamente.

Incluye aserciones sobre la frontera de memoria, no solo sobre el texto final del modelo:

```python
carlos_pending = memory_store.search(
    subject_id=carlos_id,
    session_id=session_alpha
)
assert any(m.key == "pending_decision" for m in carlos_pending)

laura_pending = memory_store.search(
    subject_id=laura_id,
    session_id=session_laura
)
assert not any(m.key == "pending_decision" for m in laura_pending)
```

> **Criterio de éxito:** Agent v3 puede pausar una solicitud incompleta, recordar exactamente qué decisión falta, aceptar una opción numerada o texto libre y continuar sin mezclar sesiones ni inventar una preferencia permanente.

---

## 9. Preguntas de Reflexión Técnica para el Grupo

1. **Sobre el costo de tokens:** Si en lugar de inyectar únicamente `preferred_carrier: Servientrega` hubiéramos inyectado los 50 mensajes de chat anteriores, ¿qué habría ocurrido con los tokens de entrada y el tiempo de respuesta del proveedor?
2. **Sobre el aislamiento multitenant:** ¿Por qué un error de diseño donde se omite `subject_id` en `search()` puede ser una vulnerabilidad de seguridad grave según estándares como OWASP Top 10 for LLMs?
3. **El puente hacia L05:** Ya tenemos un agente que usa herramientas, itera en bucle y recuerda hechos del usuario. Si ahora le pedimos que resuelva una tarea compuesta por 8 pasos secuenciales e interdependientes, ¿el agente sabrá estructurar un plan antes de empezar o simplemente improvisará paso a paso? ¿Qué desventajas tiene no contar con una fase previa de **Planning**?
4. **Sobre decisiones pendientes:** ¿Por qué responder `2` en una tarea concreta no autoriza al sistema a guardar esa opción como preferencia permanente para futuras sesiones?
