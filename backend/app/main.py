from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.health import router as health_router
from app.api.routes.live import router as live_router
from app.api.routes.simulation import router as simulation_router
from app.api.routes.websocket import router as websocket_router
from app.config import get_settings
from app.errors import ApiError
from app.services.session_manager import SessionManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    live = app.state.sessions.live()
    if live is not None:
        await live.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="SWIM Protocol Simulator API",
        version=settings.api_version,
        description=(
            "FastAPI backend for the SWIM membership-protocol simulator. "
            "Simulation state is in-memory until experiment persistence is added."
        ),
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.sessions = SessionManager()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ApiError)
    async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
        payload = {
            "error": exc.error,
            "detail": exc.detail,
            "code": exc.code,
            **exc.extra,
        }
        if exc.extra:
            payload["extra"] = exc.extra
        return JSONResponse(status_code=exc.status_code, content=payload)

    @app.get("/")
    def root() -> dict[str, str]:
        return {
            "name": "SWIM Protocol Simulator API",
            "health": "/api/v1/health",
            "docs": "/docs",
        }

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(simulation_router, prefix="/api/v1")
    app.include_router(live_router, prefix="/api/v1")
    app.include_router(websocket_router)
    return app


app = create_app()
