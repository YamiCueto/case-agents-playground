# M05 · Taller Práctico — Evoluciona Agent v3 a Agent v4: Planning & Task Decomposition

## Guía de implementación para grupos de estudio · CASE Academy

- **Duración recomendada:** 60–75 minutos
- **Modalidad:** Trabajo colaborativo en grupos de estudio
- **Punto de partida obligatorio:** El proyecto funcional de **Agent v3** construido en L04
- **Entregable técnico:** Código Python ejecutable de **Agent v4** con `Plan`, `PlanStep`, `StepStatus`, `StepExecutor`, `PlanValidator`, `MockPlanner`, `ExecutionState` correlacionado, gobernanza del runtime, salida segura `no_executable_steps`, historial inmutable de revisiones y validación de los **Casos G1** (planificación estructurada), **Caso G2** (replanning con conservación de historia e invariante de meta) y **Caso G3** (bloqueo por dependencias irresolubles).

---

## 1. Principio Rector del Taller

> **"No crees un agente nuevo. Toma el proyecto de Agent v3 que construiste en L04 y dótalo de Planificación y Descomposición de Tareas."**

En el Taller 04 construiste **Agent v3**: un agente dotado de memoria de sesión, persistencia por `subject_id` e hidratación controlada de contexto. 

Sin embargo, Agent v3 tiene una limitación operativa: **es puramente reactivo**.
- Cuando el usuario formula una meta de múltiples pasos dependientes (*"Revisa los incidentes recientes, correlaciónalos con el último despliegue y emite una recomendación"*), Agent v3 solo decide el *siguiente paso inmediato* tras cada observación.
- No sabe qué pasos faltan, qué dependencias existen entre ellos, ni cuándo una hipótesis de trabajo ha quedado invalidada.
- Si una herramienta intermedia falla, tiende a reintentar a ciegas o a perder el rumbo (*plan drift*).

En este taller convertiremos la meta compleja en una **estructura de datos observable y tipada** en software, gobernada por el runtime.

---

## 2. Mapa de Evolución: De Agent v3 a Agent v4

```text
┌────────────────────────────────────────────────────────┐
│                      AGENT V3                          │
│                                                        │
│  ModelProvider / MockModelProviderV3  ✅ SE CONSERVA   │
│  TOOL_REGISTRY & execute_tool_call()  ✅ SE CONSERVA   │
│  Agent Loop (while iterativo)         ✅ SE CONSERVA   │
│  max_iterations                       ✅ SE CONSERVA   │
│  MemoryItem, MemoryStore, Scope       ✅ SE CONSERVA   │
│  hydrate_context() & write_back()     ✅ SE CONSERVA   │
│  Pruebas A, B, C, D, E, F1, F2        ✅ SE CONSERVAN  │
│                                                        │
│  ExecutionState                       🔄 EVOLUCIONA    │
│  run_agent_v3()                       🔄 EVOLUCIONA    │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                      AGENT V4                          │
│                                                        │
│  StepStatus & StepExecutor            🆕 NUEVO         │
│  PlanStep (unidad de trabajo)         🆕 NUEVO         │
│  Plan (is_completed, clone snapshot)  🆕 NUEVO         │
│  PlanValidator (integridad estructural)🆕 NUEVO        │
│  Planner / MockPlanner                🆕 NUEVO         │
│  ExecutionState (current_plan+history)🆕 NUEVO         │
│  Detección no_executable_steps        🆕 NUEVO         │
│  Replanning (historial + goal invariant)🆕 NUEVO       │
│  Caso G1 (Structured Planning)        🆕 NUEVO         │
│  Caso G2 (Replanning & Revision Hist) 🆕 NUEVO         │
│  Caso G3 (Deadlock Detection)         🆕 NUEVO         │
│  run_agent_v4()                       🆕 NUEVO         │
└────────────────────────────────────────────────────────┘
```

---

## 3. Las Tres Reglas Arquitectónicas Inviolables de L05

1. **Planning ≠ Chain-of-Thought:**
   - La planificación agéntica **no es** pedirle al modelo *"piensa paso por paso"* en lenguaje natural libre dentro de una cadena de texto oculta.
   - El plan es una **estructura de datos externa, observable, validable y tipada** (`Plan`, `PlanStep`, `StepStatus`) gobernada por el runtime de software.
2. **PlanStep ≠ Tool Call (Diversidad de Ejecutores):**
   - Un paso del plan no equivale necesariamente a invocar una herramienta externa.
   - Formalizamos tres ejecutores posibles: `TOOL` (función en catálogo), `RUNTIME` (transformación/cruce algorítmico local) y `MODEL` (síntesis textual o inferencia de alto nivel).
