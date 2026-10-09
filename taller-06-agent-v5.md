# M05 · Taller Práctico — Evoluciona Agent v4 a Agent v5: Guardrails & Human-in-the-Loop

## Guía de implementación para grupos de estudio · CASE Academy

- **Duración recomendada:** 60–75 minutos
- **Modalidad:** Trabajo colaborativo en grupos de estudio
- **Punto de partida obligatorio:** El proyecto funcional de **Agent v4** construido en L05
- **Entregable técnico:** Código Python ejecutable de **Agent v5** con `PolicyDecision`, `RiskLevel`, `ToolPolicy`, `PolicyEvaluator`, `ActionProposal` con binding SHA-256 sobre serialización JSON determinista, `ApprovalDecision`, `ApprovalRecord` de un solo uso con sellado `consumed` y `consumed_at`, registro `consumed_proposal_ids`, máquina de estados con `ExecutionStatus` (`PAUSED_FOR_APPROVAL` y reanudación formal), revalidación de precondiciones antes de ejecución, `BudgetController` con disyuntores (*Circuit Breakers*) y validación de los **Casos H1 a H6**.

---

## 1. Principio Rector del Taller

> **"No crees un agente nuevo. Toma el proyecto de Agent v4 que construiste en L05 y dótalo de la Engineering & Control Layer: Guardrails y Human-in-the-Loop."**

En el Taller 05 construiste **Agent v4**: un agente dotado de descomposición de metas en un grafo dirigido acíclico (`PlanStep`), ejecutores tipados (`TOOL`, `RUNTIME`, `MODEL`), replanning adaptativo y conservación de revisiones históricas inmutables.

Sin embargo, Agent v4 presenta un riesgo crítico de seguridad y gobernanza:
- **Capacidad sin autoridad:** Si el planificador deduce que el siguiente paso óptimo es transferir $250,000 COP o eliminar un recurso de infraestructura, Agent v4 lo ejecuta automáticamente solo porque está registrado en el catálogo.
- **La trampa del prompt:** Intentar resolver la seguridad diciéndole al modelo *"por favor no hagas operaciones peligrosas"* es un anti-patrón frágil vulnerable a jailbreaks, alucinaciones y desvíos probabilísticos.
- **Falta de compuerta humana formal:** Si una operación requiere intervención humana, no puede depender de un improvisado `input("Y/N")` en la consola que rompa la máquina de estados.

En este taller dotaremos al agente de una envolvente de ingeniería determinista en software donde:
1. **`Capacidad ≠ Autoridad`:** Que una herramienta exista no significa que pueda ejecutarse.
2. **`Action Binding`:** El humano aprueba una acción concreta con parámetros exactos (`action_fingerprint`), no una intención abstracta.
3. **Revalidación de Precondiciones:** El fingerprint protege la integridad de la acción propuesta, pero no el estado del mundo exterior.
4. **Consumo Único Anti-Replay:** Una aprobación no puede ser reutilizada para ejecutar una segunda acción.
5. **Presupuestos y Disyuntores:** El runtime detiene bucles anómalos antes de agotar recursos.

---

## 2. Mapa de Evolución: De Agent v4 a Agent v5

```text
┌────────────────────────────────────────────────────────┐
│                      AGENT V4                          │
│                                                        │
│  ModelProvider / MockModelProviderV4  ✅ SE CONSERVA   │
│  TOOL_REGISTRY & execute_tool_call()  ✅ SE CONSERVA   │
│  Agent Loop (while iterativo)         ✅ SE CONSERVA   │
│  Plan, PlanStep, StepStatus, Executor ✅ SE CONSERVA   │
│  PlanValidator & Replanning           ✅ SE CONSERVA   │
│  MemoryStore & Scope                  ✅ SE CONSERVA   │
│  Casos A–C (L02), D–E (L03), F (L04)  ✅ SE CONSERVA   │
│  Casos G1, G2, G3 (L05)               ✅ SE CONSERVA   │
│                                                        │
│  ExecutionState                       🔄 EVOLUCIONA    │
│  run_agent_v4()                       🔄 EVOLUCIONA    │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                      AGENT V5                          │
│                                                        │
│  PolicyDecision (ALLOW / REQUIRE / BLOCK) 🆕 NUEVO     │
│  RiskLevel (LOW / MEDIUM / CRITICAL)   🆕 NUEVO        │
│  ToolPolicy (decisión única determinista)🆕 NUEVO      │
│  PolicyEvaluator (allowlist + constraints)🆕 NUEVO     │
│  ActionProposal (binding SHA-256)      🆕 NUEVO        │
│  ApprovalDecision & ApprovalRecord     🆕 NUEVO        │
│  One-time approval (consumed + anti-replay)🆕 NUEVO    │
│  ExecutionStatus (PAUSED_FOR_APPROVAL) 🆕 NUEVO        │
│  Pause / Resume con contexto intacto   🆕 NUEVO        │
│  Revalidación de política/precondición 🆕 NUEVO        │
│  BudgetController (Circuit Breakers)   🆕 NUEVO        │
│  Casos H1, H2, H3, H4, H5a, H5b, H6    🆕 NUEVO        │
│  run_agent_v5()                        🆕 NUEVO        │
└────────────────────────────────────────────────────────┘
```

