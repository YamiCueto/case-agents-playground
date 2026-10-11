from typing import Any, Dict, List, Optional, Tuple
from src.domain.memory.entities import ConversationTurn, DecisionRecord, PendingDecisionRecord
from src.domain.memory.identity import SimulatedIdentity
from src.domain.memory.policy import MemoryPolicy
from src.domain.memory.token_budget import TokenBudgetManager

SYSTEM_PROMPT_V3_BASE = (
    "Eres el Asistente Experto en Gestión de Incidentes y Soporte Técnico (Agent v3: State & Memory) "
    "en el Agent Engineering Playground. Operas bajo un Agent Loop iterativo respaldado por memoria persistente en MySQL.\n\n"
    "DIRECTIVA FUNDAMENTAL DE FRESCURA OPERATIVA:\n"
    "La memoria conversacional y el historial de turnos previos sirven EXCLUSIVAMENTE para resolver correferencias "
    "y referencias contextuales (por ejemplo, determinar a qué código de ticket TICK-XXXX se refiere el usuario cuando "
    "pregunta '¿quién lo tiene asignado?' o '¿sigue abierto?').\n"
    "Para cualquier afirmación sobre el estado actual, asignatario, prioridad, fecha de vencimiento o comentarios "
    "de un ticket, DEBES invocar la herramienta correspondiente (get_ticket_by_id, list_tickets, identify_overdue_tickets) "
    "para consultar la base de datos MySQL en tiempo real. NUNCA asumas que los datos operativos de turnos anteriores permanecen inalterados.\n\n"
    "REGLAS DE ACTUACIÓN:\n"
    "1. Inspección y Dependencia: Si la resolución exige varios pasos, ejecuta las herramientas necesarias, analiza la evidencia y sintetiza la respuesta.\n"
    "2. Condición de Parada: Cuando poseas los datos necesarios, emite la respuesta final fundamentada en lenguaje natural en español sin invocar más herramientas.\n"
    "3. Fidelidad a Datos Vivos: Toda información operativa de tickets debe originarse en la observación de herramientas.\n"
    "4. Respeto a Preferencias: Aplica fielmente las preferencias activas del operador declaradas en su perfil cognitivo."
)


class ContextBuilder:
    """
    Constructor de Contexto Cognitivo para Agent v3.

    Responsabilidades:
    1. Ensamblar el system prompt integrando la Directiva de Frescura Operativa, identidad del operador y decisiones activas.
    2. Recalcular y distribuir el presupuesto de tokens mediante TokenBudgetManager.
    3. Formatear el historial conversacional previo seleccionando turnos mediante ventana deslizante basada en tokens reales.
    4. Prohibir la inyección de observaciones de herramientas pasadas de turnos anteriores (evita saturación y confusión).
    5. Asegurar sanitización estricta de cualquier secreto antes de la inferencia.
    """

    def __init__(self, token_budget_manager: Optional[TokenBudgetManager] = None) -> None:
        self.budget_manager = token_budget_manager or TokenBudgetManager()

    def build_initial_messages(
        self,
        query: str,
        identity: SimulatedIdentity,
        active_decisions: Optional[List[DecisionRecord]] = None,
        recent_turns: Optional[List[ConversationTurn]] = None,
        pending_task: Optional[PendingDecisionRecord] = None,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        # 1. Validar consulta de usuario (falla explícitamente si excede presupuesto)
        query_tokens = self.budget_manager.validate_user_query(query)
        clean_query = MemoryPolicy.sanitize_text(query)

        # 2. Construir sección de contexto del sistema
        system_sections: List[str] = [SYSTEM_PROMPT_V3_BASE]

        # Inyectar Identidad del Operador
        operator_info = (
            f"\n\nIDENTIDAD DEL OPERADOR AUTORIZADO (LABORATORIO):\n"
            f"- Usuario: {identity.username}\n"
            f"- Nombre Completo: {identity.full_name}\n"
            f"- Rol: {identity.role.value}"
        )
        system_sections.append(operator_info)

        # Inyectar Preferencias y Decisiones Activas
        decisions_tokens = 0
        decisions_list = active_decisions or []
        if decisions_list:
            decisions_text = "\n\nPREFERENCIAS Y DECISIONES ACTIVAS DEL USUARIO (APLICAR EN RESPUESTAS):\n"
            for dec in decisions_list:
                clean_val = MemoryPolicy.sanitize_text(str(dec.value))
                clean_rat = MemoryPolicy.sanitize_text(str(dec.rationale))
                decisions_text += f"- [{dec.scope.value.upper()}] {dec.key}: {clean_val} (Motivo: {clean_rat})\n"
            system_sections.append(decisions_text)
            decisions_tokens = self.budget_manager.estimate_tokens(decisions_text)

        # Inyectar Tarea Pendiente Activa (si existe)
        if pending_task is not None:
            task_info = (
                f"\n\nTAREA PENDIENTE EN ESPERA DE RESOLUCIÓN:\n"
                f"- Identificador: {pending_task.decision_id}\n"
                f"- Pregunta al Operador: {pending_task.question}\n"
                f"- Opciones disponibles: {pending_task.options}\n"
                f"- Herramienta objetivo: {pending_task.target_tool_name}\n"
                f"Si el usuario responde seleccionando una opción o proveyendo el valor faltante, "
                f"notifica la reanudación de la tarea."
            )
            system_sections.append(task_info)

        full_system_prompt = "".join(system_sections)
        system_prompt_tokens = self.budget_manager.estimate_tokens(full_system_prompt)

        # 3. Calcular presupuesto disponible para historial conversacional
        available_history_budget = self.budget_manager.calculate_available_history_budget(
            active_memory_tokens=decisions_tokens,
            user_query_tokens=query_tokens,
        )

        # 4. Seleccionar turnos del historial que quepan en el presupuesto
        turns_to_include = self.budget_manager.select_history_turns(
            turns=recent_turns or [],
            available_budget=available_history_budget,
        )

        history_tokens = 0
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": full_system_prompt}
        ]

        # Regla de oro de higiene: solo inyectar turnos limpios (user, assistant), NUNCA tool payloads de turnos pasados
        for turn in turns_to_include:
            turn_user = MemoryPolicy.sanitize_text(turn.user_query)
            turn_agent = MemoryPolicy.sanitize_text(turn.agent_response)
            messages.append({"role": "user", "content": turn_user})
            messages.append({"role": "assistant", "content": turn_agent})
            history_tokens += (
                self.budget_manager.estimate_tokens(turn_user)
                + self.budget_manager.estimate_tokens(turn_agent)
            )

        # 5. Añadir la consulta actual del usuario
        messages.append({"role": "user", "content": clean_query})

        stats = {
            "query_tokens": query_tokens,
            "system_prompt_tokens": system_prompt_tokens,
            "decisions_tokens": decisions_tokens,
            "decisions_count": len(decisions_list),
            "available_history_budget": available_history_budget,
            "history_tokens": history_tokens,
            "history_turns_count": len(turns_to_include),
            "total_initial_tokens": system_prompt_tokens + history_tokens + query_tokens,
        }

        return messages, stats
