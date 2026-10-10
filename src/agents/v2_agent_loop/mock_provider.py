import json
import time
from typing import Any, Dict, List, Optional
from src.agents.common.contracts import ModelProvider, ModelResponse, ToolCall


class MockModelProviderV2(ModelProvider):
    def __init__(
        self,
        simulation_mode: str = "dynamic_support",
        custom_rules: Optional[Dict[str, Any]] = None,
        force_repetitive_calls: bool = False,
        force_infinite_tools: bool = False,
        simulate_hanging_inference_seconds: Optional[float] = None,
    ) -> None:
        self.simulation_mode = simulation_mode
        self.custom_rules = custom_rules or {}
        self.force_repetitive_calls = force_repetitive_calls
        self.force_infinite_tools = force_infinite_tools
        self.simulate_hanging_inference_seconds = simulate_hanging_inference_seconds

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        if self.simulate_hanging_inference_seconds is not None:
            time.sleep(self.simulate_hanging_inference_seconds)

        if self.force_repetitive_calls:
            call = ToolCall(
                id="call_mock_stagnant",
                name="list_tickets",
                arguments={"limit": 5, "status": "OPEN"},
            )
            return ModelResponse(content=None, tool_calls=[call])

        if self.force_infinite_tools:
            counter = len([m for m in messages if m.get("role") == "tool"]) + 1
            call = ToolCall(
                id=f"call_infinite_{counter}",
                name="list_tickets",
                arguments={"limit": counter},
            )
            return ModelResponse(content=None, tool_calls=[call])

        user_msgs = [m for m in messages if m.get("role") == "user"]
        user_query = str(user_msgs[-1]["content"]) if user_msgs else ""
        lower_query = user_query.lower()

        tool_observations: List[Dict[str, Any]] = []
        for m in messages:
            if m.get("role") == "tool":
                raw_c = m.get("content", "{}")
                try:
                    tool_observations.append(json.loads(raw_c))
                except Exception:
                    tool_observations.append({"raw": raw_c})

        if "reglas" in self.custom_rules:
            rule_match = self.custom_rules["reglas"].get(lower_query)
            if rule_match:
                return rule_match(tool_observations)

        conceptual_triggers = [
            "procedimiento",
            "procedimientos",
            "conceptual",
            "qué es",
            "que es",
            "cómo funciona",
            "como funciona",
            "guía",
            "guia",
            "definición",
            "definicion",
            "política",
            "politica",
        ]
        if any(trig in lower_query for trig in conceptual_triggers):
            return ModelResponse(
                content="Consulta conceptual procesada directamente por el asistente sin invocar herramientas externas.",
                tool_calls=[],
            )

        if not any(k in lower_query for k in ["ticket", "vencid", "sla", "crea", "incidente", "estado"]):
            return ModelResponse(
                content="Consulta conceptual procesada directamente por el asistente sin invocar herramientas externas.",
                tool_calls=[],
            )

        if len(tool_observations) == 0:
            if "vencid" in lower_query or "sla" in lower_query:
                return ModelResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(
                            id="call_dyn_overdue_01",
                            name="identify_overdue_tickets",
                            arguments={},
                        )
                    ],
                )
            elif "crea" in lower_query:
                return ModelResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(
                            id="call_dyn_create_01",
                            name="create_ticket",
                            arguments={
                                "title": "Fallo en enlace WAN",
                                "description": "Caída del enlace principal hacia sucursal",
                                "priority": "HIGH",
                                "category_code": "NETWORK",
                            },
                        )
                    ],
                )
            else:
                target_code = None
                for word in user_query.split():
                    clean_word = word.strip(".,;:()").upper()
                    if clean_word.startswith("TICK-") and len(clean_word) > 5:
                        target_code = clean_word
                        break

                if target_code is not None:
                    return ModelResponse(
                        content=None,
                        tool_calls=[
                            ToolCall(
                                id="call_dyn_single_01",
                                name="get_ticket_by_id",
                                arguments={"ticket_code": target_code},
                            )
                        ],
                    )
                else:
                    return ModelResponse(
                        content="Por favor especifica el código alfanumérico del ticket que deseas consultar (ejemplo: TICK-XXXX).",
                        tool_calls=[],
                    )

        if len(tool_observations) == 1:
            first_obs = tool_observations[0]

            if first_obs.get("status") == "error":
                err_msg = first_obs.get("message", "Error desconocido reportado por la herramienta")
                return ModelResponse(
                    content=f"No fue posible completar la consulta debido al siguiente error: {err_msg}.",
                    tool_calls=[],
                )

            data_payload = first_obs.get("data")
            if isinstance(data_payload, list) and len(data_payload) == 0:
                return ModelResponse(
                    content="Tras consultar el sistema, se constató que no existen tickets que cumplan con los criterios indicados.",
                    tool_calls=[],
                )

            if "primer ticket" in lower_query or "detalle del primer" in lower_query or "detalle completo" in lower_query:
                if isinstance(data_payload, list) and len(data_payload) > 0:
                    first_ticket = data_payload[0]
                    dynamic_ticket_code = first_ticket.get("code")
                    if dynamic_ticket_code:
                        return ModelResponse(
                            content=None,
                            tool_calls=[
                                ToolCall(
                                    id="call_dyn_detail_02",
                                    name="get_ticket_by_id",
                                    arguments={"ticket_code": str(dynamic_ticket_code)},
                                )
                            ],
                        )
                    else:
                        return ModelResponse(
                            content="La lista obtenida no contiene un código identificador de ticket válido para profundizar.",
                            tool_calls=[],
                        )

            if first_obs.get("status") == "success":
                data = first_obs.get("data")
                if isinstance(data, dict):
                    code = data.get("code", "consultado")
                    st = data.get("status", "N/A")
                    title = data.get("title", "")
                    return ModelResponse(
                        content=f"El ticket {code} se encuentra en estado {st}. Detalle del incidente: {title}.",
                        tool_calls=[],
                    )
                elif isinstance(data, list):
                    return ModelResponse(
                        content=f"Se identificaron {len(data)} tickets en el sistema bajo los criterios solicitados.",
                        tool_calls=[],
                    )

        if len(tool_observations) >= 2:
            obs1 = tool_observations[0]
            obs2 = tool_observations[1]

            if obs2.get("status") == "error":
                err_msg = obs2.get("message", "Fallo al consultar detalle")
                return ModelResponse(
                    content=f"Se obtuvo la lista inicial pero falló la consulta de detalle: {err_msg}.",
                    tool_calls=[],
                )

            data2 = obs2.get("data", {})
            if isinstance(data2, dict):
                code = data2.get("code", "consultado")
                creator = data2.get("creator_username", "el solicitante")
                desc = data2.get("description", "sin descripción")
                title = data2.get("title", "")
                return ModelResponse(
                    content=(
                        f"Tras revisar los registros, el primer incidente vencido es {code} ('{title}'), "
                        f"reportado por {creator}. Causa técnica: {desc}."
                    ),
                    tool_calls=[],
                )

        return ModelResponse(
            content="Ejecución concluida con la información observada.",
            tool_calls=[],
        )