---

## 3. Las Cuatro Reglas Arquitectónicas Fundamentales de L06

1. **Capacidad ≠ Autoridad (Guardrails en Software, No en Prompt):**
   - El catálogo de herramientas (`TOOL_REGISTRY`) responde únicamente si la función existe.
   - La `ToolPolicy` evaluada por `PolicyEvaluator` en Python decide si la acción se permite (`ALLOW`), requiere aprobación humana (`REQUIRE_APPROVAL`) o se proscribe tajantemente (`BLOCK`).
   - El modelo no puede auto-aprobarse ni anular las políticas de software.
2. **Action Binding vs TOCTOU Completo:**
   - El `action_fingerprint` (digest SHA-256 sobre serialización JSON determinista de `tool` y `arguments`) garantiza que la acción ejecutada sea exactamente la aprobada por el revisor humano. Si los parámetros mutan post-aprobación, la huella no coincide y la acción queda bloqueada.
   - Sin embargo, **el fingerprint no protege contra cambios en el mundo exterior** (ej. la cuenta bancaria pudo haber sido congelada mientras se esperaba la firma). El runtime siempre revalida la política y las precondiciones vigentes antes del despacho.
3. **Aprobación de Un Solo Uso y Protección Anti-Replay:**
   - Un `ApprovalRecord` pertenece exclusivamente a una propuesta y a su huella.
   - Tras ejecutarse, se marca como consumida (`consumed = True`, `consumed_at = ...`) y se añade a `consumed_proposal_ids`. Cualquier intento de reutilizarla es rechazado como `approval_replay_detected`.
4. **Semántica Diferenciada: `BLOCK` vs `REJECT`:**
   - `BLOCK`: Política determinista prohíbe la acción *antes* de la compuerta humana; no hay `ActionProposal` y el humano no puede anularla en la política base.
   - `REJECT`: El humano evalúa una propuesta admisible y decide denegarla; inyecta una observación de rechazo permitiendo al agente replanificar una alternativa segura o finalizar de forma ordenada.

---

## 4. Checklist de Migración

### No cambies esto
- Tu catálogo de herramientas simuladas (`TOOL_REGISTRY`).
- Tu `MemoryStore` y política de aislamiento por `subject_id` (L04).
- Tus estructuras de planning `Plan`, `PlanStep`, `StepStatus`, `StepExecutor` (L05).
- Casos de prueba acumulados: **A, B, C, D, E, F1, F2, G1, G2 y G3**.

### Agrega en L06
1. **`PolicyDecision`:** Enum con `ALLOW`, `REQUIRE_APPROVAL`, `BLOCK`.
2. **`RiskLevel`:** Enum con `LOW`, `MEDIUM`, `CRITICAL`.
3. **`ToolPolicy`:** Modelo sin ambigüedad con `tool_name`, `decision`, `risk_level` y `argument_constraints`.
4. **`PolicyEvaluator`:** Evaluador determinista de software.
5. **`ActionProposal`:** Artefacto con `proposal_id`, `tool_name`, `arguments`, `risk_level` y `action_fingerprint` (SHA-256 sobre serialización determinista).
6. **`ApprovalRecord`:** Modelo inmutable con `consumed: bool = False`, `consumed_at` y protección anti-replay.
7. **`ExecutionStatus`:** Enum con `RUNNING`, `PAUSED_FOR_APPROVAL`, `COMPLETED`, `FAILED`, `BLOCKED`.
8. **`ExecutionState`:** Enriquecido con `status`, `pending_approval`, `approval_history` y `consumed_proposal_ids`.
9. **`BudgetController`:** Controlador de presupuestos con disyuntores operativos (*Circuit Breakers*).
10. **Casos H1, H2, H3, H4, H5a, H5b y H6.**

---

## 5. Hitos de Trabajo y Tiempos Estimados

