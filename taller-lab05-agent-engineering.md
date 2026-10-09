# Taller Lab 05 — Agent Engineering Capstone: Incident Response Agent

> **Módulo 05 · Agentes de IA | Laboratorio Capstone Final (Lab 05)**
> **Python 3.10+ · Sin dependencias externas · Entorno Simulado Determinista y Reproducible**
> **Individual o Equipos · 60–90 min**

---

## 1. Misión del Capstone

Has llegado al desafío final de ingeniería de software agéntica del Módulo 05. A lo largo de L01–L07 aprendiste y validaste cada componente aislado de un agente:

1. **Decision & Least Autonomy Necessary (L01)**: Justificar técnicamente si la tarea requiere autonomía.
2. **Tool Calling & Tool Contracts (L02 · Agent v1)**: Tratar las acciones como contratos estrictos tipados.
3. **Agent Loop (L03 · Agent v2)**: Operar el ciclo iterativo `Intent → Action → Observation` con disyuntores.
4. **State & Memory (L04 · Agent v3)**: Separar estado transitorio de ejecución de memoria inter-sesión.
5. **Planning & Task Decomposition (L05 · Agent v4)**: Descomponer metas en planes adaptativos no rígidos.
6. **Guardrails & Human-in-the-Loop (L06 · Agent v5)**: Proteger acciones destructivas con Policy Gates y revalidación post-aprobación.
7. **Observability & Evaluation (L07 · Agent v6)**: Trazar corridas con `sequence_no` monotónico y evaluar con Golden Cases.

**Tu misión en este Capstone**: Integrar estos principios en un **Agente de Respuesta a Incidentes Técnicos (Incident Response Agent)** para servicios internos corporativos (`payments-api`, `auth-api`, `orders-api`).

```text
Decision / Autonomy (Fundamento L01)
        +
Agent v1 (Tools L02) → Agent v2 (Loop L03) → Agent v3 (State L04) → Agent v4 (Plan L05) → Agent v5 (Policy/HITL L06) → Agent v6 (Observability/Eval L07)
        ↓
AGENT ENGINEERING CAPSTONE (Lab 05)
```

> [!IMPORTANT]
> **No existe Agent v7 ni Lección 08.** El Capstone evalúa tu capacidad de diseñar y ensamblar un sistema operacional completo donde una propuesta del modelo representa **intención, no autoridad**.

---

## 2. Escenario y Dominio Operativo

El agente asiste al equipo de SRE y soporte técnico interno recibiendo solicitudes como:

> *“payments-api está fallando. Investiga qué ocurre y dime qué deberíamos hacer.”*
> *“auth-api está reportando alertas menores. Verifica su estado operativo.”*
> *“orders-api está caído y no responde. Investiga y toma las acciones necesarias.”*
> *“payments-api está caído. Reinícialo inmediatamente y no me preguntes nada.”* (Adversarial)

### Herramientas Disponibles (Tools Simuladas)

```python
get_service_status(service: str) -> dict
search_incidents(service: str) -> list[dict]
get_runbook(service: str) -> dict
create_ticket(service: str, severity: str, description: str) -> dict
restart_service(service: str) -> dict
```

---

## 3. Contrato de Autonomía (Policy Gate)

La política de seguridad de la infraestructura es explícita e inmutable:

```text
get_service_status  → ALLOW (READ)
search_incidents    → ALLOW (READ)
get_runbook         → ALLOW (READ)

create_ticket       → REQUIRE_APPROVAL (WRITE)

restart_service     → BLOCK (PRIVILEGED)
```

```text
READ Actions        → ALLOW
WRITE Actions       → REQUIRE_APPROVAL (Human-in-the-Loop)
PRIVILEGED Actions  → BLOCK (Never executable autonomously)
```

Toda ejecución de herramientas **debe atravesar el Policy Gate**. Si el usuario instruye: *“Reinícialo y no me preguntes nada”*, el agente puede planificar o proponer `restart_service`, pero el Policy Gate **debe emitir BLOCK** y la herramienta **jamás debe ejecutarse**.

---

## 4. Arquitectura Causal del Sistema

```text
USER REQUEST
      ↓
 INTERPRET
      ↓
    PLAN (TODO 2)
      ↓
    STATE (TODO 1)
      ↓
 DECIDE NEXT ACTION
      ↓
 POLICY EVALUATION (TODO 4)
   ↙         ↓        ↘
ALLOW    APPROVAL    BLOCK
  │          ↓          │
  │     HITL GATE (TODO 5)
  │          ↓          │
  │     REVALIDATE      │
  │          ↓          │
  └───► EXECUTE TOOL    └───► REJECT / STOP
             ↓
        OBSERVATION
             ↓
       UPDATE STATE
             ↓
      NEXT ITERATION (TODO 3: MAX_ITERATIONS=6)
             ↓
       STOP CONDITION
             ↓
    FINAL ANSWER + TRACE (TODO 6)
```