3. **Invariante de Meta y Conservación de Historia en Replanning:**
   - Replanificar ante una contingencia no es borrar el pasado ni empezar de cero. Las revisiones previas se preservan en `plan_history` como snapshots independientes.
   - El replanning puede cambiar pasos, ejecutores y rutas alternativas, pero **jamás puede alterar silenciosamente la meta (`goal`) original**. Si la meta cambia, debe provenir del usuario o de una instrucción explícita del runtime.

---

## 4. Checklist de Migración

### No cambies esto
- Tu catálogo de herramientas simuladas (`TOOL_REGISTRY`).
- Tu `MemoryStore` y política de aislamiento por `subject_id` construidos en L04.
- El principio de `max_iterations` como circuit breaker inviolable.
- Casos de prueba existentes: **A, B, C, D, E, F1 y F2**.

### Agrega en L05
1. **`StepStatus`:** Enum con `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `SKIPPED`.
2. **`StepExecutor`:** Enum con `TOOL`, `RUNTIME`, `MODEL`.
3. **`PlanStep`:** Dataclass con `id`, `action`, `description`, `executor`, `status`, `depends_on` y `observation`.
4. **`Plan`:** Dataclass con `goal`, `steps`, `revision`, propiedad calculada `is_completed` y método `clone()`.
5. **`PlanValidator`:** Función de validación estructural previa a la ejecución.
6. **`MockPlanner`:** Generador determinista de planes iniciales y replanes adaptativos.
7. **`ExecutionState`:** Enriquecido con `current_plan` y `plan_history`.
8. **`run_agent_v4()`:** Orquestador de Hydration → Planning → Validation → Step Execution → Replan → Write-back.
9. **Casos G1, G2 y G3.**

---

## 5. Hitos de Trabajo y Tiempos Estimados

| Hito | Actividad | Tiempo |
|---|---|---|
| **Hito 1** | Modelado de datos: `StepStatus`, `StepExecutor`, `PlanStep` y `Plan` | 15 min |
| **Hito 2** | Implementación de `PlanValidator` y `MockPlanner` con invariante de meta | 15 min |
| **Hito 3** | Evolución de `ExecutionState` y bucle de ejecución de pasos en `run_agent_v4()` | 15 min |
| **Hito 4** | Manejo de contingencias: snapshot archiving, replanning y `no_executable_steps` | 15 min |
| **Hito 5** | Verificación integral en terminal de los Casos G1, G2 y G3 | 15 min |

---

## 6. Scaffolding y Código de Evolución

Crea tu archivo de trabajo `agent_v4.py` (o extiende tu script de L04).

### 6.1 Modelo de Datos del Plan y Ejecución

```python
import copy
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set


# ---------------------------------------------------------------------------
# ESTADOS Y EJECUTORES DE PASOS
# ---------------------------------------------------------------------------
class StepStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"  # Paso omitido justificadamente (ej. rama alternativa)


class StepExecutor(Enum):
    TOOL = "tool"        # Invoca una función externa registrada en TOOL_REGISTRY
    RUNTIME = "runtime"  # Transformación o cruce algorítmico local en CPU
    MODEL = "model"      # Inferencia o síntesis textual generada por el LLM


# ---------------------------------------------------------------------------
# PLAN Y PLANSTEP (El plan como datos observables)
# ---------------------------------------------------------------------------
@dataclass
class PlanStep:
    id: str
    action: str
    description: str
    executor: StepExecutor = StepExecutor.TOOL
    status: StepStatus = StepStatus.PENDING
    depends_on: List[str] = field(default_factory=list)
    observation: Optional[Dict[str, Any]] = None
    required: bool = True               # Si es crítico para satisfacer el objetivo
    skip_reason: Optional[str] = None   # Motivo explícito autorizado por runtime/replanning


@dataclass
class Plan:
    goal: str
    steps: List[PlanStep]
    current_step_id: Optional[str] = None
    revision: int = 1

    @property
    def is_completed(self) -> bool:
        """
        Completitud derivada: el plan termina cuando todos sus pasos
        están resueltos.
        Semántica estricta de SKIPPED: un paso omitido solo cuenta como
        resuelto si su omisión fue autorizada por el runtime (no es required
        o cuenta con un skip_reason formal asignado por replanning).
        Evita discrepancias de dos fuentes de verdad y asegura que steps
        críticos no se omitan silenciosamente.
        """
        if not self.steps:
            return False
        for s in self.steps:
            if s.status == StepStatus.COMPLETED:
                continue
            elif s.status == StepStatus.SKIPPED:
                if s.required and not s.skip_reason:
                    return False
            else:
                return False
        return True

    def clone(self) -> 'Plan':
        """
        Crea un snapshot profundo e independiente del estado actual del Plan.
        Los snapshots archivados en plan_history no se vuelven a mutar por ejecución normal.
        """
        return copy.deepcopy(self)