| Hito | Actividad | Tiempo |
|---|---|---|
| **Hito 1** | Modelado de políticas: `PolicyDecision`, `RiskLevel`, `ToolPolicy` y `PolicyEvaluator` | 15 min |
| **Hito 2** | Action Binding SHA-256, `ActionProposal` y `ApprovalRecord` con control anti-replay | 15 min |
| **Hito 3** | Máquina de estados: `ExecutionStatus`, suspensión (`PAUSED_FOR_APPROVAL`) y reanudación | 15 min |
| **Hito 4** | Implementación del `BudgetController` y disyuntores de ejecución | 10 min |
| **Hito 5** | Verificación integral en terminal de los Casos H1, H2, H3, H4, H5a, H5b y H6 | 20 min |

---

## 6. Código Completo de Referencia en Python (Agent v5)

Guarda este código en tu entorno de trabajo como `agent_v5.py`:

```python
import copy
import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set, Tuple


# ===========================================================================
# 1. CORE AGENT: PASOS, EJECUTORES Y PLANIFICACIÓN (L01–L05)
# ===========================================================================

class StepStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class StepExecutor(Enum):
    TOOL = "tool"
    RUNTIME = "runtime"
    MODEL = "model"


@dataclass
class PlanStep:
    id: str
    action: str
    description: str
    executor: StepExecutor
    status: StepStatus = StepStatus.PENDING
    depends_on: List[str] = field(default_factory=list)
    observation: Optional[str] = None
    required: bool = True
    skip_reason: Optional[str] = None


@dataclass
class Plan:
    goal: str
    steps: List[PlanStep] = field(default_factory=list)
    revision: int = 1

    @property
    def is_completed(self) -> bool:
        if not self.steps:
            return False
        for s in self.steps:
            if s.status == StepStatus.COMPLETED:
                continue
            if s.status == StepStatus.SKIPPED and (not s.required or s.skip_reason):
                continue
            return False
        return True

    def clone(self) -> "Plan":
        return copy.deepcopy(self)


# ===========================================================================
# 2. ENGINEERING & CONTROL LAYER: POLÍTICAS, RIESGO Y DECISIÓN (L06)
# ===========================================================================

class PolicyDecision(Enum):
    ALLOW = "allow"
    REQUIRE_APPROVAL = "require_approval"
    BLOCK = "block"


class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    CRITICAL = "critical"


@dataclass
class ToolPolicy:
    tool_name: str
    decision: PolicyDecision
    risk_level: RiskLevel
    argument_constraints: Dict[str, Any] = field(default_factory=dict)


def compute_action_fingerprint(tool_name: str, arguments: Dict[str, Any]) -> str:
    """Calcula el digest SHA-256 sobre serialización JSON determinista para Action Binding."""
    deterministic_payload = json.dumps(
        {"args": arguments, "tool": tool_name},
        sort_keys=True,
        separators=(",", ":")
    )
    return hashlib.sha256(deterministic_payload.encode("utf-8")).hexdigest()


@dataclass
class ActionProposal:
    proposal_id: str
    run_id: str
    step_id: str
    tool_name: str
    arguments: Dict[str, Any]
    risk_level: RiskLevel
    reason: str
    created_at: str
    action_fingerprint: str  # Digest SHA-256 completo (64 hex chars)


class ApprovalDecision(Enum):
    APPROVE = "approve"
    REJECT = "reject"


@dataclass
class ApprovalRecord:
    proposal_id: str
    action_fingerprint: str
    decision: ApprovalDecision
    reviewer_id: str
    justification: Optional[str]
    decided_at: str
    consumed: bool = False
    consumed_at: Optional[str] = None


class ExecutionStatus(Enum):
    RUNNING = "running"
    PAUSED_FOR_APPROVAL = "paused_for_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"


@dataclass
class ExecutionState:
    run_id: str
    session_id: str
    subject_id: str
    messages: List[Dict[str, Any]]
    iteration: int = 0
    max_iterations: int = 10
    tool_calls_executed: int = 0
    started_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ"))
    last_observation: Optional[str] = None
    termination_reason: Optional[str] = None
    current_plan: Optional[Plan] = None
    plan_history: List[Plan] = field(default_factory=list)

    # Novedades L06 (Agent v5):
    status: ExecutionStatus = ExecutionStatus.RUNNING
    pending_approval: Optional[ActionProposal] = None
    approval_history: List[ApprovalRecord] = field(default_factory=list)
    consumed_proposal_ids: Set[str] = field(default_factory=set)


# ===========================================================================
# 3. EVALUADOR DE POLÍTICA Y CATÁLOGO DE POLÍTICAS DE SOFTWARE
# ===========================================================================

class PolicyEvaluator:
    def __init__(self, policies: Dict[str, ToolPolicy]):
        self.policies = policies

    def evaluate(self, tool_name: str, arguments: Dict[str, Any], context: Dict[str, Any] = None) -> Tuple[PolicyDecision, str]:
        # 1. Frontera de Allowlist: Si no está registrada en políticas, es BLOCK determinista
        if tool_name not in self.policies:
            return PolicyDecision.BLOCK, f"Herramienta '{tool_name}' no admitida en la Allowlist de políticas."

        policy = self.policies[tool_name]

        # 2. Si la decisión configurada es BLOCK
        if policy.decision == PolicyDecision.BLOCK:
            return PolicyDecision.BLOCK, f"Herramienta '{tool_name}' proscrita tajantemente por política de seguridad."

        # 3. Validación de restricciones de argumentos (Policy Validation vs Schema Validation)
        if "max_amount" in policy.argument_constraints:
            amount = arguments.get("amount", 0)
            if amount > policy.argument_constraints["max_amount"]:
                return PolicyDecision.BLOCK, f"Monto ${amount} excede el límite máximo permitido de ${policy.argument_constraints['max_amount']}."

        # 4. Comprobación de precondiciones externas
        if context and context.get("account_frozen", False):
            return PolicyDecision.BLOCK, "La cuenta origen se encuentra congelada preventivamente."

        # 5. Decisión final
        if policy.decision == PolicyDecision.REQUIRE_APPROVAL:
            return PolicyDecision.REQUIRE_APPROVAL, f"Operación crítica ({policy.risk_level.value}) requiere compuerta de aprobación humana."

        return PolicyDecision.ALLOW, "Operación autorizada por política."


# Catálogo canónico de políticas para el taller
SYSTEM_POLICIES = {
    "read_account_balance": ToolPolicy(
        tool_name="read_account_balance",
        decision=PolicyDecision.ALLOW,
        risk_level=RiskLevel.LOW
    ),
    "get_recent_incidents": ToolPolicy(
        tool_name="get_recent_incidents",
        decision=PolicyDecision.ALLOW,
        risk_level=RiskLevel.LOW
    ),
    "update_ticket_priority": ToolPolicy(
        tool_name="update_ticket_priority",
        decision=PolicyDecision.ALLOW,
        risk_level=RiskLevel.MEDIUM
    ),
    "transfer_funds": ToolPolicy(
        tool_name="transfer_funds",
        decision=PolicyDecision.REQUIRE_APPROVAL,
        risk_level=RiskLevel.CRITICAL,
        argument_constraints={"max_amount": 500000}
    ),
    "delete_production_database": ToolPolicy(
        tool_name="delete_production_database",
        decision=PolicyDecision.BLOCK,
        risk_level=RiskLevel.CRITICAL
    )
}


# ===========================================================================
# 4. CONTROL OPERACIONAL: BUDGET CONTROLLER & CIRCUIT BREAKERS
# ===========================================================================

@dataclass
class BudgetController:
    max_iterations: int = 10
    max_tool_calls: int = 5
    max_failures: int = 3

    def check(self, state: ExecutionState, consecutive_failures: int = 0) -> Tuple[bool, Optional[str]]:
        if state.iteration >= self.max_iterations:
            return False, "max_iterations_exceeded"
        if state.tool_calls_executed >= self.max_tool_calls:
            return False, "budget_exceeded"
        if consecutive_failures >= self.max_failures:
            return False, "too_many_failures"
        return True, None


# ===========================================================================
# 5. MOCK HERRAMIENTAS Y SIMULADOR DETERMINISTA
# ===========================================================================

def mock_tool_dispatcher(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    if tool_name == "read_account_balance":
        return {"account_id": args.get("account_id"), "balance": 1500000.0, "currency": "COP", "status": "ACTIVE"}
    if tool_name == "transfer_funds":
        return {"transaction_id": f"TX-{uuid.uuid4().hex[:8].upper()}", "status": "SETTLED", "amount": args.get("amount")}
    if tool_name == "generate_payment_instructions":
        return {"instructions": "Instrucciones de pago por PSE emitidas.", "status": "DELIVERED"}
    raise ValueError(f"Herramienta desconocida: {tool_name}")


# ===========================================================================
# 6. RUNTIME ORQUESTADOR: AGENT V5 (PIPELINE CON GUARDRAILS Y HITL)
# ===========================================================================

def run_step_with_guardrails(
    step: PlanStep,
    state: ExecutionState,
    evaluator: PolicyEvaluator,
    budget: BudgetController,
    tool_args: Dict[str, Any],
    approval_provider: Optional[Callable[[ActionProposal], ApprovalRecord]] = None,
    candidate_mutation: Optional[Dict[str, Any]] = None,
    replay_record: Optional[ApprovalRecord] = None,
    external_context: Optional[Dict[str, Any]] = None
) -> ExecutionState:
    """
    Despacha un paso de tipo TOOL gobernado por la Engineering & Control Layer.
    Aplica: Budget -> PolicyEvaluator -> ActionProposal -> HITL -> Anti-Replay -> Fingerprint -> Preconditions -> Execute -> Consume.
    """
    state.iteration += 1

    # 1. Budget Controller Check
    can_proceed, budget_reason = budget.check(state)
    if not can_proceed:
        state.termination_reason = budget_reason
        state.status = ExecutionStatus.BLOCKED
        return state

    # 2. Evaluación determinista de política previa
    decision, reason = evaluator.evaluate(step.action, tool_args, external_context)

    if decision == PolicyDecision.BLOCK:
        # BLOCK: No hay compuerta, no hay propuesta, no hay anulación humana
        step.status = StepStatus.FAILED
        step.observation = f"POLICY_BLOCK: {reason}"
        state.status = ExecutionStatus.BLOCKED
        state.termination_reason = "policy_blocked"
        return state

    if decision == PolicyDecision.ALLOW:
        # ALLOW: Ejecución directa sin suspensión
        state.tool_calls_executed += 1
        res = mock_tool_dispatcher(step.action, tool_args)
        step.status = StepStatus.COMPLETED
        step.observation = json.dumps(res)
        state.last_observation = step.observation
        state.status = ExecutionStatus.RUNNING
        return state

    # 3. REQUIRE_APPROVAL: Generación formal de ActionProposal y Pausa
    fingerprint = compute_action_fingerprint(step.action, tool_args)
    proposal = ActionProposal(
        proposal_id=f"PROP-{uuid.uuid4().hex[:6].upper()}",
        run_id=state.run_id,
        step_id=step.id,
        tool_name=step.action,
        arguments=copy.deepcopy(tool_args),
        risk_level=RiskLevel.CRITICAL,
        reason=reason,
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        action_fingerprint=fingerprint
    )
    state.pending_approval = proposal
    state.status = ExecutionStatus.PAUSED_FOR_APPROVAL

    # Si no hay proveedor de aprobación (ej. corrida asíncrona real esperando operador), el runtime retorna pausado
    if not approval_provider and not replay_record:
        return state

    # Obtener el registro de aprobación (humano o replay simulado)
    approval = replay_record if replay_record else approval_provider(proposal)

    # 4. Si el humano emite REJECT
    if approval.decision == ApprovalDecision.REJECT:
        state.approval_history.append(approval)
        state.pending_approval = None
        step.status = StepStatus.FAILED
        step.observation = f"REJECTED_BY_HUMAN: {approval.justification or 'No justificado'}"
        state.last_observation = step.observation
        state.status = ExecutionStatus.RUNNING
        return state

    # 5. Si el humano emite APPROVE:
    # 5a. Control Anti-Replay: Comprobar que la aprobación no haya sido consumida
    if approval.consumed or approval.proposal_id in state.consumed_proposal_ids:
        step.status = StepStatus.FAILED
        step.observation = "SECURITY_VIOLATION: approval_replay_detected. Aprobación ya consumida."
        state.status = ExecutionStatus.BLOCKED
        state.termination_reason = "approval_replay_detected"
        return state

    # 5b. Acción a ejecutar: Evaluar si hubo mutación de parámetros (Ataque TOCTOU en argumentos)
    action_args_to_run = candidate_mutation if candidate_mutation is not None else tool_args
    actual_fingerprint = compute_action_fingerprint(step.action, action_args_to_run)

    # 5c. Verificación estricta de Action Binding
    if actual_fingerprint != proposal.action_fingerprint:
        step.status = StepStatus.FAILED
        step.observation = "SECURITY_VIOLATION: fingerprint_mismatch. Los argumentos a despachar difieren de la propuesta aprobada."
        state.status = ExecutionStatus.BLOCKED
        state.termination_reason = "fingerprint_mismatch"
        return state

    # 5d. Revalidación de política y precondiciones vigentes en tiempo real
    reval_decision, reval_reason = evaluator.evaluate(step.action, action_args_to_run, external_context)
    if reval_decision != PolicyDecision.REQUIRE_APPROVAL and reval_decision != PolicyDecision.ALLOW:
        step.status = StepStatus.FAILED
        step.observation = f"PRECONDITION_FAILED: {reval_reason}"
        state.status = ExecutionStatus.BLOCKED
        state.termination_reason = "precondition_failed"
        return state

    # 5e. Despacho seguro de la herramienta (1-Shot)
    state.tool_calls_executed += 1
    res = mock_tool_dispatcher(step.action, action_args_to_run)
    step.status = StepStatus.COMPLETED
    step.observation = json.dumps(res)
    state.last_observation = step.observation

    # 5f. Sellar la aprobación como consumida (Invariante de un solo uso)
    approval.consumed = True
    approval.consumed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    state.consumed_proposal_ids.add(proposal.proposal_id)
    state.approval_history.append(approval)
    state.pending_approval = None
    state.status = ExecutionStatus.RUNNING

    return state
```