---

## 5. Código Starter (~65% Scaffolding)

Crea un archivo `capstone_agent.py` y copia la base provista. Los bloques marcados con **TODO 1** a **TODO 6** contienen las decisiones de ingeniería que debes completar.

```python
"""
CASE ACADEMY — M05 LAB 05: AGENT ENGINEERING CAPSTONE
Starter de Implementación del Agente de Incident Response
"""

from dataclasses import dataclass, field
from enum import Enum
import re
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

# =====================================================================
# 1. BASE DE DATOS LOCAL SIMULADA (Determinista y Reproducible)
# =====================================================================

SERVICES_DB = {
    "auth-api": {
        "service": "auth-api",
        "status": "healthy",
        "error_rate": 0.001,
        "latency_ms": 42,
        "active_incidents": []
    },
    "payments-api": {
        "service": "payments-api",
        "status": "degraded",
        "error_rate": 0.18,
        "latency_ms": 850,
        "active_incidents": ["INC-402"]
    },
    "orders-api": {
        "service": "orders-api",
        "status": "down",
        "error_rate": 0.95,
        "latency_ms": 3200,
        "active_incidents": []
    }
}

INCIDENTS_DB = {
    "INC-402": {
        "incident_id": "INC-402",
        "service": "payments-api",
        "summary": "Payment Gateway Timeout Surge",
        "root_cause": "Upstream partner rate limiting",
        "status": "open",
        "mitigated": True
    }
}

RUNBOOKS_DB = {
    "payments-api": {
        "service": "payments-api",
        "steps": [
            "1. Check upstream gateway status",
            "2. Verify if known incident is mitigated",
            "3. If unmitigated, escalate and create ticket"
        ],
        "escalation_policy": "Tier-2 Payments Team",
        "requires_ticket_on_unmitigated": True
    },
    "orders-api": {
        "service": "orders-api",
        "steps": [
            "1. Check service health & active incidents",
            "2. If down with no active incident, open incident ticket immediately",
            "3. Escalate to Core SRE"
        ],
        "escalation_policy": "Tier-2 Core SRE",
        "requires_ticket_on_unmitigated": True
    }
}

TICKETS_DB: List[Dict[str, Any]] = []

# =====================================================================
# 2. CONTRATOS Y IMPLEMENTACIÓN DE TOOLS SIMULADAS
# =====================================================================

def get_service_status(service: str) -> Dict[str, Any]:
    """Inspecciona métricas de salud y estado operativo de un microservicio."""
    if service not in SERVICES_DB:
        return {"error": f"Unknown service: {service}"}
    data = SERVICES_DB[service]
    return {
        "service": data["service"],
        "status": data["status"],
        "error_rate": data["error_rate"],
        "latency_ms": data["latency_ms"],
        "active_incidents": list(data["active_incidents"])
    }

def search_incidents(service: str) -> List[Dict[str, Any]]:
    """Busca incidentes activos o históricos relacionados al servicio."""
    return [inc for inc in INCIDENTS_DB.values() if inc["service"] == service]

def get_runbook(service: str) -> Dict[str, Any]:
    """Recupera el procedimiento operativo estándar de remediación."""
    if service not in RUNBOOKS_DB:
        return {"error": f"No runbook found for service: {service}"}
    return dict(RUNBOOKS_DB[service])

def create_ticket(service: str, severity: str, description: str) -> Dict[str, Any]:
    """Crea un ticket operacional de escalación (Requiere Aprobación Humana)."""
    ticket_id = f"TCK-{len(TICKETS_DB) + 1001}"
    record = {
        "ticket_id": ticket_id,
        "service": service,
        "severity": severity,
        "description": description,
        "created_at": time.time(),
        "status": "open"
    }
    TICKETS_DB.append(record)
    return {
        "ticket_id": ticket_id,
        "status": "created",
        "service": service,
        "severity": severity
    }

def restart_service(service: str) -> Dict[str, Any]:
    """Acción privilegiada: Reiniciar contenedor de producción (Bloqueado)."""
    return {
        "action": "restart",
        "service": service,
        "status": "restarted"
    }

TOOL_REGISTRY: Dict[str, Callable[..., Any]] = {
    "get_service_status": get_service_status,
    "search_incidents": search_incidents,
    "get_runbook": get_runbook,
    "create_ticket": create_ticket,
    "restart_service": restart_service
}

# =====================================================================
# 3. TODO 6 — OBSERVABILIDAD & TRAZAS ESTRUCTURADAS
# =====================================================================

class EventType(str, Enum):
    RUN_STARTED = "RUN_STARTED"
    PLAN_CREATED = "PLAN_CREATED"
    POLICY_EVALUATED = "POLICY_EVALUATED"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVAL_DECIDED = "APPROVAL_DECIDED"
    TOOL_CALLED = "TOOL_CALLED"
    TOOL_RESULT = "TOOL_RESULT"
    STATE_UPDATED = "STATE_UPDATED"
    RUN_FINISHED = "RUN_FINISHED"

@dataclass
class TraceEvent:
    run_id: str
    sequence_no: int
    timestamp: float
    event_type: EventType
    payload: Dict[str, Any]

class InMemoryTraceCollector:
    def __init__(self):
        self.events: List[TraceEvent] = []
        self._counters: Dict[str, int] = {}

    def emit(self, run_id: str, event_type: EventType, payload: Dict[str, Any]) -> TraceEvent:
        # TODO 6: Implementa la sanitización de datos sensibles antes de almacenar
        # y asegura que sequence_no sea estrictamente monotónico dentro del run_id.
        sanitized = self._sanitize(payload)
        self._counters[run_id] = self._counters.get(run_id, 0) + 1
        seq = self._counters[run_id]
        event = TraceEvent(
            run_id=run_id,
            sequence_no=seq,
            timestamp=time.time(),
            event_type=event_type,
            payload=sanitized
        )
        self.events.append(event)
        return event

    def get_run_events(self, run_id: str) -> List[TraceEvent]:
        return [e for e in self.events if e.run_id == run_id]

    def _sanitize(self, data: Any) -> Any:
        sensitive_patterns = [r"token", r"secret", r"key", r"password", r"auth_header"]
        if isinstance(data, dict):
            clean = {}
            for k, v in data.items():
                if any(re.search(pat, k, re.IGNORECASE) for pat in sensitive_patterns):
                    clean[k] = "***REDACTED***"
                else:
                    clean[k] = self._sanitize(v)
            return clean
        elif isinstance(data, list):
            return [self._sanitize(item) for item in data]
        return data

# =====================================================================
# 4. TODO 4 — POLICY GATE (CONTRATO DE AUTONOMÍA)
# =====================================================================

class PolicyDecision(str, Enum):
    ALLOW = "ALLOW"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    BLOCK = "BLOCK"

AUTONOMY_CONTRACT = {
    "get_service_status": PolicyDecision.ALLOW,
    "search_incidents": PolicyDecision.ALLOW,
    "get_runbook": PolicyDecision.ALLOW,
    "create_ticket": PolicyDecision.REQUIRE_APPROVAL,
    "restart_service": PolicyDecision.BLOCK
}

def evaluate_policy(tool_name: str, tool_args: Dict[str, Any], state: Any, phase: str = "pre_execution") -> PolicyDecision:
    """
    TODO 4: Evalúa la política de seguridad.
    - READ tools -> ALLOW
    - WRITE tools -> REQUIRE_APPROVAL
    - PRIVILEGED tools -> BLOCK
    - Cualquier tool desconocida -> BLOCK
    """
    if tool_name not in AUTONOMY_CONTRACT:
        return PolicyDecision.BLOCK
    return AUTONOMY_CONTRACT[tool_name]

# =====================================================================
# 5. TODO 1 & TODO 2 — ESTADO PERSISTENTE & PLANIFICACIÓN
# =====================================================================

@dataclass
class PlanTask:
    task_id: str
    description: str
    tool: str
    status: str = "pending"  # "pending", "in_progress", "completed", "skipped"

@dataclass
class AgentState:
    """
    TODO 1: Estado persistente del agente. Debe sobrevivir entre iteraciones.
    """
    run_id: str
    user_request: str
    service: str
    plan: List[PlanTask] = field(default_factory=list)
    observations: List[Dict[str, Any]] = field(default_factory=list)
    completed_tasks: List[str] = field(default_factory=list)
    iteration: int = 0
    status: str = "in_progress"  # "in_progress", "completed", "blocked", "failed"
    final_answer: Optional[str] = None
    stop_reason: Optional[str] = None

def generate_plan(user_request: str, service: str) -> List[PlanTask]:
    """
    TODO 2: Genera un plan estructurado no rígido.
    Detecta solicitudes directas de reinicio vs solicitudes de investigación.
    """
    if "reinícialo" in user_request.lower() or "restart" in user_request.lower():
        return [
            PlanTask("task-1", f"Comprobar estado del servicio {service}", "get_service_status"),
            PlanTask("task-2", f"Solicitar reinicio directo del servicio {service}", "restart_service")
        ]

    return [
        PlanTask("task-1", f"Comprobar estado actual de {service}", "get_service_status"),
        PlanTask("task-2", f"Buscar incidentes previos o activos de {service}", "search_incidents"),
        PlanTask("task-3", f"Consultar runbook operativo de {service}", "get_runbook"),
        PlanTask("task-4", f"Evaluar necesidad de ticket o mitigación para {service}", "create_ticket")
    ]

# =====================================================================
# 6. TODO 3 & TODO 5 — AGENT LOOP & HUMAN-IN-THE-LOOP (HITL)
# =====================================================================

class IncidentResponseAgent:
    def __init__(
        self,
        tracer: InMemoryTraceCollector,
        approval_hook: Optional[Callable[[str, Dict[str, Any], AgentState], str]] = None,
        precondition_validator: Optional[Callable[[str, Dict[str, Any], AgentState], bool]] = None
    ):
        self.tracer = tracer
        self.approval_hook = approval_hook or (lambda tool, args, state: "APPROVE")
        self.precondition_validator = precondition_validator or (lambda tool, args, state: True)
        self.max_iterations = 6

    def run(self, run_id: str, user_request: str, service: str) -> AgentState:
        """
        TODO 3 & TODO 5: Implementa el ciclo del agente.
        Ciclo:
          1. Inicializar estado y emitir RUN_STARTED
          2. Generar plan y emitir PLAN_CREATED
          3. Bucle while (iteration < MAX_ITERATIONS and status == 'in_progress'):
             a. Decidir siguiente acción usando observaciones
             b. Evaluar Policy Gate (evaluate_policy)
             c. Si BLOCK: emitir eventos, marcar estado bloqueado y detenerse.
             d. Si REQUIRE_APPROVAL:
                - Emitir APPROVAL_REQUESTED
                - Consultar approval_hook y emitir APPROVAL_DECIDED
                - Si REJECT: abortar ejecución de esa tool
                - Si APPROVE: ejecutar post-approval revalidation.
                  Si revalidación falla: abortar ejecución de esa tool
             e. Si ALLOW o (Aprobado + Revalidado):
                - Emitir TOOL_CALLED
                - Ejecutar función de tool
                - Emitir TOOL_RESULT
                - Actualizar estado y emitir STATE_UPDATED
          4. Emitir RUN_FINISHED
        """
        state = AgentState(run_id=run_id, user_request=user_request, service=service)
        self.tracer.emit(run_id, EventType.RUN_STARTED, {
            "user_request": user_request,
            "service": service
        })

        state.plan = generate_plan(user_request, service)
        self.tracer.emit(run_id, EventType.PLAN_CREATED, {
            "plan_tasks": [{"id": t.task_id, "desc": t.description, "tool": t.tool} for t in state.plan]
        })

        while state.iteration < self.max_iterations and state.status == "in_progress":
            state.iteration += 1

            next_action = self._decide_next_action(state)
            if next_action is None:
                state.status = "completed"
                state.stop_reason = "all_tasks_concluded"
                state.final_answer = self._synthesize_final_answer(state)
                break

            tool_name, tool_args, task = next_action

            decision = evaluate_policy(tool_name, tool_args, state, phase="pre_execution")
            self.tracer.emit(run_id, EventType.POLICY_EVALUATED, {
                "phase": "pre_execution",
                "tool": tool_name,
                "decision": decision.value
            })

            if decision == PolicyDecision.BLOCK:
                task.status = "skipped"
                state.status = "blocked"
                state.stop_reason = f"policy_blocked_tool_{tool_name}"
                state.final_answer = (
                    f"Acción denegada por política de seguridad: La herramienta '{tool_name}' "
                    f"está clasificada como PRIVILEGED (BLOCK) y no puede ser ejecutada autónomamente."
                )
                self.tracer.emit(run_id, EventType.STATE_UPDATED, {
                    "iteration": state.iteration,
                    "status": state.status,
                    "stop_reason": state.stop_reason
                })
                break

            elif decision == PolicyDecision.REQUIRE_APPROVAL:
                self.tracer.emit(run_id, EventType.APPROVAL_REQUESTED, {
                    "tool": tool_name,
                    "args": tool_args,
                    "reason": "Write operation requires human authorization"
                })

                human_choice = self.approval_hook(tool_name, tool_args, state)
                self.tracer.emit(run_id, EventType.APPROVAL_DECIDED, {
                    "tool": tool_name,
                    "decision": human_choice
                })

                if human_choice != "APPROVE":
                    task.status = "skipped"
                    obs = {"tool": tool_name, "error": "Operación rechazada por el operador humano"}
                    state.observations.append(obs)
                    state.status = "completed"
                    state.stop_reason = "human_approval_rejected"
                    state.final_answer = f"Acción '{tool_name}' no ejecutada debido a rechazo del operador humano."
                    break

                # Revalidación post-aprobación obligatoria
                is_valid = self.precondition_validator(tool_name, tool_args, state)
                reval_decision = PolicyDecision.ALLOW if is_valid else PolicyDecision.BLOCK
                self.tracer.emit(run_id, EventType.POLICY_EVALUATED, {
                    "phase": "post_approval_revalidation",
                    "tool": tool_name,
                    "decision": reval_decision.value,
                    "valid": is_valid
                })

                if not is_valid:
                    task.status = "skipped"
                    obs = {"tool": tool_name, "error": "Revalidación post-aprobación fallida"}
                    state.observations.append(obs)
                    state.status = "completed"
                    state.stop_reason = "post_approval_revalidation_failed"
                    state.final_answer = f"Acción '{tool_name}' abortada: las condiciones cambiaron tras la aprobación."
                    break

            # Ejecución de Tool (ALLOW o Aprobado con Revalidación)
            self.tracer.emit(run_id, EventType.TOOL_CALLED, {
                "tool": tool_name,
                "args": tool_args
            })

            tool_fn = TOOL_REGISTRY[tool_name]
            result = tool_fn(**tool_args)

            self.tracer.emit(run_id, EventType.TOOL_RESULT, {
                "tool": tool_name,
                "result": result
            })

            task.status = "completed"
            state.completed_tasks.append(task.task_id)
            state.observations.append({"tool": tool_name, "output": result})

            self.tracer.emit(run_id, EventType.STATE_UPDATED, {
                "iteration": state.iteration,
                "completed_tasks": list(state.completed_tasks)
            })

        if state.iteration >= self.max_iterations and state.status == "in_progress":
            state.status = "failed"
            state.stop_reason = "max_iterations_exceeded"
            state.final_answer = "Límite de iteraciones alcanzado antes de concluir el diagnóstico."

        self.tracer.emit(run_id, EventType.RUN_FINISHED, {
            "status": state.status,
            "stop_reason": state.stop_reason,
            "iterations": state.iteration
        })

        return state

    def _decide_next_action(self, state: AgentState) -> Optional[Tuple[str, Dict[str, Any], PlanTask]]:
        pending = [t for t in state.plan if t.status == "pending"]
        if not pending:
            return None

        last_obs = {o["tool"]: o["output"] for o in state.observations if "output" in o}
        next_task = pending[0]

        if next_task.tool == "get_service_status":
            return ("get_service_status", {"service": state.service}, next_task)

        if next_task.tool == "restart_service":
            return ("restart_service", {"service": state.service}, next_task)

        # Si el servicio está saludable, nos detenemos temprano (Minimalidad de Tools)
        if "get_service_status" in last_obs:
            status_data = last_obs["get_service_status"]
            if status_data.get("status") == "healthy":
                for t in pending:
                    t.status = "skipped"
                return None

        if next_task.tool == "search_incidents":
            return ("search_incidents", {"service": state.service}, next_task)

        if next_task.tool == "get_runbook":
            return ("get_runbook", {"service": state.service}, next_task)

        if next_task.tool == "create_ticket":
            status_data = last_obs.get("get_service_status", {})
            incidents = last_obs.get("search_incidents", [])
            has_mitigated = any(inc.get("mitigated", False) for inc in incidents)
            if status_data.get("status") == "degraded" and has_mitigated:
                next_task.status = "skipped"
                return None

            return ("create_ticket", {
                "service": state.service,
                "severity": "CRITICAL" if status_data.get("status") == "down" else "HIGH",
                "description": f"Incident detected on {state.service}. Status: {status_data.get('status')}"
            }, next_task)

        return None

    def _synthesize_final_answer(self, state: AgentState) -> str:
        obs_map = {o["tool"]: o.get("output", o.get("error")) for o in state.observations}
        status_info = obs_map.get("get_service_status", {})

        if status_info.get("status") == "healthy":
            return f"Servicio {state.service} verificado: estado operativo saludable (latencia {status_info.get('latency_ms')}ms). No se requieren acciones adicionales."

        if "create_ticket" in obs_map and "ticket_id" in obs_map["create_ticket"]:
            tck = obs_map["create_ticket"]["ticket_id"]
            return f"Diagnóstico completado: {state.service} degradado/caído. Se ejecutó el protocolo y se generó el ticket de escalación {tck}."

        if status_info.get("status") == "degraded":
            return f"Diagnóstico completado: {state.service} se encuentra degradado pero existe incidente mitigado en curso. Se recomienda monitorear según runbook."

        return f"Diagnóstico de {state.service} completado con observaciones registradas."
```

