import json
import math
from typing import Any, Dict, List, Optional
from src.domain.exceptions import QueryExceedsTokenBudgetError
from src.domain.memory.entities import ConversationTurn


class TokenBudgetManager:
    """
    Gestor Integral de Presupuesto de Tokens para el Agent Loop y la Memoria.

    Responsabilidades:
    1. Respetar el límite de contexto del modelo (configurable, por defecto 4.096 para Qwen 3.5 4B).
    2. Distribuir reservas para: salida del LLM, schemas de herramientas, system prompt,
       margen de iteraciones y contexto inicial.
    3. Validar la consulta del usuario sin truncamiento silencioso (lanzar error explícito si excede).
    4. Truncar estructuradamente observaciones de herramientas voluminosas para proteger el bucle.
    5. Gestionar la ventana deslizante del historial conversacional según el presupuesto remanente.
    """

    # Caracteres promedio por token para heurística determinista conservadora
    CHARS_PER_TOKEN = 3.8

    def __init__(
        self,
        total_context_limit: int = 4096,
        output_reserve: int = 800,
        tools_schemas_reserve: int = 600,
        system_prompt_reserve: int = 350,
        loop_margin_reserve: int = 850,
        max_active_memory_tokens: int = 400,
        max_user_query_tokens: int = 500,
        max_observation_tokens: int = 600,
    ) -> None:
        self.total_context_limit = max(1024, total_context_limit)
        self.output_reserve = output_reserve
        self.tools_schemas_reserve = tools_schemas_reserve
        self.system_prompt_reserve = system_prompt_reserve
        self.loop_margin_reserve = loop_margin_reserve
        self.max_active_memory_tokens = max_active_memory_tokens
        self.max_user_query_tokens = max_user_query_tokens
        self.max_observation_tokens = max_observation_tokens

    @classmethod
    def from_provider_config(
        cls,
        provider: Any = None,
        default_limit: int = 4096,
        **kwargs: Any,
    ) -> "TokenBudgetManager":
        """
        Instancia el gestor inspeccionando la configuración real del proveedor si está disponible.
        """
        limit = default_limit
        if provider is not None:
            # Inspeccionar atributos comunes en proveedores OpenAI-compatible o locales
            for attr in ("max_context_tokens", "context_window", "n_ctx", "context_length"):
                val = getattr(provider, attr, None)
                if isinstance(val, int) and val > 0:
                    limit = val
                    break

        return cls(total_context_limit=limit, **kwargs)

    def estimate_tokens(self, text: Optional[str]) -> int:
        """Estima la cantidad de tokens basada en heurística conservadora."""
        if not text:
            return 0
        return math.ceil(len(str(text)) / self.CHARS_PER_TOKEN)

    def estimate_payload_tokens(self, payload: Any) -> int:
        """Estima tokens para payloads estructurados serializándolos a JSON."""
        if payload is None:
            return 0
        try:
            serialized = json.dumps(payload, ensure_ascii=False)
            return self.estimate_tokens(serialized)
        except Exception:
            return self.estimate_tokens(str(payload))

    def validate_user_query(self, query: str) -> int:
        """
        Valida que la consulta del usuario no supere el presupuesto asignado.

        REGLA DE INTEGRIDAD:
        No se trunca silenciosamente la consulta del usuario.
        Si supera el presupuesto, se levanta QueryExceedsTokenBudgetError con detalles.
        """
        estimated = self.estimate_tokens(query)
        if estimated > self.max_user_query_tokens:
            raise QueryExceedsTokenBudgetError(
                query_length=len(query),
                estimated_tokens=estimated,
                max_tokens=self.max_user_query_tokens,
            )
        return estimated

    def calculate_available_history_budget(
        self,
        active_memory_tokens: int,
        user_query_tokens: int,
    ) -> int:
        """
        Calcula cuántos tokens quedan disponibles para el historial de turnos previos.
        """
        consumed = (
            self.output_reserve
            + self.tools_schemas_reserve
            + self.system_prompt_reserve
            + self.loop_margin_reserve
            + min(active_memory_tokens, self.max_active_memory_tokens)
            + user_query_tokens
        )
        remaining = self.total_context_limit - consumed
        return max(0, remaining)

    def select_history_turns(
        self,
        turns: List[ConversationTurn],
        available_budget: int,
    ) -> List[ConversationTurn]:
        """
        Selecciona turnos conversacionales desde el más reciente hacia atrás.

        Garantías:
        - Nunca divide un turno a la mitad.
        - Preserva el orden cronológico original en la lista retornada.
        """
        if available_budget <= 0 or not turns:
            return []

        selected_reversed: List[ConversationTurn] = []
        accumulated_tokens = 0

        # Iterar desde el más reciente hacia atrás
        for turn in reversed(turns):
            turn_tokens = turn.tokens_estimate
            if turn_tokens <= 0:
                turn_tokens = self.estimate_tokens(turn.user_query) + self.estimate_tokens(turn.agent_response)

            if accumulated_tokens + turn_tokens <= available_budget:
                selected_reversed.append(turn)
                accumulated_tokens += turn_tokens
            else:
                # No cabe el turno completo; se corta aquí
                break

        # Restaurar orden cronológico
        selected_reversed.reverse()
        return selected_reversed

    def truncate_tool_observation(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Aplica truncamiento estructurado determinista si una observación de herramienta
        supera el presupuesto máximo asignado (`max_observation_tokens`).

        Garantiza que la observación mantenga las claves de esquema esenciales
        mientras reduce listas o textos largos para evitar desbordar el contexto.
        """
        obs_tokens = self.estimate_payload_tokens(observation)
        if obs_tokens <= self.max_observation_tokens:
            return observation

        truncated: Dict[str, Any] = dict(observation)
        truncated["_budget_truncated"] = True
        truncated["_original_estimated_tokens"] = obs_tokens

        # Estrategia 1: Truncamiento de listas en data o items
        for list_key in ("data", "items", "tickets", "comments", "results"):
            if list_key in truncated and isinstance(truncated[list_key], list):
                original_list = truncated[list_key]
                truncated["_total_items_before_truncation"] = len(original_list)
                # Reducir a la mitad progresivamente hasta que quepa
                reduced_list = original_list[: max(1, len(original_list) // 2)]
                truncated[list_key] = reduced_list
                truncated["_omitted_items_count"] = len(original_list) - len(reduced_list)

                if self.estimate_payload_tokens(truncated) <= self.max_observation_tokens:
                    return truncated

        # Estrategia 2: Truncamiento de campos de texto extensos
        for k, v in list(truncated.items()):
            if isinstance(v, str) and len(v) > 200:
                truncated[k] = v[:200] + "... [TRUNCADO POR PRESUPUESTO DE TOKENS]"
                if self.estimate_payload_tokens(truncated) <= self.max_observation_tokens:
                    return truncated

        return truncated
