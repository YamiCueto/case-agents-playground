# M05 · Taller Práctico — Evoluciona Agent v1 a Agent v2

## Guía de implementación para grupos de estudio · CASE Academy

- **Duración recomendada:** 60–75 minutos
- **Modalidad:** Trabajo colaborativo en grupos de estudio
- **Punto de partida obligatorio:** El proyecto funcional de **Agent v1** construido en L02
- **Entregable técnico:** Código Python ejecutable de **Agent v2** con Agent Loop, `max_iterations`, trazabilidad por iteración en consola y Caso D multi-step probado en dominio propio

---

## 1. Principio Rector del Taller

> **"No crees un agente nuevo. Toma el proyecto que construiste en L02 y evoluciónalo."**

En el Taller 02 construiste **Agent v1**: un agente capaz de recibir una consulta, proponer una herramienta estructurada, ejecutarla en Python y devolver el resultado al modelo para obtener una respuesta final.

Ese diseño resolvió con elegancia una consulta de un solo paso. Pero si la tarea exige dos decisiones dependientes (por ejemplo: consultar el estado de una orden y, si está lista, consultar su transportadora), Agent v1 se detiene a mitad de camino porque su runtime solo sabe hacer dos llamadas fijas.

En este taller, transformarás la arquitectura de tu agente: **reemplazarás la segunda inferencia fija por un Agent Loop gobernado por software**.

---

## 2. Mapa de Evolución: De Agent v1 a Agent v2

```text
┌────────────────────────────────────────────────────────┐
│                      AGENT V1                          │
│                                                        │
│  ModelProvider                ✅ SE CONSERVA           │
│  MockModelProvider            ✅ SE CONSERVA (v2)      │
│  OpenAICompatibleProvider     ✅ SE CONSERVA           │
│  Herramientas de tu grupo     ✅ SE CONSERVAN          │
│  Tool Schemas                 ✅ SE CONSERVAN          │
│  TOOL_REGISTRY                ✅ SE CONSERVA           │
│  execute_tool_call()          ✅ SE CONSERVA           │
│  messages (historial)         ✅ SE CONSERVA           │
│                                                        │
│  run_agent_v1()               🔄 EVOLUCIONA            │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                      AGENT V2                          │
│                                                        │
│  Agent Loop (while iterativo) 🆕 NUEVO                 │
│  max_iterations (límite duro) 🆕 NUEVO                 │
│  Trazabilidad por iteración   🆕 NUEVO                 │
│  Caso D (2 pasos dependientes)🆕 NUEVO                 │
│  run_agent_v2()               🆕 NUEVO                 │
└────────────────────────────────────────────────────────┘
```

---

## 3. Checklist de Migración

### No cambies esto todavía
- Tu **dominio de negocio** elegido en L02.
- Tus **datos en memoria** (`DB_...`).
- Tus **dos herramientas de Python** existentes.
- Tus **Tool Schemas** en formato JSON Schema.
- Tu diccionario `TOOL_REGISTRY`.
- Tu función `execute_tool_call(tool_call: ToolCall)`.
- Tus pruebas de regresión de L02: **Caso A** (Tool 1), **Caso B** (Tool 2) y **Caso C** (sin tools). Ambas DEBEN seguir funcionando sin modificaciones.

### Agrega en L03
1. **Conservar `run_agent_v1()`** como referencia histórica y crear `run_agent_v2()`.
2. **Sustituir la segunda llamada fija** por un bucle iterativo (`while`).
3. **Imponer un límite duro de vueltas:** parámetro `max_iterations: int = 5`.
4. **Alimentar de vuelta las observaciones:** por cada herramienta ejecutada, registrar el mensaje del asistente con su `tool_calls` y el mensaje con `role: "tool"` y su `tool_call_id`.
5. **Comprobar la condición de salida normal:** cuando el modelo responda con texto y sin `tool_calls`, concluir y retornar el resultado.
6. **Comprobar la condición de salida forzada:** si se alcanza `max_iterations`, abortar de forma controlada indicando el motivo.
7. **Instrumentar la consola:** imprimir claramente `[ITERATION X]`, `[MODEL PROPOSAL]`, `[ARGUMENTS]`, `[EXECUTION]`, `[OBSERVATION]`.
8. **Diseñar el Caso D (Multi-step):** una consulta en tu dominio donde el segundo paso dependa estrictamente del resultado del primero.

---

## 4. Dos Modos de Ejecución

