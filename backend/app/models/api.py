from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.domain import ProtocolEvent, Snapshot


class ErrorResponse(BaseModel):
    error: str
    detail: str
    code: str
    extra: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    api_version: str
    persistence: Literal["in-memory"]
    persistence_note: str
    capabilities: dict[str, bool]


class ScenarioCardModel(BaseModel):
    id: str
    title: str
    difficulty: Literal["beginner", "intermediate", "advanced"]
    objective: str
    expected_observation: str
    required_capabilities: list[str]
    unimplemented_capabilities: list[str]


class ScenarioListResponse(BaseModel):
    scenarios: list[ScenarioCardModel]
    capabilities: dict[str, bool]


class StartScenarioResponse(BaseModel):
    session_id: str
    snapshot: Snapshot
    events: list[ProtocolEvent]
    limitations: list[str]


class CurrentSimulationResponse(BaseModel):
    session_id: str | None = None
    snapshot: Snapshot | None = None
    events: list[ProtocolEvent] = Field(default_factory=list)
    message: str | None = None


class SnapshotResponse(BaseModel):
    snapshot: Snapshot


class EventsResponse(BaseModel):
    session_id: str
    events: list[ProtocolEvent]


class StartLiveRequest(BaseModel):
    member_count: int = Field(default=8, ge=4, le=16)
    k_helpers: int = Field(default=3, ge=1, le=7)
    enable_udp: bool = True
    animation_ms: int = Field(default=280, ge=0, le=2000)


class ProbeRequest(BaseModel):
    source_id: str
    target_id: str
    path: Literal["healthy", "failure", "refute"] | None = None
    helper_ids: list[str] = Field(default_factory=list)
    ack_timeout_ms: int | None = Field(default=None, ge=50, le=15000)
    suspicion_timeout_ms: int | None = Field(default=None, ge=50, le=30000)


class AutoRunRequest(BaseModel):
    enabled: bool
    probe_mode: Literal["round_robin", "random"] | None = None
    ack_timeout_ms: int | None = Field(default=None, ge=50, le=15000)
    suspicion_timeout_ms: int | None = Field(default=None, ge=50, le=30000)


class PeriodRequest(BaseModel):
    probe_mode: Literal["round_robin", "random"] | None = None
    ack_timeout_ms: int | None = Field(default=None, ge=50, le=15000)
    suspicion_timeout_ms: int | None = Field(default=None, ge=50, le=30000)


class JoinRequest(BaseModel):
    contact_id: str | None = None


class HelperRequest(BaseModel):
    helper_ids: list[str]
    suspicion_timeout_ms: int | None = Field(default=None, ge=50, le=30000)


class NodeActionRequest(BaseModel):
    node_id: str


class LiveSettingsRequest(BaseModel):
    k_helpers: int | None = Field(default=None, ge=1, le=7)
    loss: float | None = Field(default=None, ge=0, le=1)
    delay_ms: float | None = Field(default=None, ge=0, le=2000)
    drop_next: bool = False


class LiveActionResponse(BaseModel):
    session_id: str
    snapshot: Snapshot
    events: list[ProtocolEvent] = Field(default_factory=list)


class ProtocolEventModel(ProtocolEvent):
    """Exported alias so API modules can import a single contracts module."""


class SnapshotModel(Snapshot):
    """Exported alias so API modules can import a single contracts module."""
