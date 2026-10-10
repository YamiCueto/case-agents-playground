import json
from typing import Any, Dict, List, Optional
from src.agents.common.contracts import ModelProvider, ModelResponse, ToolCall


class MockModelProvider(ModelProvider):
    def __init__(self, simulation_rules: Optional[Dict[str, Any]] = None) -> None:
        self.rules: Dict[str, Any] = simulation_rules or {}

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        last_message = messages[-1]

        if last_message.get("role") == "tool":
            tool_name = last_message.get("name", "herramienta")
            result_data = last_message.get("content", "{}")
            synthesis = f"Según la observación recibida de {tool_name}: {result_data}. Información procesada por la aplicación."
            return ModelResponse(content=synthesis, tool_calls=[])

        user_text = str(last_message.get("content", "")).lower()

        for trigger_keyword, rule in self.rules.items():
            if trigger_keyword.lower() in user_text:
                call = ToolCall(
                    id=rule.get("id", "call_mock_001"),
                    name=rule["name"],
                    arguments=rule.get("arguments", {}),
                )
                return ModelResponse(content=None, tool_calls=[call])

        fallback_text = (
            "He analizado tu consulta. Para preguntas conceptuales o generales de este dominio, "
            "no se requiere invocar herramientas externas y respondo directamente."
        )
        return ModelResponse(content=fallback_text, tool_calls=[])


class OpenAICompatibleProvider(ModelProvider):
    def __init__(
        self,
        api_key: str = "local-llama-cpp",
        base_url: str = "http://127.0.0.1:8080/v1",
        model: Optional[str] = None,
        temperature: float = 0.0,
    ) -> None:
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.temperature = temperature
        self._model = model

    @property
    def model_name(self) -> str:
        if self._model:
            return self._model
        try:
            models_list = self.client.models.list()
            if models_list.data:
                self._model = models_list.data[0].id
                return self._model
        except Exception:
            pass
        return "Qwen3.5-4B-UD-Q5_K_XL"

    def generate(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        timeout: Optional[float] = None,
    ) -> ModelResponse:
        formatted_tools = (
            [{"type": "function", "function": tool} for tool in tools] if tools else None
        )

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            tools=formatted_tools,
            temperature=self.temperature,
            timeout=timeout,
        )

        choice = response.choices[0]
        message = choice.message

        tool_calls: List[ToolCall] = []
        if message.tool_calls:
            for tc in message.tool_calls:
                arguments_dict: Dict[str, Any] = {}
                try:
                    arguments_dict = json.loads(tc.function.arguments)
                except Exception:
                    arguments_dict = {"raw_arguments": tc.function.arguments}

                tool_calls.append(
                    ToolCall(
                        id=tc.id,
                        name=tc.function.name,
                        arguments=arguments_dict,
                    )
                )

        return ModelResponse(content=message.content, tool_calls=tool_calls)