Al igual que en L02, este taller soporta dos modalidades de trabajo:

### Modo A — Simulación determinista sin API Keys (Camino Base Recomendado)
- Utiliza únicamente la **biblioteca estándar de Python** (`json`, `sys`, `typing`, `dataclasses`).
- No requiere claves de API, cuentas externas, saldos ni internet.
- Utiliza **`MockModelProvider v2`**, que implementa una simulación determinista basada en el historial de mensajes acumulado y la última observación recibida.
- Es 100% suficiente para validar la arquitectura del Agent Loop, el despacho secuencial y los límites operacionales.

### Modo B — Proveedor Real Opcional (Adapter Desacoplado)
- Conecta a un LLM real (OpenAI, Groq, Mistral, Ollama local, etc.) usando `OpenAICompatibleProvider`.
- Permite observar cómo el modelo toma decisiones dinámicas en lenguaje natural paso a paso.
- Utiliza exactamente las mismas funciones, esquemas y loop que el Modo A.

---

## 5. Hitos de Trabajo y Tiempos Estimados

| Hito | Actividad | Tiempo |
|---|---|---|
| **Hito 1** | Verificación de Agent v1 y duplicación de función a `run_agent_v2` | 10 min |
| **Hito 2** | Implementación del Agent Loop mínimo con `max_iterations` | 20 min |
| **Hito 3** | Configuración de `MockModelProvider v2` y validación de Casos A, B y C | 15 min |
| **Hito 4** | Diseño e implementación del Caso D Multi-Step dependiente | 15 min |
| **Hito 5** | Prueba de límite operacional (`max_iterations = 1`) y discusión conceptual | 10 min |

---

## 6. Scaffolding y Código de Evolución

Abre tu archivo `agent_v1.py` de L02 (o crea una copia `agent_v2.py`). A continuación se detallan las piezas que evolucionan.

### 6.1 Estructuras de Datos y Contratos (Se Conservan)

```python
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass
class ModelResponse:
    content: Optional[str]
    tool_calls: List[ToolCall] = field(default_factory=list)


class ModelProvider:
    def generate(self, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]) -> ModelResponse:
        raise NotImplementedError
```

### 6.2 MockModelProvider v2: Simulación Determinista del Loop

En L02, el mock respondía con una regla directa. En L03, `MockModelProvider v2` inspecciona el historial de mensajes para determinar la transición del protocolo:

```python
class MockModelProviderV2(ModelProvider):
    """
    Simulador determinista de protocolo para Agent Loop (L03).
    No razona semánticamente: simula de forma estructurada las transiciones
    de un LLM con tool calling basándose en los mensajes y observaciones acumuladas.
    """
    def __init__(self, step_rules: Dict[str, Any]):
        """
        step_rules define las transiciones del escenario.
        Ejemplo para pedido de dos pasos:
        {
            "initial_trigger": "ORD-4091",
            "step_1_tool": "get_order_status",
            "step_1_args": {"order_id": "ORD-4091"},
            "condition_key": "status",
            "condition_value": "ready_to_ship",
            "step_2_tool": "get_shipping_provider",
            "step_2_args": {"order_id": "ORD-4091"},
            "final_template": "El pedido {order_id} se encuentra listo para despacho y asignado a la transportadora {carrier} con guia {tracking}."
        }
        """
        self.rules = step_rules

    def generate(self, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]) -> ModelResponse:
        # Extraer la última consulta del usuario
        user_msgs = [m for m in messages if m.get("role") == "user"]
        user_query = user_msgs[-1]["content"] if user_msgs else ""

        # Extraer todas las observaciones de herramientas (role: 'tool')
        tool_observations: List[Dict[str, Any]] = []
        for m in messages:
            if m.get("role") == "tool":
                try:
                    tool_observations.append(json.loads(m.get("content", "{}")))
                except Exception:
                    pass

        # CASO 1: Consulta directa o conceptual sin tools
        if not any(keyword in user_query.lower() for keyword in self.rules.get("tool_keywords", [])):
            if "direct_responses" in self.rules:
                for kw, ans in self.rules["direct_responses"].items():
                    if kw in user_query.lower():
                        return ModelResponse(content=ans, tool_calls=[])
            return ModelResponse(content="Entendido. Consulta resuelta directamente sin necesidad de consultar herramientas externas.", tool_calls=[])

        # CASO 2: Sin observaciones previas -> Emitir Paso 1
        if len(tool_observations) == 0:
            tc = ToolCall(
                id="call_mock_step_1",
                name=self.rules["step_1_tool"],
                arguments=self.rules["step_1_args"]
            )
            return ModelResponse(content=None, tool_calls=[tc])

        # CASO 3: Tenemos la observación del Paso 1 -> Evaluar si requiere Paso 2
        if len(tool_observations) == 1:
            obs1 = tool_observations[0]
            cond_key = self.rules.get("condition_key")
            cond_val = self.rules.get("condition_value")

            # Si la condición para el paso 2 se cumple, proponer Tool B
            if cond_key and obs1.get(cond_key) == cond_val and "step_2_tool" in self.rules:
                tc2 = ToolCall(
                    id="call_mock_step_2",
                    name=self.rules["step_2_tool"],
                    arguments=self.rules.get("step_2_args", {})
                )
                return ModelResponse(content=None, tool_calls=[tc2])
            else:
                # Si no requiere paso 2, sintetizar respuesta con lo que se tiene
                return ModelResponse(
                    content=f"Resultado de la consulta: {json.dumps(obs1)}",
                    tool_calls=[]
                )

        # CASO 4: Tenemos dos o más observaciones -> Emitir Final Answer
        if len(tool_observations) >= 2:
            obs1 = tool_observations[0]
            obs2 = tool_observations[1]
            summary = self.rules.get(
                "final_template",
                "Operacion multi-step completada exitosamente."
            ).format(**{**obs1, **obs2, **self.rules.get("step_1_args", {})})
            return ModelResponse(content=summary, tool_calls=[])

        return ModelResponse(content="No se pudo determinar el siguiente paso del protocolo.", tool_calls=[])
```