# ---------------------------------------------------------------------------
# NIVEL 1 EVOLUCIONADO: ExecutionState para Agent v4
# ---------------------------------------------------------------------------
@dataclass
class ExecutionState:
    run_id: str
    session_id: str
    subject_id: str
    messages: List[Dict[str, Any]]
    iteration: int = 0
    max_iterations: int = 8
    last_observation: Optional[Dict[str, Any]] = None
    termination_reason: Optional[str] = None
    tool_calls_executed: List[str] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)

    # Correlación con el plan en Agent v4:
    current_plan: Optional[Plan] = None
    plan_history: List[Plan] = field(default_factory=list)
```

---

### 6.2 Validación Estructural del Plan (`PlanValidator`)

```python
class PlanValidationError(Exception):
    pass


class PlanValidator:
    """
    Gobernanza del runtime sobre la integridad estructural del plan ANTES de ejecutar.
    Separa explícitamente:
    A. VALIDATION-TIME FAILURE: Meta vacía, pasos sin id, dependencias inexistentes,
       auto-dependencias y ciclos estáticos detectados en el grafo inicial.
       Si falla, levanta PlanValidationError y el plan NO entra al runtime.
    B. RUNTIME STALL: Estancamiento durante la ejecución porque un paso falló
       sin ruta de replanning y los pasos pendientes no pueden ejecutarse.
    """
    @staticmethod
    def validate(plan: Plan) -> None:
        if not plan.goal or not plan.goal.strip():
            raise PlanValidationError("El plan carece de una meta ('goal') definida.")

        if not plan.steps:
            raise PlanValidationError("El plan debe contener al menos un paso.")

        step_ids: Set[str] = set()
        for step in plan.steps:
            if not step.id or not step.id.strip():
                raise PlanValidationError("Existe un paso sin identificador unívoco ('id').")
            if step.id in step_ids:
                raise PlanValidationError(f"Identificador de paso duplicado: '{step.id}'.")
            step_ids.add(step.id)

        # Validación de dependencias existentes y auto-dependencias
        for step in plan.steps:
            for dep in step.depends_on:
                if dep == step.id:
                    raise PlanValidationError(f"Paso '{step.id}' tiene auto-dependencia consigo mismo.")
                if dep not in step_ids:
                    raise PlanValidationError(
                        f"Paso '{step.id}' depende de un paso inexistente: '{dep}'."
                    )

        # Detección estática de ciclos (Validation-Time failure)
        visited: Dict[str, int] = {}  # 0: unvisited, 1: visiting, 2: visited
        adj: Dict[str, List[str]] = {s.id: list(s.depends_on) for s in plan.steps}

        def has_cycle(node: str) -> bool:
            visited[node] = 1
            for neighbor in adj.get(node, []):
                if visited.get(neighbor, 0) == 1:
                    return True
                if visited.get(neighbor, 0) == 0:
                    if has_cycle(neighbor):
                        return True
            visited[node] = 2
            return False

        for s in plan.steps:
            if visited.get(s.id, 0) == 0:
                if has_cycle(s.id):
                    raise PlanValidationError(f"Ciclo estático detectado en la estructura del plan que involucra a '{s.id}'.")
