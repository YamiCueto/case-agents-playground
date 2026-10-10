from typing import AsyncGenerator, Callable, Optional
from sqlalchemy.orm import Session
from src.agents.common.contracts import ModelProvider
from src.agents.common.providers import OpenAICompatibleProvider
from src.agents.tools.ticket_tools import execute_tool_call, validate_tool_arguments, TOOLS_SCHEMAS
from src.agents.v2_agent_loop.engine import AgentLoopEngine
from src.agents.v2_agent_loop.idempotency import IdempotencyRegistry
from src.agents.v2_agent_loop.inference import SYSTEM_PROMPT_V2
from src.agents.v2_agent_loop.state import AgentExecutionState
from src.api.schemas import ChatRequest, StreamEvent


class AgentLoop:
    def __init__(
        self,
        provider: ModelProvider,
        session: Optional[Session] = None,
        session_factory: Optional[Callable[[], Session]] = None,
        idempotency_registry: Optional[IdempotencyRegistry] = None,
    ) -> None:
        self.engine = AgentLoopEngine(
            provider=provider,
            session=session,
            session_factory=session_factory,
            idempotency_registry=idempotency_registry,
        )
        self.provider = provider
        self.session = session
        self.session_factory = self.engine.session_factory
        self.idempotency = self.engine.idempotency
        self.last_state: Optional[AgentExecutionState] = None

    def run(
        self,
        query: str,
        operator_username: str = "usr_carlos",
        max_iterations: int = 5,
        global_timeout_seconds: float = 60.0,
        inference_timeout_seconds: float = 30.0,
        tool_timeout_seconds: float = 15.0,
    ) -> AgentExecutionState:
        state = self.engine.init_state(
            query=query,
            operator_username=operator_username,
            max_iterations=max_iterations,
            global_timeout_seconds=global_timeout_seconds,
            inference_timeout_seconds=inference_timeout_seconds,
            tool_timeout_seconds=tool_timeout_seconds,
        )
        self.last_state = state
        return self.engine.execute_sync(state)

    async def run_stream(
        self,
        query: str,
        operator_username: str = "usr_carlos",
        max_iterations: int = 5,
        global_timeout_seconds: float = 60.0,
        inference_timeout_seconds: float = 30.0,
        tool_timeout_seconds: float = 15.0,
    ) -> AsyncGenerator[StreamEvent, None]:
        state = self.engine.init_state(
            query=query,
            operator_username=operator_username,
            max_iterations=max_iterations,
            global_timeout_seconds=global_timeout_seconds,
            inference_timeout_seconds=inference_timeout_seconds,
            tool_timeout_seconds=tool_timeout_seconds,
        )
        self.last_state = state
        async for evt in self.engine.execute_stream(state):
            yield evt


def run_agent_v2(
    user_query: str,
    provider: Optional[ModelProvider] = None,
    session: Optional[Session] = None,
    operator_username: str = "usr_carlos",
    max_iterations: int = 5,
    global_timeout_seconds: float = 60.0,
    inference_timeout_seconds: float = 30.0,
    tool_timeout_seconds: float = 15.0,
) -> str:
    if provider is None:
        provider = OpenAICompatibleProvider()

    from src.infrastructure.database.connection import get_app_session_factory

    owns_session = False
    if session is None:
        session_factory = get_app_session_factory()
        session = session_factory()
        owns_session = True

    try:
        loop = AgentLoop(provider=provider, session=session)
        state = loop.run(
            query=user_query,
            operator_username=operator_username,
            max_iterations=max_iterations,
            global_timeout_seconds=global_timeout_seconds,
            inference_timeout_seconds=inference_timeout_seconds,
            tool_timeout_seconds=tool_timeout_seconds,
        )
        if state.final_answer:
            return state.final_answer
        return state.error_message or "Ejecución finalizada sin respuesta."
    finally:
        if owns_session and session is not None:
            try:
                session.close()
            except Exception:
                pass


async def run_agent_v2_stream(
    request: ChatRequest,
    provider: Optional[ModelProvider] = None,
    session: Optional[Session] = None,
    idempotency_registry: Optional[IdempotencyRegistry] = None,
    max_iterations: int = 5,
    global_timeout_seconds: float = 60.0,
    inference_timeout_seconds: float = 30.0,
    tool_timeout_seconds: float = 15.0,
) -> AsyncGenerator[StreamEvent, None]:
    if provider is None:
        provider = OpenAICompatibleProvider()

    from src.infrastructure.database.connection import get_app_session_factory

    owns_session = False
    if session is None:
        session_factory = get_app_session_factory()
        session = session_factory()
        owns_session = True

    loop = AgentLoop(
        provider=provider,
        session=session,
        idempotency_registry=idempotency_registry,
    )
    try:
        async for evt in loop.run_stream(
            query=request.query,
            operator_username=request.user_persona or "usr_carlos",
            max_iterations=max_iterations,
            global_timeout_seconds=global_timeout_seconds,
            inference_timeout_seconds=inference_timeout_seconds,
            tool_timeout_seconds=tool_timeout_seconds,
        ):
            yield evt
    finally:
        if owns_session and session is not None:
            try:
                session.close()
            except Exception:
                pass