### 6.3 Despachador de Ejecución (Se Conserva)

```python
TOOL_REGISTRY: Dict[str, Callable[..., Dict[str, Any]]] = {}
TOOLS_SCHEMAS: List[Dict[str, Any]] = []


def execute_tool_call(tool_call: ToolCall) -> Dict[str, Any]:
    func_name = tool_call.name
    if func_name not in TOOL_REGISTRY:
        return {
            "error": "herramienta_no_encontrada",
            "message": f"La herramienta {func_name} no esta registrada en el runtime local."
        }

    target_function = TOOL_REGISTRY[func_name]
    try:
        result = target_function(**tool_call.arguments)
        return result
    except TypeError as err:
        return {
            "error": "parametros_invalidos",
            "message": f"Fallo al invocar la funcion en Python: {str(err)}"
        }
    except Exception as err:
        return {
            "error": "error_de_ejecucion",
            "message": f"Excepcion capturada en Python: {str(err)}"
        }
```

### 6.4 El Agent Loop: `run_agent_v2` (La Pieza Nueva Central)

Aquí reside la evolución técnica de L03. Compara mentalmente esta estructura con los dos saltos lineales de L02:

```python
def run_agent_v2(user_query: str, provider: ModelProvider, max_iterations: int = 5) -> str:
    """
    Ejecuta el Agent Loop de Agent v2 (L03).

    Flujo de control:
    1. Acumula mensajes en el estado de ejecucion (messages).
    2. Itera hasta que el modelo emita Final Answer o se alcance max_iterations.
    3. Cada vuelta representa una inferencia HTTP independiente.
    4. Python valida, despacha en CPU y realimenta observaciones.
    """
    print("=" * 65)
    print("INICIO DE EJECUCION — AGENT LOOP (AGENT V2)")
    print("=" * 65)
    print(f"[USER QUERY] '{user_query}'")

    # Inicializar el estado de ejecucion con el mensaje del usuario
    messages: List[Dict[str, Any]] = [{"role": "user", "content": user_query}]
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"\n{'─' * 25} [ITERATION {iteration} / {max_iterations}] {'─' * 25}")
        print(f"[RUNTIME] Enviando contexto ({len(messages)} mensajes acumulados) al proveedor...")

        # Inferencia actual (HTTP call independiente)
        response = provider.generate(messages=messages, tools=TOOLS_SCHEMAS)

        # CONDICIÓN DE PARADA 1: Final Answer (Terminación normal)
        if not response.tool_calls:
            print("[MODEL] El modelo concluyo que tiene evidencia suficiente. Emitiendo respuesta final:")
            print(f"\n[FINAL ANSWER]\n{response.content}\n")
            return response.content or ""

        # PROCESAMIENTO DE ACCIONES: El modelo solicita herramientas
        for tool_call in response.tool_calls:
            print(f"[MODEL] Propuesta de Tool: '{tool_call.name}' (ID: {tool_call.id})")
            print(f"[ARGUMENTS] {json.dumps(tool_call.arguments, indent=2)}")

            # Ejecución física en la CPU
            print("[EXECUTION] Ejecutando funcion en el runtime de Python...")
            result = execute_tool_call(tool_call)
            print(f"[OBSERVATION] Resultado obtenido: {json.dumps(result)}")

            # Realimentación del protocolo:
            # 1. Anexar la propuesta del asistente
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.name,
                            "arguments": json.dumps(tool_call.arguments)
                        }
                    }
                ]
            })

            # 2. Anexar la observacion producida por la ejecucion
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": tool_call.name,
                "content": json.dumps(result)
            })

    # CONDICIÓN DE PARADA 2: Límite Operacional de Iteraciones Alcanzado
    print(f"\n{'!' * 65}")
    print(f"[STOPPED] LIMITE OPERACIONAL ALCANZADO: max_iterations={max_iterations}")
    print("El runtime aborto la ejecucion para evitar bucles infinitos y sobrecostos.")
    print(f"{'!' * 65}\n")
    return f"Error: La tarea no concluyo en {max_iterations} iteraciones permitidas."
```

