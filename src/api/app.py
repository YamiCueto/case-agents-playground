from contextlib import asynccontextmanager
from typing import AsyncGenerator
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from src.infrastructure.config import get_settings
from src.infrastructure.database.connection import get_app_engine
from src.api.schemas import HealthResponse
from src.api.routes.agents import router as agents_router
from src.api.routes.tickets import router as tickets_router
from src.api.routes.chat import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Agent Engineering Playground API",
        version="1.0.0",
        description="Adaptador HTTP y SSE para observabilidad agéntica en tiempo real",
        lifespan=lifespan,
    )

    settings = get_settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(agents_router)
    app.include_router(tickets_router)
    app.include_router(chat_router)

    @app.get("/api/health", response_model=HealthResponse)
    async def health_check() -> HealthResponse:
        current_settings = get_settings()

        db_status = "error"
        try:
            engine = get_app_engine()
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception:
            db_status = "unreachable"

        llm_status = "error"
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(f"{current_settings.llm_base_url}/models")
                if res.status_code == 200:
                    llm_status = "connected"
                else:
                    llm_status = f"http_{res.status_code}"
        except Exception:
            llm_status = "unreachable"

        overall_status = "healthy" if db_status == "connected" and llm_status == "connected" else "degraded"

        return HealthResponse(
            status=overall_status,
            database=db_status,
            llm_server=llm_status,
        )

    return app


app = create_app()