```

---

### 6.3 Planner Determinista (`MockPlanner`) con Invariante de Meta

```python
class MockPlanner:
    """
    Planificador determinista para pruebas offline y reproducibilidad en grupos de estudio.
    En un entorno productivo, esta clase invocaría al LLM con un schema estructurado JSON.
    """
    def create_plan(self, goal: str, context_memories: str = "") -> Plan:
        goal_lower = goal.lower()

        # Escenario de investigación técnica: Incidentes vs Despliegues
        if "incidente" in goal_lower or "despliegue" in goal_lower or "auditar" in goal_lower:
            steps = [
                PlanStep(
                    id="S1",
                    action="get_recent_incidents",
                    description="Consultar incidentes críticos de las últimas 24 horas",
                    executor=StepExecutor.TOOL,
                    depends_on=[]
                ),
                PlanStep(
                    id="S2",
                    action="get_latest_deployment",
                    description="Obtener detalles y commits del despliegue más reciente",
                    executor=StepExecutor.TOOL,
                    depends_on=[]
                ),
                PlanStep(
                    id="S3",
                    action="correlate_incidents_with_deployment",
                    description="Cruzar timestamps y microservicios entre incidentes y despliegue",
                    executor=StepExecutor.RUNTIME,
                    depends_on=["S1", "S2"]
                ),
                PlanStep(
                    id="S4",
                    action="generate_incident_recommendation",
                    description="Sintetizar hallazgos y redactar recomendación técnica para ingeniería",
                    executor=StepExecutor.MODEL,
                    depends_on=["S3"]
                )
            ]
            return Plan(goal=goal, steps=steps, revision=1)

        # Plan por defecto genérico de 2 pasos
        return Plan(
            goal=goal,
            steps=[
                PlanStep(id="S1", action="analyze_query", description="Analizar requerimiento", executor=StepExecutor.RUNTIME),
                PlanStep(id="S2", action="synthesize_response", description="Elaborar respuesta", executor=StepExecutor.MODEL, depends_on=["S1"])
            ],
            revision=1
        )

    def replan(self, current_plan: Plan, failed_step: PlanStep, observation: Dict[str, Any]) -> Optional[Plan]:
        """
        Genera una nueva revisión adaptativa del plan ante un fallo.
        INVARIANTE ESTRICTA: El 'goal' no puede ser modificado por el replanning.
        Si no existe estrategia alternativa para el paso fallido, retorna None (provoca Runtime Stall).
        """
        # Creación de nueva revisión a partir del snapshot independiente
        new_plan = current_plan.clone()
        new_plan.revision = current_plan.revision + 1

        # Comprobar invariante de meta
        assert new_plan.goal == current_plan.goal, "Violación de invariante: replanning alteró la meta original."

        # Estrategia de contingencia para fallo en S2 (servicio de despliegues no disponible)
        if failed_step.id == "S2":
            # Marcamos S2 como SKIPPED justificado con skip_reason formal (autorizado por replanning)
            for s in new_plan.steps:
                if s.id == "S2":
                    s.status = StepStatus.SKIPPED
                    s.skip_reason = "Sustituido por paso de contingencia S2b (fuente local en caché)"
                    s.observation = observation

            # Insertamos paso alternativo S2b que consulta el snapshot/cache local
            fallback_step = PlanStep(
                id="S2b",
                action="get_deployment_from_cache",
                description="Consultar metadatos del despliegue en caché local de contingencia",
                executor=StepExecutor.TOOL,
                status=StepStatus.PENDING,
                depends_on=[],
                required=True
            )

            # Reajustar dependencias de S3: ahora depende de S1 y S2b (en lugar de S2)
            for s in new_plan.steps:
                if s.id == "S3":
                    s.depends_on = ["S1", "S2b"]

            # Insertar S2b justo después de S2
            idx_s2 = next(i for i, s in enumerate(new_plan.steps) if s.id == "S2")
            new_plan.steps.insert(idx_s2 + 1, fallback_step)
            return new_plan

        return None
```

---

### 6.4 Herramientas y Ejecutores Simulados

```python
# Herramientas del dominio DevOps / Confiabilidad
SIMULATED_DATA = {
    "incidents": [
        {"id": "INC-881", "service": "billing-api", "status": "critical", "latency_ms": 4200, "timestamp": "2026-09-15T18:30:00Z"},
        {"id": "INC-882", "service": "auth-proxy", "status": "resolved", "latency_ms": 120, "timestamp": "2026-09-15T14:10:00Z"}
    ],
    "latest_deployment": {
        "version": "v3.1.2",
        "service": "billing-api",
        "author": "dev-team-core",
        "timestamp": "2026-09-15T18:15:00Z",
        "commits": ["fix: optimize db pool", "feat: new payment gateway connector"]
    },
    "cached_deployment": {
        "version": "v3.1.2-cache",
        "service": "billing-api",
        "author": "dev-team-core",
        "timestamp": "2026-09-15T18:15:00Z",
        "source": "local_redis_mirror"
    }
}

# Flag para simular corte de red en Caso G2
SIMULATE_DEPLOYMENT_SERVICE_DOWN = False


def execute_tool(action: str, arguments: Dict[str, Any] = None) -> Dict[str, Any]:
    """Ejecutor de herramientas externas (StepExecutor.TOOL)."""
    global SIMULATE_DEPLOYMENT_SERVICE_DOWN
    if action == "get_recent_incidents":
        return {"status": "success", "count": 2, "incidents": SIMULATED_DATA["incidents"]}

    elif action == "get_latest_deployment":
        if SIMULATE_DEPLOYMENT_SERVICE_DOWN:
            return {"status": "error", "code": 503, "error": "Service Unavailable: Deployment Gateway Timeout"}
        return {"status": "success", "deployment": SIMULATED_DATA["latest_deployment"]}

    elif action == "get_deployment_from_cache":
        return {"status": "success", "source": "cache", "deployment": SIMULATED_DATA["cached_deployment"]}

    elif action == "unrecoverable_legacy_call":
        return {"status": "error", "code": 500, "error": "Fatal: Legacy subsystem permanent failure"}

    return {"status": "error", "error": f"Tool desconocida: {action}"}