---

## 7. Batería de Pruebas Obligatoria

Cada grupo de estudio debe ejecutar 5 pruebas en su terminal:

### Pruebas de Regresión (Heredadas de L02 — No deben romperse)
- **Caso A (Tool 1):** Consulta que activa únicamente tu primera herramienta. Debe resolverse en **2 iteraciones** (Iteración 1: Tool 1 → Iteración 2: Final Answer).
- **Caso B (Tool 2):** Consulta que activa únicamente tu segunda herramienta. Debe resolverse en **2 iteraciones** (Iteración 1: Tool 2 → Iteración 2: Final Answer).
- **Caso C (Sin Tools):** Pregunta conceptual o saludo. Debe resolverse en **1 iteración** (Iteración 1: Final Answer directa).

### Nuevas Pruebas de L03
- **Caso D (Multi-Step Dependiente):** Consulta que requiere que la herramienta 2 se ejecute únicamente tras observar el resultado de la herramienta 1. Debe resolverse en **3 iteraciones**:
  - Iteración 1: Propuesta y ejecución de Tool A.
  - Iteración 2: Observación de Tool A → Propuesta y ejecución de Tool B.
  - Iteración 3: Ambas observaciones en contexto → Final Answer.
- **Caso E (Condición de Parada forzada):** Ejecuta la misma consulta del Caso D pero configurando `max_iterations = 1`.
  - Debe imprimir el aborto controlado del runtime: `[STOPPED] LIMITE OPERACIONAL ALCANZADO: max_iterations=1`.
  - Debe demostrar que el sistema no entra en bucle infinito y que el control reside en Python.

---

## 8. Ejemplo Integrado de Dominio (E-Commerce / Logística)

Para los equipos que deseen una referencia concreta, aquí está la implementación de prueba:

