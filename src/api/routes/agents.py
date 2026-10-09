from typing import List
from fastapi import APIRouter
from src.api.schemas import AgentMeta, PersonaInfo

router = APIRouter(prefix="/api", tags=["Agents & Personas"])

AGENTS_CATALOG: List[AgentMeta] = [
    AgentMeta(
        id="test_sse",
        name="Test SSE — Despachador Controlado",
        workshop="Laboratorio / Diagnóstico",
        enabled=True,
        status="ready",
        description="Emisor controlado con pausas de 400ms para validar recepción progresiva y cancelación.",
        badge="Diagnóstico",
        hops_count=6,
    ),
    AgentMeta(
        id="v1",
        name="Agent v1 — Tool Calling",
        workshop="Taller 02",
        enabled=True,
        status="ready",
        description="Orquestación lineal de 7 hops. Protocolo declarativo y despacho soberano en CPU.",
        badge="Operativo (L02)",
        hops_count=7,
    ),
    AgentMeta(
        id="v2",
        name="Agent v2 — Agent Loop",
        workshop="Taller 03",
        enabled=False,
        status="future",
        description="Bucle iterativo con control de max_iterations y decisiones dependientes multi-step.",
        badge="Próximamente",
    ),
    AgentMeta(
        id="v3",
        name="Agent v3 — State & Memory",
        workshop="Taller 04",
        enabled=False,
        status="future",
        description="ExecutionState efímero y MemoryStore persistente con aislamiento estricto por subject_id.",
        badge="Próximamente",
    ),
    AgentMeta(
        id="v4",
        name="Agent v4 — Planning",
        workshop="Taller 05",
        enabled=False,
        status="future",
        description="Descomposición en grafos DAG, ejecutores tipados (TOOL, RUNTIME, MODEL) y replanning.",
        badge="Próximamente",
    ),
    AgentMeta(
        id="v5",
        name="Agent v5 — Guardrails & HITL",
        workshop="Taller 06",
        enabled=False,
        status="future",
        description="Policy gates (ALLOW, REQUIRE, BLOCK), ActionProposal SHA-256 y compuerta humana.",
        badge="Próximamente",
    ),
    AgentMeta(
        id="v6",
        name="Agent v6 — Observability & Eval",
        workshop="Taller 07",
        enabled=False,
        status="future",
        description="Tracing estructurado con sequence_no monotónico, minimización de datos y dataset golden.",
        badge="Próximamente",
    ),
]

PERSONAS_CATALOG: List[PersonaInfo] = [
    PersonaInfo(
        username="usr_carlos",
        full_name="Carlos Mario Restrepo",
        role="USER",
        description="Usuario solicitante interno. Crea y consulta sus tickets.",
        is_lab_simulation=True,
    ),
    PersonaInfo(
        username="usr_laura",
        full_name="Laura Marcela Gomez",
        role="USER",
        description="Usuaria solicitante de operaciones. Reporta incidentes de plataforma.",
        is_lab_simulation=True,
    ),
    PersonaInfo(
        username="soporte_tecnico",
        full_name="Andres Felipe Soporte",
        role="AGENT",
        description="Técnico de soporte de nivel 1. Asigna y resuelve tickets operativos.",
        is_lab_simulation=True,
    ),
    PersonaInfo(
        username="agente_redes",
        full_name="Diana Patricia Redes",
        role="AGENT",
        description="Especialista de conectividad e infraestructura.",
        is_lab_simulation=True,
    ),
    PersonaInfo(
        username="supervisor_juan",
        full_name="Juan Guillermo Supervisor",
        role="SUPERVISOR",
        description="Supervisor de soporte. Autoriza cambios críticos y cierre de tickets de alta severidad.",
        is_lab_simulation=True,
    ),
    PersonaInfo(
        username="admin_sistema",
        full_name="Administrador de Sistemas",
        role="ADMIN",
        description="Administrador integral de plataforma y políticas.",
        is_lab_simulation=True,
    ),
]


@router.get("/agents", response_model=List[AgentMeta])
def list_agents() -> List[AgentMeta]:
    return AGENTS_CATALOG


@router.get("/personas", response_model=List[PersonaInfo])
def list_personas() -> List[PersonaInfo]:
    return PERSONAS_CATALOG
