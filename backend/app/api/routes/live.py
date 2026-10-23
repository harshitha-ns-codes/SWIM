from fastapi import APIRouter, Request

from app.models.api import (
    AutoRunRequest,
    CurrentSimulationResponse,
    EventsResponse,
    HelperRequest,
    JoinRequest,
    LiveActionResponse,
    LiveSettingsRequest,
    NodeActionRequest,
    PeriodRequest,
    ProbeRequest,
    SnapshotResponse,
    StartLiveRequest,
)

router = APIRouter()


@router.post("/live/start", response_model=LiveActionResponse)
async def start_live(request: Request, body: StartLiveRequest | None = None) -> LiveActionResponse:
    payload = body or StartLiveRequest()
    cluster = await request.app.state.sessions.start_live(
        member_count=payload.member_count,
        k_helpers=payload.k_helpers,
        enable_udp=payload.enable_udp,
        animation_ms=payload.animation_ms,
    )
    return LiveActionResponse(
        session_id=cluster.session_id,
        snapshot=cluster.snapshot(),
        events=cluster.events,
    )


@router.get("/live/current", response_model=CurrentSimulationResponse)
def current_live(request: Request) -> CurrentSimulationResponse:
    cluster = request.app.state.sessions.live()
    if cluster is None:
        return CurrentSimulationResponse(
            session_id=None,
            snapshot=None,
            events=[],
            message="No live cluster. Start one to probe members with SWIM.",
        )
    return CurrentSimulationResponse(
        session_id=cluster.session_id,
        snapshot=cluster.snapshot(),
        events=cluster.events,
        message=None,
    )


@router.get("/live/{session_id}/snapshot", response_model=SnapshotResponse)
def live_snapshot(session_id: str, request: Request) -> SnapshotResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    return SnapshotResponse(snapshot=cluster.snapshot())


@router.get("/live/{session_id}/events", response_model=EventsResponse)
def live_events(session_id: str, request: Request) -> EventsResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    return EventsResponse(session_id=cluster.session_id, events=cluster.events)


@router.post("/live/{session_id}/probe", response_model=LiveActionResponse)
async def live_probe(session_id: str, body: ProbeRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.probe(
        body.source_id,
        body.target_id,
        path=body.path,
        helper_ids=body.helper_ids,
        ack_timeout_ms=body.ack_timeout_ms,
        suspicion_timeout_ms=body.suspicion_timeout_ms,
    )
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/helpers", response_model=LiveActionResponse)
async def live_helpers(session_id: str, body: HelperRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.continue_with_helpers(
        body.helper_ids,
        suspicion_timeout_ms=body.suspicion_timeout_ms,
    )
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/crash", response_model=LiveActionResponse)
async def live_crash(session_id: str, body: NodeActionRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.crash(body.node_id)
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/isolate", response_model=LiveActionResponse)
async def live_isolate(session_id: str, body: NodeActionRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.isolate(body.node_id)
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/freeze", response_model=LiveActionResponse)
async def live_freeze(session_id: str, body: NodeActionRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.freeze(body.node_id)
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/settings", response_model=LiveActionResponse)
def live_settings(session_id: str, body: LiveSettingsRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = cluster.configure(
        k_helpers=body.k_helpers,
        loss=body.loss,
        delay_ms=body.delay_ms,
        drop_next=body.drop_next,
        drop_from=None,
    )
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/drop", response_model=LiveActionResponse)
def live_drop(session_id: str, body: NodeActionRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = cluster.configure(drop_next=True, drop_from=body.node_id)
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/period", response_model=LiveActionResponse)
async def live_period(session_id: str, request: Request, body: PeriodRequest | None = None) -> LiveActionResponse:
    payload = body or PeriodRequest()
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.run_one_period(
        probe_mode=payload.probe_mode,
        ack_timeout_ms=payload.ack_timeout_ms,
        suspicion_timeout_ms=payload.suspicion_timeout_ms,
    )
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/auto-run", response_model=LiveActionResponse)
async def live_auto_run(session_id: str, body: AutoRunRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.set_auto_run(
        enabled=body.enabled,
        probe_mode=body.probe_mode,
        ack_timeout_ms=body.ack_timeout_ms,
        suspicion_timeout_ms=body.suspicion_timeout_ms,
    )
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/join", response_model=LiveActionResponse)
async def live_join(session_id: str, request: Request, body: JoinRequest | None = None) -> LiveActionResponse:
    payload = body or JoinRequest()
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.join(contact_id=payload.contact_id)
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)


@router.post("/live/{session_id}/leave", response_model=LiveActionResponse)
async def live_leave(session_id: str, body: NodeActionRequest, request: Request) -> LiveActionResponse:
    cluster = request.app.state.sessions.get_live(session_id)
    snapshot = await cluster.leave(body.node_id)
    return LiveActionResponse(session_id=cluster.session_id, snapshot=snapshot, events=cluster.events)