def execute_runtime_action(action: str, state: ExecutionState) -> Dict[str, Any]:
    """Ejecutor determinista de software local (StepExecutor.RUNTIME)."""
    if action == "correlate_incidents_with_deployment":
        # Cruza las observaciones previas de los pasos completados
        incidents_obs = next(
            s.observation for s in state.current_plan.steps
            if s.id == "S1" and s.status == StepStatus.COMPLETED
        )
        deployment_obs = next(
            s.observation for s in state.current_plan.steps
            if s.id in {"S2", "S2b"} and s.status == StepStatus.COMPLETED
        )

        matched_service = deployment_obs["deployment"]["service"]
        affected_incidents = [
            inc for inc in incidents_obs["incidents"]
            if inc["service"] == matched_service
        ]

        return {
            "status": "success",
            "correlation_found": True,
            "suspect_deployment": deployment_obs["deployment"]["version"],
            "correlated_incidents": affected_incidents
        }

    return {"status": "success", "note": "Operación de runtime completada"}


def execute_model_action(action: str, state: ExecutionState) -> Dict[str, Any]:
    """Ejecutor de síntesis o inferencia con LLM (StepExecutor.MODEL)."""
    if action == "generate_incident_recommendation":
        correlation_step = next(
            s for s in state.current_plan.steps
            if s.id == "S3" and s.status == StepStatus.COMPLETED
        )
        corr_data = correlation_step.observation

        summary = (
            f"El despliegue {corr_data['suspect_deployment']} impactó directamente "
            f"al servicio {corr_data['correlated_incidents'][0]['service']}, "
            f"provocando el incidente {corr_data['correlated_incidents'][0]['id']}. "
            "Recomendación: ejecutar rollback inmediato a la versión v3.1.1."
        )
        return {"status": "success", "recommendation": summary}

    return {"status": "success", "recommendation": "Meta procesada."}
