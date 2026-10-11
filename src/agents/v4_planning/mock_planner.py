from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from src.domain.planning.entities import Plan, PlanStep
from src.domain.planning.enums import StepExecutor, StepStatus


class PlannerBase(ABC):
    """Interfaz abstracta del planificador agéntico."""

    @abstractmethod
    def create_plan(self, goal: str, context_memories: str = "") -> Plan:
        """Propone un plan estructurado inicial para la meta dada."""
        pass

    @abstractmethod
    def replan(
        self,
        current_plan: Plan,
        failed_step: PlanStep,
        observation: Dict[str, Any]
    ) -> Optional[Plan]:
        """Propone una nueva revisión del plan ante una contingencia observada."""
        pass


class MockPlanner(PlannerBase):
    """
    Planificador determinista para pruebas reproducibles y grupos de estudio (Casos G1 y G2).
    Asegura comportamiento predecible sin depender de latencias o disponibilidad de LLMs.
    """

    def create_plan(self, goal: str, context_memories: str = "") -> Plan:
        import re
        goal_lower = goal.lower()

        # 1. Caso ticket específico por código (ej. "Diagnosticar ticket TICK-1001 y proponer plan")
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
            return Plan(goal=goal, steps=steps, revision=1)

        # 2. Caso auditoría de tickets vencidos / SLA
        if "vencid" in goal_lower or "sla" in goal_lower:
            steps = [
                PlanStep(
                    id="S1",
                    action="identify_overdue_tickets",
                    description="Identificar tickets con acuerdo de nivel de servicio (SLA) vencido",
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
            return Plan(goal=goal, steps=steps, revision=1)

        # 3. Escenario de investigación técnica: Incidentes vs Despliegues (Casos G1 y G2 del currículo)
        if "incidente" in goal_lower or "despliegue" in goal_lower or "auditar" in goal_lower:
            steps = [
                PlanStep(
                    id="S1",
                    action="get_recent_incidents",
                    description="Consultar incidentes críticos de las últimas 24 horas",
                    executor=StepExecutor.TOOL,
                    depends_on=[],
                    required=True,
                ),
                PlanStep(
                    id="S2",
                    action="get_latest_deployment",
                    description="Obtener detalles y commits del despliegue más reciente",
                    executor=StepExecutor.TOOL,
                    depends_on=[],
                    required=True,
                ),
                PlanStep(
                    id="S3",
                    action="correlate_incidents_with_deployment",
                    description="Cruzar timestamps y microservicios entre incidentes y despliegue",
                    executor=StepExecutor.RUNTIME,
                    depends_on=["S1", "S2"],
                    required=True,
                ),
                PlanStep(
                    id="S4",
                    action="generate_incident_recommendation",
                    description="Sintetizar hallazgos y redactar recomendación técnica para ingeniería",
                    executor=StepExecutor.MODEL,
                    depends_on=["S3"],
                    required=True,
                ),
            ]
            return Plan(goal=goal, steps=steps, revision=1)

        # 4. Plan canónico general de 3 pasos con herramienta registrada list_tickets
        return Plan(
            goal=goal,
            steps=[
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
            ],
            revision=1,
        )

    def replan(
        self,
        current_plan: Plan,
        failed_step: PlanStep,
        observation: Dict[str, Any]
    ) -> Optional[Plan]:
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
        if failed_step.id == "S2" and failed_step.action == "get_latest_deployment":
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
                required=True,
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


class StallMockPlanner(MockPlanner):
    """
    Planificador para reproducir el Caso G3 (Runtime Stall / no_executable_steps).
    Genera un grafo inicialmente válido S1 -> S2 -> S3, donde S2 ejecuta una
    llamada fallida no recuperable y replan() retorna None, forzando la detención segura.
    """

    def create_plan(self, goal: str, context_memories: str = "") -> Plan:
        return Plan(
            goal=goal,
            steps=[
                PlanStep(
                    id="S1",
                    action="get_recent_incidents",
                    description="Consultar incidentes recientes",
                    executor=StepExecutor.TOOL,
                    depends_on=[],
                    required=True,
                ),
                PlanStep(
                    id="S2",
                    action="unrecoverable_legacy_call",
                    description="Paso con herramienta de legado no recuperable",
                    executor=StepExecutor.TOOL,
                    depends_on=["S1"],
                    required=True,
                ),
                PlanStep(
                    id="S3",
                    action="generate_incident_recommendation",
                    description="Síntesis dependiente del paso 2",
                    executor=StepExecutor.MODEL,
                    depends_on=["S2"],
                    required=True,
                ),
            ],
            revision=1,
        )

    def replan(
        self,
        current_plan: Plan,
        failed_step: PlanStep,
        observation: Dict[str, Any]
    ) -> Optional[Plan]:
        # Sin ruta alternativa para unrecoverable_legacy_call -> Retorna None
        return None
