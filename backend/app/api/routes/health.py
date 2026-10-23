from fastapi import APIRouter, Request

from app.models.api import HealthResponse
from app.simulation.capabilities import ENGINE_CAPABILITIES

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings = request.app.state.settings
    return HealthResponse(
        status="ok",
        api_version=settings.api_version,
        persistence="in-memory",
        persistence_note=(
            "Simulation sessions live in process memory only. "
            "Restarting the backend resets all active sessions until experiment persistence is added."
        ),
        capabilities=dict(ENGINE_CAPABILITIES),
    )