```

---

### 6.5 Orquestador Principal: `run_agent_v4()`

```python
def run_agent_v4(
    goal: str,
    planner: MockPlanner,
    max_iterations: int = 8,
    session_id: str = "sess_default",
    subject_id: str = "usr_engineer_01"
) -> ExecutionState:
    """
    Ejecutor de Agent v4:
    1. Genera el Plan inicial para la meta.
    2. Valida la integridad estructural del Plan con PlanValidator.
    3. Selecciona paso a paso la tarea ejecutable respetando dependencias.
    4. Detecta deadlocks ('no_executable_steps') sin caer en bucle infinito.
    5. Ejecuta con el ejecutor adecuado (TOOL, RUNTIME o MODEL).
    6. Intercepta fallos, archiva snapshot independiente en plan_history y replanifica.
    7. Concluye cuando se satisface is_completed o se alcanza max_iterations.
    """
    # 1. Planificación inicial
    plan = planner.create_plan(goal)
    PlanValidator.validate(plan)

    state = ExecutionState(
        run_id=f"run_{str(uuid.uuid4())[:8]}",
        session_id=session_id,
        subject_id=subject_id,
        messages=[{"role": "user", "content": goal}],
        max_iterations=max_iterations,
        current_plan=plan
    )

    print(f"\n[AGENT v4] Iniciando ejecución para meta: '{goal}'")
    print(f"[PLANNER] Plan inicial generado (Revisión {plan.revision}) con {len(plan.steps)} pasos.")

    while state.iteration < state.max_iterations:
        state.iteration += 1

        # Comprobar si el plan ya se completó de forma derivada
        if state.current_plan.is_completed:
            state.termination_reason = "plan_completed"
            print(f"[AGENT v4] Meta cumplida en iteración {state.iteration}. Plan completado.")
            break

        # Buscar pasos completados o autorizados como omitidos
        completed_step_ids = {
            s.id for s in state.current_plan.steps
            if s.status == StepStatus.COMPLETED or (s.status == StepStatus.SKIPPED and (not s.required or s.skip_reason))
        }

        # Filtrar pasos pendientes
        pending_steps = [s for s in state.current_plan.steps if s.status == StepStatus.PENDING]

        # Seleccionar pasos ejecutables (cuyas dependencias estén todas cumplidas)
        executable_steps = [
            s for s in pending_steps
            if all(dep in completed_step_ids for dep in s.depends_on)
        ]

        # DETECCIÓN DE RUNTIME STALL: Hay pasos pendientes pero ninguno puede ejecutarse
        if pending_steps and not executable_steps:
            state.termination_reason = "no_executable_steps"
            print("[RUNTIME STALL] Existen pasos pendientes pero ninguno tiene sus dependencias satisfechas.")
            print("[RUNTIME] Detención segura activada: termination_reason='no_executable_steps'.")
            break

        if not executable_steps:
            # No quedan pendientes y no hay ejecutables
            state.termination_reason = "plan_completed"
            break

        # Tomar el siguiente paso prioritario
        current_step = executable_steps[0]
        state.current_plan.current_step_id = current_step.id
        current_step.status = StepStatus.IN_PROGRESS

        print(f"\n-> Iteración {state.iteration} | Ejecutando Paso [{current_step.id}] ({current_step.executor.value}): {current_step.description}")

        # Ejecución polimórfica según executor
        if current_step.executor == StepExecutor.TOOL:
            obs = execute_tool(current_step.action)
            state.tool_calls_executed.append(current_step.action)
        elif current_step.executor == StepExecutor.RUNTIME:
            obs = execute_runtime_action(current_step.action, state)
        elif current_step.executor == StepExecutor.MODEL:
            obs = execute_model_action(current_step.action, state)
        else:
            obs = {"status": "error", "error": "Executor no soportado"}

        current_step.observation = obs
        state.last_observation = obs

        # Verificación del resultado del paso
        if obs.get("status") == "success":
            current_step.status = StepStatus.COMPLETED
            print(f"   [OK] Paso [{current_step.id}] completado exitosamente.")
        else:
            current_step.status = StepStatus.FAILED
            print(f"   [FAIL] Paso [{current_step.id}] falló: {obs.get('error')}")

            # REPLANNING: Archivar snapshot independiente de la revisión actual
            snapshot = state.current_plan.clone()
            state.plan_history.append(snapshot)
            print(f"   [HISTORY] Revisión {snapshot.revision} archivada en plan_history. Longitud histórica: {len(state.plan_history)}.")

            # Invocar replanner
            print("   [REPLANNER] Evaluando contingencia adaptativa...")
            new_plan = planner.replan(state.current_plan, current_step, obs)

            if new_plan is not None:
                # Invariante estricta de meta
                assert new_plan.goal == state.current_plan.goal, "Violación: replanning modificó el objetivo original."
                PlanValidator.validate(new_plan)
                state.current_plan = new_plan
                print(f"   [PLANNER] Nueva Revisión {new_plan.revision} activada con {len(new_plan.steps)} pasos.")
            else:
                print(f"   [REPLANNER] No existe alternativa disponible para el paso [{current_step.id}]. El paso permanece FAILED.")

    if state.iteration >= state.max_iterations and not state.termination_reason:
        state.termination_reason = "max_iterations_exceeded"

    return state
