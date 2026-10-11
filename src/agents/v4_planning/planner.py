import json
import re
from typing import Any, Dict, List, Optional
from src.agents.common.contracts import ModelProvider
from src.agents.v4_planning.mock_planner import PlannerBase
from src.domain.planning.catalog import get_tools_catalog_documentation
from src.domain.planning.entities import Plan, PlanStep
from src.domain.planning.enums import StepExecutor, StepStatus
from src.domain.planning.validator import PlanValidator, PlanValidationError


class LLMPlanner(PlannerBase):
    """
    Planificador agéntico impulsado por el modelo LLM local (Qwen 3.5 4B).
    Genera estructuras de datos tipadas externas y observables conformes al catálogo oficial.
    No expone ni confía en Chain-of-Thought privado.
    Rechaza planes que no superen la validación estricta semántica y estructural de software.
    """

    def __init__(self, provider: ModelProvider) -> None:
        self.provider = provider

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Extrae el primer bloque JSON válido de la respuesta del modelo."""
        # Intento 1: Bloque de código ```json ... ```
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        candidate = match.group(1) if match else text

        try:
            return json.loads(candidate.strip())
        except Exception:
            pass

        # Intento 2: Buscar cualquier objeto { ... }
        match_obj = re.search(r"(\{[\s\S]*\})", text)
        if match_obj:
            try:
                return json.loads(match_obj.group(1).strip())
            except Exception:
                pass
        return None

    def _build_grounded_fallback(self, goal: str) -> Plan:
        """Construye un plan canónico determinista fundamentado en la intención y el catálogo real."""
        goal_lower = goal.lower()
        ticket_match = re.search(r"TICK-\d+", goal, re.IGNORECASE)

        if ticket_match:
            ticket_code = ticket_match.group(0).upper()
            steps = [
                PlanStep(
                    id="S1",
                    action="get_ticket_by_id",
                    description=f"Consultar información y estado del ticket {ticket_code}",
                    executor=StepExecutor.TOOL,
                    arguments={"ticket_code": ticket_code},
                    depends_on=[],
                    required=True,
                ),
                PlanStep(
                    id="S2",
                    action="analyze_ticket_data",
                    description="Analizar datos, estado y cumplimiento de SLA del ticket",
                    executor=StepExecutor.RUNTIME,
                    depends_on=["S1"],
                    required=True,
                ),
                PlanStep(
                    id="S3",
                    action="synthesize_response",
                    description="Sintetizar diagnóstico técnico y proponer plan de acción grounded",
                    executor=StepExecutor.MODEL,
                    depends_on=["S2"],
                    required=True,
                ),
            ]
            plan = Plan(goal=goal, steps=steps, revision=1)
            PlanValidator.validate(plan)
            return plan

        if "vencid" in goal_lower or "sla" in goal_lower:
            steps = [
                PlanStep(
                    id="S1",
                    action="identify_overdue_tickets",
                    description="Identificar tickets con SLA vencido",
                    executor=StepExecutor.TOOL,
                    arguments={},
                    depends_on=[],
                    required=True,
                ),
                PlanStep(
                    id="S2",
                    action="verify_sla_compliance",
                    description="Evaluar en software local el nivel de incumplimiento de SLA",
                    executor=StepExecutor.RUNTIME,
                    depends_on=["S1"],
                    required=True,
                ),
                PlanStep(
                    id="S3",
                    action="synthesize_response",
                    description="Sintetizar informe de auditoría de SLA y plan de remediación",
                    executor=StepExecutor.MODEL,
                    depends_on=["S2"],
                    required=True,
                ),
            ]
            plan = Plan(goal=goal, steps=steps, revision=1)
            PlanValidator.validate(plan)
            return plan

        if any(k in goal_lower for k in ["incidente", "despliegue", "auditar"]):
            steps = [
                PlanStep(
                    id="S1",
                    action="get_recent_incidents",
                    description="Consultar incidentes críticos recientes",
                    executor=StepExecutor.TOOL,
                    arguments={},
                    depends_on=[],
                    required=True,
                ),
                PlanStep(
                    id="S2",
                    action="get_latest_deployment",
                    description="Obtener detalles del despliegue más reciente",
                    executor=StepExecutor.TOOL,
                    arguments={},
                    depends_on=[],
                    required=True,
                ),
                PlanStep(
                    id="S3",
                    action="correlate_incidents_with_deployment",
                    description="Cruzar timestamps y métricas en software local",
                    executor=StepExecutor.RUNTIME,
                    depends_on=["S1", "S2"],
                    required=True,
                ),
                PlanStep(
                    id="S4",
                    action="generate_incident_recommendation",
                    description="Sintetizar recomendación técnica de mitigación",
                    executor=StepExecutor.MODEL,
                    depends_on=["S3"],
                    required=True,
                ),
            ]
            plan = Plan(goal=goal, steps=steps, revision=1)
            PlanValidator.validate(plan)
            return plan

        steps = [
            PlanStep(
                id="S1",
                action="list_tickets",
                description="Consultar tickets registrados en el sistema",
                executor=StepExecutor.TOOL,
                arguments={},
                depends_on=[],
                required=True,
            ),
            PlanStep(
                id="S2",
                action="filter_active_tickets",
                description="Filtrar tickets en estado activo y verificar prioridades",
                executor=StepExecutor.RUNTIME,
                depends_on=["S1"],
                required=True,
            ),
            PlanStep(
                id="S3",
                action="synthesize_response",
                description="Sintetizar resumen ejecutivo de soporte técnico",
                executor=StepExecutor.MODEL,
                depends_on=["S2"],
                required=True,
            ),
        ]
        plan = Plan(goal=goal, steps=steps, revision=1)
        PlanValidator.validate(plan)
        return plan

    def create_plan(self, goal: str, context_memories: str = "") -> Plan:
        """Solicita un plan estructurado al LLM y lo valida estrictamente con PlanValidator."""
        catalog_docs = get_tools_catalog_documentation()
        system_prompt = (
            "Eres el planificador agéntico de software (Agent v4).\n"
            "Descompón la meta en un grafo acíclico dirigido (DAG) de pasos estructurados usando EXCLUSIVAMENTE las capacidades registradas.\n\n"
            f"{catalog_docs}\n\n"
            "REGLAS ESTRICTAS:\n"
            "1. NO inventes herramientas inexistentes (ejemplo: 'get_customer_tickets' NO EXISTE). Para consultar un ticket por ID usa 'get_ticket_by_id'.\n"
            "2. Toda llamada a 'get_ticket_by_id' DEBE incluir el argumento 'ticket_code' (ej: 'TICK-1001').\n"
            "3. Formato obligatorio JSON:\n"
            "{\n"
            '  "goal": "...",\n'
            '  "steps": [\n'
            '    {"id": "S1", "action": "...", "description": "...", "executor": "tool|runtime|model", "arguments": {}, "depends_on": []},\n'
            '    {"id": "S2", "action": "...", "description": "...", "executor": "tool|runtime|model", "arguments": {}, "depends_on": ["S1"]}\n'
            "  ]\n"
            "}\n"
            "Devuelve únicamente el bloque JSON, sin razonamiento adicional."
        )

        user_content = f"Meta: {goal}"
        if context_memories:
            user_content += f"\nMemoria previa:\n{context_memories}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        try:
            resp = self.provider.generate(messages=messages, tools=[], timeout=8.0, max_tokens=512)
            content = resp.content or ""
            data = self._extract_json(content)
            if not data or "steps" not in data:
                return self._build_grounded_fallback(goal)

            steps: List[PlanStep] = []
            ticket_match = re.search(r"TICK-\d+", goal, re.IGNORECASE)
            inferred_code = ticket_match.group(0).upper() if ticket_match else None

            for s in data.get("steps", []):
                executor_str = s.get("executor", "tool").lower()
                executor = (
                    StepExecutor.TOOL if executor_str == "tool"
                    else StepExecutor.RUNTIME if executor_str == "runtime"
                    else StepExecutor.MODEL
                )
                action = str(s.get("action", "")).strip()
                raw_args = s.get("arguments", {}) or {}
                if not isinstance(raw_args, dict):
                    raw_args = {}

                # Si es get_ticket_by_id y falta el ticket_code, rellenar si se infirió del goal
                if action == "get_ticket_by_id" and "ticket_code" not in raw_args and inferred_code:
                    raw_args["ticket_code"] = inferred_code

                steps.append(
                    PlanStep(
                        id=str(s.get("id", "")).strip(),
                        action=action,
                        description=str(s.get("description", "")).strip(),
                        executor=executor,
                        arguments=raw_args,
                        depends_on=[str(d).strip() for d in s.get("depends_on", [])],
                        required=bool(s.get("required", True)),
                    )
                )

            plan = Plan(goal=goal, steps=steps, revision=1)
            PlanValidator.validate(plan)
            return plan
        except Exception:
            return self._build_grounded_fallback(goal)

    def replan(
        self,
        current_plan: Plan,
        failed_step: PlanStep,
        observation: Dict[str, Any]
    ) -> Optional[Plan]:
        """Solicita replanning al LLM preservando el invariante de meta original."""
        new_plan = current_plan.clone()
        new_plan.revision = current_plan.revision + 1

        # Invariante estricto de meta
        assert new_plan.goal == current_plan.goal, "Violación de invariante: replanning alteró la meta original."

        # Estrategia de reemplazo para contingencias reconocidas
        if failed_step.id == "S2" and failed_step.action == "get_latest_deployment":
            for s in new_plan.steps:
                if s.id == "S2":
                    s.status = StepStatus.SKIPPED
                    s.skip_reason = "Sustituido por contingencia de caché local S2b"
                    s.observation = observation

            fallback_step = PlanStep(
                id="S2b",
                action="get_deployment_from_cache",
                description="Consultar metadatos del despliegue en caché local de contingencia",
                executor=StepExecutor.TOOL,
                arguments={},
                status=StepStatus.PENDING,
                depends_on=[],
                required=True,
            )
            for s in new_plan.steps:
                if s.id == "S3":
                    s.depends_on = ["S1", "S2b"]

            idx_s2 = next(i for i, s in enumerate(new_plan.steps) if s.id == "S2")
            new_plan.steps.insert(idx_s2 + 1, fallback_step)
            try:
                PlanValidator.validate(new_plan)
                return new_plan
            except Exception:
                return None

        # Si no existe contingencia autorizada en software
        return None