```python
# Dominio de Pedidos y Logística
DB_ORDERS = {
    "ORD-4091": {
        "status": "ready_to_ship",
        "carrier_id": "CARRIER-SERV",
        "destination": "Medellin"
    },
    "ORD-1002": {
        "status": "processing",
        "carrier_id": None,
        "destination": "Bogota"
    }
}

DB_CARRIERS = {
    "CARRIER-SERV": {
        "carrier": "Servientrega",
        "tracking": "SE-992144",
        "eta": "24 horas"
    },
    "CARRIER-ENV": {
        "carrier": "Envía",
        "tracking": "ENV-551200",
        "eta": "48 horas"
    }
}

def get_order_status(order_id: str) -> dict:
    order = DB_ORDERS.get(order_id.strip().upper())
    if not order:
        return {"error": "orden_no_encontrada"}
    return {
        "order_id": order_id,
        "status": order["status"],
        "carrier_id": order["carrier_id"]
    }

def get_shipping_provider(order_id: str) -> dict:
    order = DB_ORDERS.get(order_id.strip().upper())
    if not order or not order["carrier_id"]:
        return {"error": "sin_transportadora_asignada"}
    carrier_info = DB_CARRIERS.get(order["carrier_id"], {})
    return {
        "order_id": order_id,
        "carrier": carrier_info.get("carrier", "Desconocida"),
        "tracking": carrier_info.get("tracking", "N/A"),
        "eta": carrier_info.get("eta", "Pendiente")
    }

# Registrar herramientas
TOOL_REGISTRY["get_order_status"] = get_order_status
TOOL_REGISTRY["get_shipping_provider"] = get_shipping_provider

TOOLS_SCHEMAS = [
    {
        "name": "get_order_status",
        "description": "Consulta el estado actual de preparacion de una orden de compra.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Codigo identificador del pedido."}
            },
            "required": ["order_id"]
        }
    },
    {
        "name": "get_shipping_provider",
        "description": "Consulta la transportadora y guia asignada a un pedido listo para despacho.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Codigo identificador del pedido."}
            },
            "required": ["order_id"]
        }
    }
]

if __name__ == "__main__":
    # Reglas deterministas para simular el caso de dos pasos
    rules_demo = {
        "tool_keywords": ["orden", "pedido", "ord-4091", "transportadora", "despacho"],
        "step_1_tool": "get_order_status",
        "step_1_args": {"order_id": "ORD-4091"},
        "condition_key": "status",
        "condition_value": "ready_to_ship",
        "step_2_tool": "get_shipping_provider",
        "step_2_args": {"order_id": "ORD-4091"},
        "final_template": "El pedido {order_id} se encuentra '{status}'. Ha sido asignado a {carrier} con numero de guia {tracking} y tiempo estimado de entrega {eta}.",
        "direct_responses": {
            "hola": "¡Hola! Soy tu asistente de logistica. ¿En que puedo ayudarte hoy?",
            "que es": "Soy un sistema operativo de agentes para seguimiento de ordenes."
        }
    }

    provider = MockModelProviderV2(step_rules=rules_demo)

    print("\n--- PRUEBA CASO D (MULTI-STEP DEPENDIENTE) ---")
    query_d = "Consulta el estado del pedido ORD-4091 y, si esta listo para despacho, consulta su transportadora."
    run_agent_v2(query_d, provider, max_iterations=5)

    print("\n--- PRUEBA CASO E (CONDICIÓN DE PARADA FORZADA) ---")
    run_agent_v2(query_d, provider, max_iterations=1)
```

---

## 9. Adaptación a Tu Dominio Propio

No estás obligado a usar el dominio de pedidos. Adapta el Caso D al dominio que tu grupo eligió en L02:

| Dominio | Paso 1 (Tool A) | Condición observada | Paso 2 (Tool B) | Final Answer |
|---|---|---|---|---|
| **Salud / Clínica** | `get_patient_info(id)` | Alergia = `"penicilina"` | `check_drug_contraindications(med)` | Alerta clínica y alternativa sugerida |
| **Fintech / Banca** | `check_account_balance(id)` | Saldo > $5,000 USD | `get_investment_products(tier)` | Oferta de fondo de inversión premium |
| **IT / DevOps** | `check_server_status(srv)` | Estado = `"offline"` | `restart_service(srv)` | Confirmación de reinicio y reporte |
| **Soporte SaaS** | `get_subscription_plan(user)` | Plan = `"Enterprise"` | `escalate_to_dedicated_sla(user)` | Ticket prioritario asignado a agente humano |

---

## 10. Preguntas de Reflexión Técnica para el Grupo

Al finalizar la ejecución, discutan en equipo y anoten sus conclusiones:

1. **Sobre el bucle:** ¿Por qué es fundamental que cada vuelta del bucle añada tanto el mensaje del asistente con `tool_calls` como el mensaje con `role: "tool"`? ¿Qué ocurriría con la coherencia del LLM si solo enviáramos los resultados sin recordar qué herramienta los solicitó?
2. **Sobre los límites:** ¿Por qué la condición `max_iterations` debe estar programada de forma estricta en el `while` en lugar de simplemente pedirle al LLM en el prompt: *"Deténte después de 3 pasos"*?
3. **El puente hacia L04:** Cuando la llamada a `run_agent_v2()` termina y retorna el string de la respuesta final, la variable local `messages` desaparece de la memoria RAM. Si el usuario escribe una pregunta de seguimiento ("¿Y a qué hora llega?"), ¿el agente recordará qué pedido consultó? ¿Cómo deberíamos estructurar el software para resolver esto sin acumular tokens infinitamente?