```

---

## 7. Batería de Pruebas: Casos G1, G2 y G3

Inserta este bloque al final de tu archivo para validar el comportamiento en la terminal:

```python
if __name__ == "__main__":
    planner = MockPlanner()

    # =======================================================================
    # PRUEBA PREVIA 1: VALIDATION-TIME FAILURE (Ciclo estático antes de ejecución)
    # =======================================================================
    print("\n" + "=" * 75)
    print("DEMOSTRACIÓN VALIDATION-TIME: PLANVALIDATOR RECHAZA GRAFO CON CICLO")
    print("=" * 75)

    invalid_cycle_plan = Plan(
        goal="Plan con ciclo estático inicial",
        steps=[
            PlanStep(id="C1", action="step_one", description="Paso A", executor=StepExecutor.RUNTIME, depends_on=["C2"]),
            PlanStep(id="C2", action="step_two", description="Paso B", executor=StepExecutor.RUNTIME, depends_on=["C1"])
        ]
    )
    try:
        PlanValidator.validate(invalid_cycle_plan)
        assert False, "PlanValidator debió levantar PlanValidationError ante ciclo estático"
    except PlanValidationError as e:
        print(f"✅ VALIDATION-TIME SUPERADO: El plan fue rechazado y no entró al runtime ({e})")

    # =======================================================================
    # PRUEBA PREVIA 2: SEMÁNTICA ESTRICTA DE SKIPPED (Sin dos fuentes de verdad)
    # =======================================================================
    print("\n" + "=" * 75)
    print("DEMOSTRACIÓN SEMÁNTICA SKIPPED: VALIDACIÓN DE PASOS OMITIDOS")
    print("=" * 75)

    unjustified_skip_plan = Plan(
        goal="Auditoría con omisión injustificada",
        steps=[
            PlanStep(id="S1", action="act1", description="Paso 1", status=StepStatus.COMPLETED),
            PlanStep(id="S2", action="act2", description="Paso 2", status=StepStatus.SKIPPED, required=True, skip_reason=None)
        ]
    )
    assert unjustified_skip_plan.is_completed is False, "Un paso required omitido sin skip_reason NO debe completar el plan"

    justified_skip_plan = Plan(
        goal="Auditoría con omisión autorizada",
        steps=[
            PlanStep(id="S1", action="act1", description="Paso 1", status=StepStatus.COMPLETED),
            PlanStep(id="S2", action="act2", description="Paso 2", status=StepStatus.SKIPPED, required=True, skip_reason="Sustituido en Revisión 2")
        ]
    )
    assert justified_skip_plan.is_completed is True, "Un paso con skip_reason formal sí satisface la completitud derivada"
    print("✅ SEMÁNTICA SKIPPED SUPERADA: step.required y skip_reason blindan la completitud derivada.")

    # =======================================================================
    # CASO G1: PLANIFICACIÓN ESTRUCTURADA EXITOSA (Meta de 4 pasos)
    # =======================================================================
    print("\n" + "=" * 75)
    print("DEMOSTRACIÓN CASO G1: PLANIFICACIÓN ESTRUCTURADA (4 PASOS DEPENDIENTES)")
    print("=" * 75)

    SIMULATE_DEPLOYMENT_SERVICE_DOWN = False
    state_g1 = run_agent_v4(
        goal="Auditar incidentes recientes y correlacionar con último despliegue",
        planner=planner
    )

    print("\n--- ASERCIONES DE VERIFICACIÓN CASO G1 ---")
    assert state_g1.termination_reason == "plan_completed", f"Esperado 'plan_completed', obtenido: {state_g1.termination_reason}"
    assert state_g1.current_plan.is_completed is True, "El plan debió marcarse como completado"
    assert state_g1.current_plan.revision == 1, "En ejecución sin fallos la revisión debe ser 1"
    assert len(state_g1.plan_history) == 0, "No debió haber historial de replanes en G1"
    assert all(s.status == StepStatus.COMPLETED for s in state_g1.current_plan.steps), "Todos los pasos debieron completarse"
    assert "S1" in [s.id for s in state_g1.current_plan.steps]
    assert "S4" in [s.id for s in state_g1.current_plan.steps]
    print("✅ CASO G1 SUPERADO: Plan generado, ejecutado ordenadamente por dependencias y completado.")

    # =======================================================================
    # CASO G2: REPLANNING CON CONSERVACIÓN DE HISTORIA E INVARIANTE DE META
    # =======================================================================
    print("\n" + "=" * 75)
    print("DEMOSTRACIÓN CASO G2: CONTINGENCIA, SNAPSHOT ARCHIVING Y REPLANNING")
    print("=" * 75)

    # Forzamos caída del servicio en S2
    SIMULATE_DEPLOYMENT_SERVICE_DOWN = True

    state_g2 = run_agent_v4(
        goal="Auditar incidentes recientes y correlacionar con último despliegue",
        planner=planner
    )

    print("\n--- ASERCIONES DE VERIFICACIÓN CASO G2 ---")
    # 1. Terminación exitosa final
    assert state_g2.termination_reason == "plan_completed", "El agente debió recuperarse y completar la meta"

    # 2. Conservación del historial (Revisión 1)
    assert len(state_g2.plan_history) == 1, "Debe existir exactamente 1 snapshot archivado en plan_history"
    rev1 = state_g2.plan_history[0]
    assert rev1.revision == 1, "El snapshot archivado debe ser la Revisión 1"

    step_s1_r1 = next(s for s in rev1.steps if s.id == "S1")
    step_s2_r1 = next(s for s in rev1.steps if s.id == "S2")
    assert step_s1_r1.status == StepStatus.COMPLETED, "En Revisión 1 S1 debe figurar completado"
    assert step_s2_r1.status == StepStatus.FAILED, "En Revisión 1 S2 debe figurar fallido"

    # 3. Revisión 2 activa
    rev2 = state_g2.current_plan
    assert rev2.revision == 2, "El plan activo debe ser la Revisión 2"
    assert "S2b" in [s.id for s in rev2.steps], "Revisión 2 debe incluir el paso alternativo S2b"

    step_s1_r2 = next(s for s in rev2.steps if s.id == "S1")
    step_s2b_r2 = next(s for s in rev2.steps if s.id == "S2b")
    assert step_s1_r2.status == StepStatus.COMPLETED, "S1 no debe haberse re-ejecutado ni alterado"
    assert step_s2b_r2.status == StepStatus.COMPLETED, "S2b debió ejecutarse y completarse exitosamente"

    # 4. Invariante estricta de meta
    assert rev1.goal == rev2.goal, "INVARIANTE VIOLADA: El replanning alteró la meta original"
    print("✅ CASO G2 SUPERADO: Revisión 1 archivada inmutable, Revisión 2 adaptativa ejecutada y meta cumplida.")

    # =======================================================================
    # CASO G3: RUNTIME STALL / no_executable_steps (Paso fallido bloquea dependencias)
    # =======================================================================
    print("\n" + "=" * 75)
    print("DEMOSTRACIÓN CASO G3: RUNTIME STALL (DEPENDENCIAS BLOQUEADAS SIN ALTERNATIVA)")
    print("=" * 75)

    class StallMockPlanner(MockPlanner):
        """Planner que produce un plan estructuralmente válido (DAG S1 -> S2 -> S3),
        pero donde S2 falla de forma irrecuperable y el replanner no tiene ruta alternativa."""
        def create_plan(self, goal: str, context_memories: str = "") -> Plan:
            return Plan(
                goal=goal,
                steps=[
                    PlanStep(id="S1", action="get_recent_incidents", description="Paso 1", executor=StepExecutor.TOOL),
                    PlanStep(id="S2", action="unrecoverable_legacy_call", description="Paso 2 irrecuperable", executor=StepExecutor.TOOL, depends_on=["S1"]),
                    PlanStep(id="S3", action="generate_incident_recommendation", description="Paso 3 dependiente", executor=StepExecutor.MODEL, depends_on=["S2"])
                ],
                revision=1
            )

        def replan(self, current_plan: Plan, failed_step: PlanStep, observation: Dict[str, Any]) -> Optional[Plan]:
            # No hay ruta alternativa ni herramienta de respaldo para unrecoverable_legacy_call
            return None

    stall_planner = StallMockPlanner()
    state_g3 = run_agent_v4(
        goal="Auditoría con herramienta heredada no recuperable",
        planner=stall_planner
    )

    print("\n--- ASERCIONES DE VERIFICACIÓN CASO G3 ---")
    assert state_g3.termination_reason == "no_executable_steps", \
        f"Esperado 'no_executable_steps', obtenido: {state_g3.termination_reason}"
    assert state_g3.current_plan.is_completed is False, "El plan no debe figurar completado"
    assert any(s.status == StepStatus.PENDING for s in state_g3.current_plan.steps), "Debe haber pasos pendientes bloqueados"
    s3 = next(s for s in state_g3.current_plan.steps if s.id == "S3")
    assert s3.status == StepStatus.PENDING, "S3 debió quedar PENDING porque S2 falló y no hubo alternativa"
    print("✅ CASO G3 SUPERADO: Runtime Stall detectado limpiamente con termination_reason='no_executable_steps'.")

    print("\n" + "=" * 75)
    print("¡TODAS LAS PRUEBAS DE PLANNING (VALIDATION-TIME, SKIPPED, G1, G2, G3) SUPERADAS CON ÉXITO!")
    print("=" * 75)
```

---

## 8. Preguntas de Reflexión Técnica para el Grupo

1. **Sobre Chain-of-Thought vs Planning:** ¿Por qué un modelo que emite un monólogo interno en texto diciendo *"Primero llamaré a X, luego a Y"* es vulnerable a desvíos incontrolables, mientras que un `Plan` con `StepStatus` permite al software detener, supervisar y reanudar la ejecución?
2. **Sobre la conservación de historia:** Si ante un fallo en el Paso 4 el runtime destruyera el plan y le pidiera al modelo un plan completamente nuevo desde cero, ¿qué riesgos existirían de re-ejecutar pasos ya completados con efectos secundarios irreversibles (ej. cobros, envíos, correos)?
3. **El puente hacia L06 (Guardrails & Human-in-the-Loop):** Nuestro `PlanStep` ahora distingue entre `TOOL`, `RUNTIME` y `MODEL`. Si un plan propone ejecutar `cancel_subscription` o `delete_database_cluster` en un paso `TOOL`, ¿debería el runtime ejecutarlo automáticamente solo porque forma parte del plan? ¿Qué compuerta de autorización se requiere antes del disparo?