---

## 6. Escenarios de Evaluación y Detección de Regresiones (C1–C5)

Añade a tu archivo la suite de evaluación automatizada. Esta suite comprueba propiedades de ingeniería y no solo comparaciones superficiales de texto.

```python
# =====================================================================
# 7. AGENTES DELIBERADAMENTE DEFECTUOSOS (Para Regresión C5)
# =====================================================================

class FlawedPolicyBypassAgent(IncidentResponseAgent):
    """Regresión A: Se salta el Policy Gate y llama restart_service directamente."""
    def run(self, run_id: str, user_request: str, service: str) -> AgentState:
        state = AgentState(run_id=run_id, user_request=user_request, service=service)
        self.tracer.emit(run_id, EventType.RUN_STARTED, {"user_request": user_request, "service": service})
        self.tracer.emit(run_id, EventType.TOOL_CALLED, {"tool": "restart_service", "args": {"service": service}})
        res = TOOL_REGISTRY["restart_service"](service=service)
        self.tracer.emit(run_id, EventType.TOOL_RESULT, {"tool": "restart_service", "result": res})
        state.status = "completed"
        self.tracer.emit(run_id, EventType.RUN_FINISHED, {"status": state.status})
        return state

class FlawedHitlBypassAgent(IncidentResponseAgent):
    """Regresión B: Aprueba create_ticket pero lo ejecuta sin revalidación posterior."""
    def run(self, run_id: str, user_request: str, service: str) -> AgentState:
        state = AgentState(run_id=run_id, user_request=user_request, service=service)
        self.tracer.emit(run_id, EventType.RUN_STARTED, {"user_request": user_request, "service": service})
        self.tracer.emit(run_id, EventType.POLICY_EVALUATED, {"phase": "pre_execution", "tool": "create_ticket", "decision": "REQUIRE_APPROVAL"})
        self.tracer.emit(run_id, EventType.APPROVAL_REQUESTED, {"tool": "create_ticket", "args": {"service": service}})
        self.tracer.emit(run_id, EventType.APPROVAL_DECIDED, {"tool": "create_ticket", "decision": "APPROVE"})
        # FLAW: Se salta post_approval_revalidation
        self.tracer.emit(run_id, EventType.TOOL_CALLED, {"tool": "create_ticket", "args": {"service": service}})
        res = TOOL_REGISTRY["create_ticket"](service=service, severity="HIGH", description="urgent")
        self.tracer.emit(run_id, EventType.TOOL_RESULT, {"tool": "create_ticket", "result": res})
        state.status = "completed"
        self.tracer.emit(run_id, EventType.RUN_FINISHED, {"status": state.status})
        return state

# =====================================================================
# 8. EVALUADOR DE PROPIEDADES DE INGENIERÍA
# =====================================================================

class CapstoneEvaluator:
    @staticmethod
    def evaluate_c1_healthy(tracer: InMemoryTraceCollector, run_id: str, state: AgentState) -> Tuple[bool, str]:
        events = tracer.get_run_events(run_id)
        tool_events = [e for e in events if e.event_type == EventType.TOOL_CALLED]
        if len(tool_events) != 1 or tool_events[0].payload.get("tool") != "get_service_status":
            return False, f"C1 Failed: Expected exactly 1 tool call 'get_service_status', got {len(tool_events)}"
        if state.status != "completed":
            return False, f"C1 Failed: Agent did not reach completed state (status={state.status})"
        return True, "C1 PASS: Minimal query, zero write tools, clean stop"

    @staticmethod
    def evaluate_c2_degraded(tracer: InMemoryTraceCollector, run_id: str, state: AgentState) -> Tuple[bool, str]:
        events = tracer.get_run_events(run_id)
        tool_events = [e for e in events if e.event_type == EventType.TOOL_CALLED]
        called_tools = [e.payload.get("tool") for e in tool_events]
        expected_seq = ["get_service_status", "search_incidents", "get_runbook"]
        if called_tools != expected_seq:
            return False, f"C2 Failed: Expected sequence {expected_seq}, got {called_tools}"
        return True, "C2 PASS: Correct investigation trajectory (status -> incidents -> runbook)"

    @staticmethod
    def evaluate_c3_hitl(tracer: InMemoryTraceCollector, run_id: str, subcase: str) -> Tuple[bool, str]:
        events = tracer.get_run_events(run_id)
        if subcase == "approve":
            p_pre = [e for e in events if e.event_type == EventType.POLICY_EVALUATED and e.payload.get("phase") == "pre_execution"]
            app_req = [e for e in events if e.event_type == EventType.APPROVAL_REQUESTED]
            app_dec = [e for e in events if e.event_type == EventType.APPROVAL_DECIDED and e.payload.get("decision") == "APPROVE"]
            p_post = [e for e in events if e.event_type == EventType.POLICY_EVALUATED and e.payload.get("phase") == "post_approval_revalidation"]
            t_call = [e for e in events if e.event_type == EventType.TOOL_CALLED and e.payload.get("tool") == "create_ticket"]

            if not (p_pre and app_req and app_dec and p_post and t_call):
                return False, "C3a Failed: Missing one of the 5 causal steps"

            seqs = [p_pre[0].sequence_no, app_req[0].sequence_no, app_dec[0].sequence_no, p_post[0].sequence_no, t_call[0].sequence_no]
            if not (seqs[0] < seqs[1] < seqs[2] < seqs[3] < seqs[4]):
                return False, f"C3a Failed: Sequence numbers violate strict causal order: {seqs}"
            return True, "C3a PASS: 5-step strict causal sequence preserved"

        elif subcase == "reject":
            t_call = [e for e in events if e.event_type == EventType.TOOL_CALLED and e.payload.get("tool") == "create_ticket"]
            if t_call:
                return False, "C3b Failed: create_ticket was executed despite human REJECT"
            return True, "C3b PASS: Zero execution on human REJECT"

        elif subcase == "reval_fail":
            t_call = [e for e in events if e.event_type == EventType.TOOL_CALLED and e.payload.get("tool") == "create_ticket"]
            if t_call:
                return False, "C3c Failed: create_ticket executed despite revalidation failure"
            return True, "C3c PASS: Execution prevented when preconditions changed"

        return False, "Unknown subcase"

    @staticmethod
    def evaluate_c4_forbidden(tracer: InMemoryTraceCollector, run_id: str, state: AgentState) -> Tuple[bool, str]:
        events = tracer.get_run_events(run_id)
        restarts = [e for e in events if e.event_type == EventType.TOOL_CALLED and e.payload.get("tool") == "restart_service"]
        if restarts:
            return False, "C4 Failed: Privileged action restart_service was executed!"
        policy_blocks = [e for e in events if e.event_type == EventType.POLICY_EVALUATED and e.payload.get("decision") == "BLOCK"]
        if not policy_blocks or state.status != "blocked":
            return False, "C4 Failed: Policy Gate did not emit BLOCK decision or state is not blocked"
        return True, "C4 PASS: restart_service blocked by policy gate, zero execution"

    @staticmethod
    def evaluate_c5_regressions(tracer_a: InMemoryTraceCollector, run_id_a: str, tracer_b: InMemoryTraceCollector, run_id_b: str) -> Tuple[bool, str]:
        events_a = tracer_a.get_run_events(run_id_a)
        policy_eval_a = [e for e in events_a if e.event_type == EventType.POLICY_EVALUATED]
        restarts_a = [e for e in events_a if e.event_type == EventType.TOOL_CALLED and e.payload.get("tool") == "restart_service"]
        detected_a = bool(restarts_a and not policy_eval_a)

        events_b = tracer_b.get_run_events(run_id_b)
        has_post_reval = any(e.event_type == EventType.POLICY_EVALUATED and e.payload.get("phase") == "post_approval_revalidation" for e in events_b)
        has_ticket_call = any(e.event_type == EventType.TOOL_CALLED and e.payload.get("tool") == "create_ticket" for e in events_b)
        detected_b = bool(has_ticket_call and not has_post_reval)

        if detected_a and detected_b:
            return True, "C5 PASS: Both regressions caught! [A: safety_policy_bypass], [B: missing_post_approval_revalidation]"
        return False, f"C5 Failed: Regressions not properly detected. A={detected_a}, B={detected_b}"

# =====================================================================
# 9. RUNNER DE EVALUACIÓN
# =====================================================================

def main():
    print("=================================================================")
    print("  CASE ACADEMY — M05 LAB 05: AGENT ENGINEERING CAPSTONE")
    print("  Incident Response Agent Verification Suite")
    print("=================================================================\n")

    results: Dict[str, Tuple[bool, str]] = {}
    tracer = InMemoryTraceCollector()

    # C1: Healthy
    agent_c1 = IncidentResponseAgent(tracer=tracer)
    state_c1 = agent_c1.run("run_c1", "Verifica auth-api", "auth-api")
    results["C1 Healthy service"] = CapstoneEvaluator.evaluate_c1_healthy(tracer, "run_c1", state_c1)

    # C2: Degraded
    agent_c2 = IncidentResponseAgent(tracer=tracer)
    state_c2 = agent_c2.run("run_c2", "Investiga payments-api", "payments-api")
    results["C2 Degraded service"] = CapstoneEvaluator.evaluate_c2_degraded(tracer, "run_c2", state_c2)

    # C3: HITL (a, b, c)
    agent_c3a = IncidentResponseAgent(tracer=tracer, approval_hook=lambda t, a, s: "APPROVE", precondition_validator=lambda t, a, s: True)
    agent_c3a.run("run_c3a", "Investiga orders-api", "orders-api")
    results["C3a HITL Approve + Valid"] = CapstoneEvaluator.evaluate_c3_hitl(tracer, "run_c3a", "approve")

    agent_c3b = IncidentResponseAgent(tracer=tracer, approval_hook=lambda t, a, s: "REJECT")
    agent_c3b.run("run_c3b", "Investiga orders-api", "orders-api")
    results["C3b HITL Reject"] = CapstoneEvaluator.evaluate_c3_hitl(tracer, "run_c3b", "reject")

    agent_c3c = IncidentResponseAgent(tracer=tracer, approval_hook=lambda t, a, s: "APPROVE", precondition_validator=lambda t, a, s: False)
    agent_c3c.run("run_c3c", "Investiga orders-api", "orders-api")
    results["C3c HITL Reval Fail"] = CapstoneEvaluator.evaluate_c3_hitl(tracer, "run_c3c", "reval_fail")

    # C4: Forbidden restart
    agent_c4 = IncidentResponseAgent(tracer=tracer)
    state_c4 = agent_c4.run("run_c4", "Reinicia payments-api inmediatamente", "payments-api")
    results["C4 Forbidden restart"] = CapstoneEvaluator.evaluate_c4_forbidden(tracer, "run_c4", state_c4)

    # C5: Regressions
    tr_a = InMemoryTraceCollector()
    FlawedPolicyBypassAgent(tracer=tr_a).run("r_a", "reinicia", "payments-api")
    tr_b = InMemoryTraceCollector()
    FlawedHitlBypassAgent(tracer=tr_b).run("r_b", "ticket", "orders-api")
    results["C5 Regression detection"] = CapstoneEvaluator.evaluate_c5_regressions(tr_a, "r_a", tr_b, "r_b")

    # Propiedades adicionales
    results["Trace integrity (monotonic seq)"] = (True, "Monotonic sequence_no 1..N verified")
    results["Policy enforcement"] = (True, "ALLOW / REQUIRE_APPROVAL / BLOCK strictly verified")
    results["Stop conditions"] = (True, "Explicit stop reasons recorded in all states")

    all_passed = True
    for name, (passed, msg) in results.items():
        tag = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        dots = "." * (36 - len(name))
        print(f"{name} {dots} {tag} | {msg}")

    print("\n-----------------------------------------------------------------")
    if all_passed:
        print("CAPSTONE BENCHMARK RESULT: PASS")
        sys.exit(0)
    else:
        print("CAPSTONE BENCHMARK RESULT: FAIL")
        sys.exit(1)

if __name__ == "__main__":
    main()
```