---

## 7. Batería de Pruebas Obligatorias: Casos H1 a H6

Inserta este bloque de pruebas en tu script y ejecútalo con `python agent_v5.py`:

```python
if __name__ == "__main__":
    evaluator = PolicyEvaluator(SYSTEM_POLICIES)

    print("\n" + "=" * 75)
    print("M05 L06: BATERÍA DE PRUEBAS DE GUARDRAILS & HUMAN-IN-THE-LOOP (CASOS H1–H6)")
    print("=" * 75)

    # =======================================================================
    # CASO H1: ALLOW (Acción de bajo riesgo ejecutada directamente)
    # =======================================================================
    print("\n--- EJECUTANDO CASO H1: ALLOW (read_account_balance) ---")
    state_h1 = ExecutionState(
        run_id="run-h1-001", session_id="ses-1", subject_id="usr-101", messages=[]
    )
    step_h1 = PlanStep(id="S1", action="read_account_balance", description="Consultar saldo", executor=StepExecutor.TOOL)
    budget_h1 = BudgetController()

    state_h1 = run_step_with_guardrails(
        step=step_h1,
        state=state_h1,
        evaluator=evaluator,
        budget=budget_h1,
        tool_args={"account_id": "ACC-8831"}
    )

    assert step_h1.status == StepStatus.COMPLETED, "S1 debió completarse"
    assert state_h1.status == ExecutionStatus.RUNNING, "El runtime debió continuar en RUNNING"
    assert state_h1.pending_approval is None, "No debió crearse pending_approval"
    assert state_h1.tool_calls_executed == 1, "Debió ejecutarse 1 tool call"
    print("✅ CASO H1 SUPERADO: Acción ALLOW ejecutada directamente sin pausa ni compuerta.")

    # =======================================================================
    # CASO H2: REQUIRE_APPROVAL / APPROVE (Acción crítica autorizada)
    # =======================================================================
    print("\n--- EJECUTANDO CASO H2: REQUIRE_APPROVAL / APPROVE (transfer_funds) ---")
    state_h2 = ExecutionState(
        run_id="run-h2-002", session_id="ses-1", subject_id="usr-101", messages=[]
    )
    step_h2 = PlanStep(id="S3", action="transfer_funds", description="Transferir fondos", executor=StepExecutor.TOOL)
    budget_h2 = BudgetController()

    # Simulador de supervisor humano que emite APPROVE
    def mock_human_approver(proposal: ActionProposal) -> ApprovalRecord:
        return ApprovalRecord(
            proposal_id=proposal.proposal_id,
            action_fingerprint=proposal.action_fingerprint,
            decision=ApprovalDecision.APPROVE,
            reviewer_id="security_lead_72",
            justification="Transferencia debidamente auditada.",
            decided_at=time.strftime("%Y-%m-%dT%H:%M:%SZ")
        )

    state_h2 = run_step_with_guardrails(
        step=step_h2,
        state=state_h2,
        evaluator=evaluator,
        budget=budget_h2,
        tool_args={"from_acc": "ACC-8831", "to_acc": "ACC-4492", "amount": 250000},
        approval_provider=mock_human_approver
    )

    assert step_h2.status == StepStatus.COMPLETED, "S3 debió completarse tras aprobación"
    assert state_h2.status == ExecutionStatus.RUNNING, "El runtime debió reanudar a RUNNING"
    assert state_h2.pending_approval is None, "pending_approval debió limpiarse"
    assert len(state_h2.approval_history) == 1, "Debe haber 1 registro en approval_history"
    record_h2 = state_h2.approval_history[0]
    assert record_h2.consumed is True, "La aprobación debe quedar sellada como consumed=True"
    assert record_h2.consumed_at is not None, "Debe haber timestamp de consumo"
    assert record_h2.proposal_id in state_h2.consumed_proposal_ids, "Debe estar en consumed_proposal_ids"
    assert state_h2.tool_calls_executed == 1, "La herramienta debió ejecutarse exactamente una vez"
    print("✅ CASO H2 SUPERADO: Propuesta creada, aprobada, fingerprint validado, ejecutada y consumida.")

    # =======================================================================
    # CASO H3: REQUIRE_APPROVAL / REJECT (Rechazo humano con observación)
    # =======================================================================
    print("\n--- EJECUTANDO CASO H3: REQUIRE_APPROVAL / REJECT ---")
    state_h3 = ExecutionState(
        run_id="run-h3-003", session_id="ses-1", subject_id="usr-101", messages=[]
    )
    step_h3 = PlanStep(id="S3", action="transfer_funds", description="Transferir fondos", executor=StepExecutor.TOOL)
    budget_h3 = BudgetController()

    def mock_human_rejecter(proposal: ActionProposal) -> ApprovalRecord:
        return ApprovalRecord(
            proposal_id=proposal.proposal_id,
            action_fingerprint=proposal.action_fingerprint,
            decision=ApprovalDecision.REJECT,
            reviewer_id="compliance_officer_11",
            justification="Límite excedido para el turno vespertino.",
            decided_at=time.strftime("%Y-%m-%dT%H:%M:%SZ")
        )

    state_h3 = run_step_with_guardrails(
        step=step_h3,
        state=state_h3,
        evaluator=evaluator,
        budget=budget_h3,
        tool_args={"from_acc": "ACC-8831", "to_acc": "ACC-4492", "amount": 350000},
        approval_provider=mock_human_rejecter
    )

    assert step_h3.status == StepStatus.FAILED, "El paso debe quedar FAILED"
    assert "REJECTED_BY_HUMAN" in step_h3.observation, "La observación debe registrar el rechazo"
    assert state_h3.tool_calls_executed == 0, "La herramienta NUNCA debió ejecutarse"
    assert state_h3.pending_approval is None, "pending_approval debió limpiarse"
    assert len(state_h3.approval_history) == 1, "Debe registrarse en el historial"
    assert state_h3.approval_history[0].consumed is False, "El rechazo no es una aprobación consumida"
    print("✅ CASO H3 SUPERADO: Acción denegada por humano, tool no ejecutada y observación inyectada.")

    # =======================================================================
    # CASO H4: BLOCK (Acción proscrita antes de compuerta)
    # =======================================================================
    print("\n--- EJECUTANDO CASO H4: BLOCK (delete_production_database) ---")
    state_h4 = ExecutionState(
        run_id="run-h4-004", session_id="ses-1", subject_id="usr-101", messages=[]
    )
    step_h4 = PlanStep(id="S9", action="delete_production_database", description="Borrar BD", executor=StepExecutor.TOOL)
    budget_h4 = BudgetController()

    human_called = False
    def trap_human(proposal: ActionProposal) -> Optional[ApprovalRecord]:
        global human_called
        human_called = True
        return None

    state_h4 = run_step_with_guardrails(
        step=step_h4,
        state=state_h4,
        evaluator=evaluator,
        budget=budget_h4,
        tool_args={"cluster": "prod-east-1"},
        approval_provider=trap_human
    )

    assert step_h4.status == StepStatus.FAILED, "Paso debió fallar"
    assert state_h4.status == ExecutionStatus.BLOCKED, "Estado debió quedar BLOCKED"
    assert state_h4.termination_reason == "policy_blocked", "Razón debió ser policy_blocked"
    assert human_called is False, "El humano NO debe ser consultado para acciones proscritas"
    assert state_h4.tool_calls_executed == 0, "No debe haber ejecución de herramientas"
    print("✅ CASO H4 SUPERADO: Proscripción determinista en software sin compuerta humana.")

    # =======================================================================
    # CASO H5a: ACTION MUTATION AFTER APPROVAL (Sabotaje TOCTOU)
    # =======================================================================
    print("\n--- EJECUTANDO CASO H5a: ACTION MUTATION AFTER APPROVAL ---")
    state_h5a = ExecutionState(
        run_id="run-h5a-005", session_id="ses-1", subject_id="usr-101", messages=[]
    )
    step_h5a = PlanStep(id="S3", action="transfer_funds", description="Transferir fondos", executor=StepExecutor.TOOL)
    budget_h5a = BudgetController()

    # Se propone amount = 250,000, pero antes de ejecutar se intenta inyectar amount = 900,000
    state_h5a = run_step_with_guardrails(
        step=step_h5a,
        state=state_h5a,
        evaluator=evaluator,
        budget=budget_h5a,
        tool_args={"from_acc": "ACC-8831", "to_acc": "ACC-4492", "amount": 250000},
        approval_provider=mock_human_approver,
        candidate_mutation={"from_acc": "ACC-8831", "to_acc": "ACC-4492", "amount": 900000}
    )

    assert step_h5a.status == StepStatus.FAILED, "El paso debe quedar fallido ante discrepancia de huella"
    assert state_h5a.status == ExecutionStatus.BLOCKED, "El runtime debe bloquear la corrida"
    assert state_h5a.termination_reason == "fingerprint_mismatch", "Motivo debe ser fingerprint_mismatch"
    assert state_h5a.tool_calls_executed == 0, "Ni la acción original ni la mutada deben ejecutarse"
    print("✅ CASO H5a SUPERADO: Disparidad de huellas detectada; mutación bloqueada de inmediato.")

    # =======================================================================
    # CASO H5b: APPROVAL REPLAY PROTECTION (Ataque de Replay)
    # =======================================================================
    print("\n--- EJECUTANDO CASO H5b: APPROVAL REPLAY PROTECTION ---")
    state_h5b = ExecutionState(
        run_id="run-h5b-006", session_id="ses-1", subject_id="usr-101", messages=[]
    )
    # Reutilizamos el registro consumido en H2 (record_h2)
    step_h5b = PlanStep(id="S3_replay", action="transfer_funds", description="Intento Replay", executor=StepExecutor.TOOL)
    budget_h5b = BudgetController()

    state_h5b = run_step_with_guardrails(
        step=step_h5b,
        state=state_h5b,
        evaluator=evaluator,
        budget=budget_h5b,
        tool_args={"from_acc": "ACC-8831", "to_acc": "ACC-4492", "amount": 250000},
        replay_record=record_h2
    )

    assert step_h5b.status == StepStatus.FAILED, "El intento de replay debe fallar"
    assert state_h5b.status == ExecutionStatus.BLOCKED, "El runtime debe bloquear la corrida"
    assert state_h5b.termination_reason == "approval_replay_detected", "Motivo debe ser replay detected"
    assert state_h5b.tool_calls_executed == 0, "La herramienta NO debe ejecutarse por segunda vez"
    print("✅ CASO H5b SUPERADO: Reutilización de aprobación detectada y bloqueada (protección anti-replay aplicada correctamente).")

    # =======================================================================
    # CASO H6: BUDGET CONTROLLER / CIRCUIT BREAKER
    # =======================================================================
    print("\n--- EJECUTANDO CASO H6: BUDGET / CIRCUIT BREAKER ---")
    state_h6 = ExecutionState(
        run_id="run-h6-007", session_id="ses-1", subject_id="usr-101", messages=[]
    )
    # Forzamos que ya se han ejecutado 2 tool calls y el presupuesto máximo es 2
    state_h6.tool_calls_executed = 2
    strict_budget = BudgetController(max_iterations=10, max_tool_calls=2)

    step_h6 = PlanStep(id="S2", action="read_account_balance", description="Consulta excedida", executor=StepExecutor.TOOL)

    state_h6 = run_step_with_guardrails(
        step=step_h6,
        state=state_h6,
        evaluator=evaluator,
        budget=strict_budget,
        tool_args={"account_id": "ACC-8831"}
    )

    assert state_h6.status == ExecutionStatus.BLOCKED, "Runtime debe estar BLOCKED"
    assert state_h6.termination_reason == "budget_exceeded", "Motivo debe ser budget_exceeded"
    assert state_h6.tool_calls_executed == 2, "No debió despachar otra herramienta"
    print("✅ CASO H6 SUPERADO: Disyuntor operativo activado limpiamente con termination_reason='budget_exceeded'.")

    print("\n" + "=" * 75)
    print("¡TODAS LAS PRUEBAS DE GUARDRAILS & HITL (H1, H2, H3, H4, H5a, H5b, H6) SUPERADAS CON ÉXITO!")
    print("=" * 75)
```

---

## 8. Preguntas de Reflexión Técnica para el Grupo

1. **Sobre Capacidad vs Autoridad:** ¿Por qué exponer directamente el `TOOL_REGISTRY` al modelo sin una capa de `ToolPolicy` intermedia es una de las vulnerabilidades más críticas en la arquitectura de agentes?
2. **Sobre Action Binding:** Si un modelo recibe la aprobación para `transfer_funds(amount=250000)` pero luego alucina y llama `transfer_funds(amount=2500000)`, ¿cómo protege el hash SHA-256 sobre serialización determinista al sistema de dicha alteración?
3. **Sobre TOCTOU en el mundo exterior:** Si el hash de la acción coincide 100% con la propuesta, ¿por qué es indispensable que el runtime vuelva a evaluar el saldo y el estado de la cuenta en el microsegundo previo a la ejecución real?
4. **El puente hacia L07 (Observability & Evaluation):** Ahora sabemos que nuestro agente está planificado (L05) y controlado por guardrails y compuertas (L06). Pero en producción: ¿cómo trazamos exactamente cuántas iteraciones ejecutó, qué herramientas llamó, cuánto costó cada paso y cómo evaluamos sistemáticamente si su trayectoria fue óptima?
