from fastapi import APIRouter, Request

from app.models.api import (
    CurrentSimulationResponse,
    EventsResponse,
    ScenarioListResponse,
    SnapshotResponse,
    StartScenarioResponse,
)
from app.simulation.capabilities import ENGINE_CAPABILITIES
from app.simulation.scenarios import list_scenarios

router = APIRouter()


@router.get("/simulation/scenarios", response_model=ScenarioListResponse)
def scenarios() -> ScenarioListResponse:
    return ScenarioListResponse(
        scenarios=list_scenarios(),
        capabilities=dict(ENGINE_CAPABILITIES),
    )


@router.get("/simulation/current", response_model=CurrentSimulationResponse)
def current_simulation(request: Request) -> CurrentSimulationResponse:
    session = request.app.state.sessions.current()
    if session is None:
        return CurrentSimulationResponse(
            session_id=None,
            snapshot=None,
            events=[],
            message=(
                "No active simulation session. Start a guided scenario to create a "
                "server-owned in-memory demo cluster."
            ),
        )
    return CurrentSimulationResponse(
        session_id=session.session_id,
        snapshot=session.snapshot(),
        events=session.events,
        message=None,
    )


@router.post(
    "/simulation/scenarios/{scenario_id}/start",
    response_model=StartScenarioResponse,
)
def start_scenario(scenario_id: str, request: Request) -> StartScenarioResponse:
    session = request.app.state.sessions.start_scenario(scenario_id)
    return StartScenarioResponse(
        session_id=session.session_id,
        snapshot=session.snapshot(),
        events=session.events,
        limitations=list(session.limitations),
    )


@router.get("/simulation/{session_id}/snapshot", response_model=SnapshotResponse)
def get_snapshot(session_id: str, request: Request) -> SnapshotResponse:
    session = request.app.state.sessions.get(session_id)
    return SnapshotResponse(snapshot=session.snapshot())


@router.get("/simulation/{session_id}/events", response_model=EventsResponse)
def get_events(session_id: str, request: Request) -> EventsResponse:
    session = request.app.state.sessions.get(session_id)
    return EventsResponse(session_id=session.session_id, events=session.events)

