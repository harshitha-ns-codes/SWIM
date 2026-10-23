from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class MemberStatus(str, Enum):
    ALIVE = "alive"
    SUSPECTED = "suspected"
    FAILED = "failed"


class ProcessState(str, Enum):
    RUNNING = "running"
    CRASHED = "crashed"


class SessionStatus(str, Enum):
    INITIALIZED = "initialized"
    COMPLETED = "completed"
    COMPLETED_WITH_LIMITATIONS = "completed_with_limitations"


class EventType(str, Enum):
    SESSION_STARTED = "session_started"
    CLUSTER_INITIALIZED = "cluster_initialized"
    NODE_CRASHED = "node_crashed"
    NODE_JOINED = "node_joined"
    NODE_LEFT = "node_left"
    PING = "ping"
    ACK = "ack"
    PING_REQ = "ping_req"
    HELPER_PING = "helper_ping"
    PIGGYBACK = "piggyback"
    TIMEOUT = "timeout"
    SUSPECTED = "suspected"
    RECOVERED = "recovered"
    FAILED = "failed"
    SCENARIO_COMPLETED = "scenario_completed"
    SCENARIO_LIMITED = "scenario_limited"


class Position(BaseModel):
    x: float
    y: float


class MembershipEntry(BaseModel):
    node_id: str
    status: MemberStatus
    incarnation: int = 0


class MembershipUpdate(BaseModel):
    observer_id: str
    node_id: str
    previous_status: MemberStatus
    new_status: MemberStatus
    incarnation: int = 0


class ProtocolEvent(BaseModel):
    event_id: str
    sim_time: float
    protocol_period: int
    event_type: EventType
    source_node: str | None = None
    target_node: str | None = None
    outcome: str
    membership_update: MembershipUpdate | None = None
    detail: str = ""
    piggybacked: list[str] = Field(default_factory=list)


class NodeSnapshot(BaseModel):
    node_id: str
    process_state: ProcessState
    display_status: MemberStatus
    incarnation: int = 0
    position: Position
    local_view: list[MembershipEntry]


class EdgeSnapshot(BaseModel):
    source: str
    target: str
    kind: Literal["overlay", "probe"]
    active: bool = False


class MetricsSnapshot(BaseModel):
    total_members: int
    alive_members: int
    suspected_members: int
    failed_members: int
    protocol_messages: int
    membership_convergence: float | None = Field(
        default=None,
        description="Fraction of membership views that agree. None means not measured.",
    )


class ProbeHighlight(BaseModel):
    source: str
    target: str
    outcome: str


class Snapshot(BaseModel):
    session_id: str
    scenario_id: str
    scenario_title: str
    status: SessionStatus
    demo_cluster: bool
    persistence: Literal["in-memory"] = "in-memory"
    sim_time: float
    protocol_period: int
    nodes: list[NodeSnapshot]
    edges: list[EdgeSnapshot]
    metrics: MetricsSnapshot
    limitations: list[str]
    active_probe: ProbeHighlight | None = None
    capabilities: dict[str, bool]
    k_helpers: int = 3
    piggybacked_updates: int = 0
    packets_sent: int = 0
    protocol_phase: str | None = None
    helper_ids: list[str] = Field(default_factory=list)
    udp_enabled: bool = False
    udp_ports: dict[str, int] = Field(default_factory=dict)
    latest_update_label: str | None = None
    latest_update_knowers: list[str] = Field(default_factory=list)
    local_health: float | None = None
    adaptive_timeout: float | None = None
    extra_broadcast_packets: int = 0
    probing: bool = False
    awaiting_helpers: bool = False
    ack_timeout_ms: int = 800
    suspicion_timeout_ms: int = 2500
    pending_source: str | None = None
    pending_target: str | None = None
    demo_path: str | None = None
    auto_run: bool = False
    probe_mode: Literal["round_robin", "random"] = "round_robin"
    next_targets: dict[str, str] = Field(default_factory=dict)
    completeness_bound_periods: int = 0
    probe_deadlines: dict[str, int] = Field(default_factory=dict)
    probe_deadline_by: dict[str, str] = Field(default_factory=dict)
    piggyback_limit: int = 0
