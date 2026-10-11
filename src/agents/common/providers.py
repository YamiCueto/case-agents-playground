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
        self.base_url = base_url
        self._cached_context_meta: Optional[Dict[str, Optional[int]]] = None

    def get_context_metadata(self, force_refresh: bool = False, timeout: float = 1.5) -> Dict[str, Optional[int]]:
        """
        Consulta de forma dinámica y no bloqueante los límites de contexto de llama-server (/props y /models).
        Devuelve server_context_limit y model_context_capacity, o None si el servidor no está disponible.
        """
        if self._cached_context_meta is not None and not force_refresh:
            return self._cached_context_meta

        import json
        import urllib.request

        res: Dict[str, Optional[int]] = {
            "server_context_limit": None,
            "model_context_capacity": None,
        }

        try:
            root_url = self.base_url.rstrip("/")
            if root_url.endswith("/v1"):
                root_url = root_url[:-3]

            # 1. Consultar /props para n_ctx efectivo del servidor
            try:
                req = urllib.request.Request(f"{root_url}/props", headers={"User-Agent": "AEP-Provider"})
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        n_ctx = data.get("default_generation_settings", {}).get("n_ctx")
                        if isinstance(n_ctx, int) and n_ctx > 0:
                            res["server_context_limit"] = n_ctx
            except Exception:
                pass

            # 2. Consultar /models para metadatos del modelo GGUF (n_ctx_train)
            try:
                req = urllib.request.Request(f"{root_url}/models", headers={"User-Agent": "AEP-Provider"})
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        data_list = data.get("data", [])
                        if data_list and isinstance(data_list, list):
                            meta = data_list[0].get("meta", {})
                            n_train = meta.get("n_ctx_train")
                            if isinstance(n_train, int) and n_train > 0:
                                res["model_context_capacity"] = n_train
                            if not res["server_context_limit"]:
                                srv_n_ctx = meta.get("n_ctx")
                                if isinstance(srv_n_ctx, int) and srv_n_ctx > 0:
                                    res["server_context_limit"] = srv_n_ctx
            except Exception:
                pass

        except Exception:
            pass

        self._cached_context_meta = res
        return res

    @property
    def server_context_limit(self) -> Optional[int]:
        meta = self.get_context_metadata()
        return meta.get("server_context_limit")

    @property
    def model_context_capacity(self) -> Optional[int]:
        meta = self.get_context_metadata()
        return meta.get("model_context_capacity")

    @property
    def context_window(self) -> int:
        return self.server_context_limit or 4096

    @property
    def n_ctx(self) -> int:
        return self.server_context_limit or 4096

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
        max_tokens: Optional[int] = None,
    ) -> ModelResponse:
        formatted_tools = (
            [{"type": "function", "function": tool} for tool in tools] if tools else None
        )

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            tools=formatted_tools,
            temperature=self.temperature,
            max_tokens=max_tokens or 1024,
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