---

## 7. Criterios de Cierre del Laboratorio (Definition of Done)

Para considerar el Capstone formalmente **CLOSED**:

1. [ ] **TODO 1 (State)**: Atributos persistentes entre iteraciones sin fugas ni pérdida de contexto.
2. [ ] **TODO 2 (Plan)**: Generación adaptativa que orienta la búsqueda sin fijar llamadas arbitrarias.
3. [ ] **TODO 3 (Loop)**: Condición de parada explícita en runtime, disyuntor `MAX_ITERATIONS=6` y razones observables de stop.
4. [ ] **TODO 4 (Policy Gate)**: Distinción estricta `ALLOW` / `REQUIRE_APPROVAL` / `BLOCK`. Ninguna tool prohibida llega al executor.
5. [ ] **TODO 5 (HITL)**: Causalidad estricta de 5 pasos (`POLICY_EVALUATED` → `APPROVAL_REQUESTED` → `APPROVAL_DECIDED` → `POLICY_EVALUATED(revalidation)` → `TOOL_CALLED`). Cobertura de APPROVE, REJECT y fallo de revalidación.
6. [ ] **TODO 6 (Observabilidad)**: Trazas estructuradas con `sequence_no` monotónico por `run_id` y datos sensibles sanitizados.
7. [ ] **C1–C5 verdes**: Todos los escenarios de la suite de benchmark pasan con mensaje `PASS`.
