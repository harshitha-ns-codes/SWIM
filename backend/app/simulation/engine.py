from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field

from app.models.domain import (
    EdgeSnapshot,
    EventType,
    MemberStatus,
    MembershipEntry,
    MembershipUpdate,
    MetricsSnapshot,
    NodeSnapshot,
    Position,
    ProbeHighlight,
    ProcessState,
    ProtocolEvent,
    SessionStatus,
    Snapshot,
)
from app.simulation.capabilities import ENGINE_CAPABILITIES
from app.simulation.clock import SimulatedClock
from app.simulation.scenarios import ScenarioSpec

PING_TIMEOUT = 5.0
FAIL_CONFIRM_TIMEOUT = 10.0
DEFAULT_ACK_DELAY = 1.0
LAYOUT_RADIUS = 160.0


@dataclass
class Node:
    node_id: str
    process_state: ProcessState = ProcessState.RUNNING
    incarnation: int = 0
    ack_delay: float = DEFAULT_ACK_DELAY
    position: Position = field(default_factory=lambda: Position(x=0, y=0))
    local_view: dict[str, MembershipEntry] = field(default_factory=dict)


@dataclass
class Probe:
    probe_id: int
    source: str
    target: str
    period: int
    start_time: float
    timed_out: bool = False
    acked: bool = False


@dataclass
class SimulationSession:
    session_id: str
    scenario: ScenarioSpec
    clock: SimulatedClock
    nodes: dict[str, Node]
    events: list[ProtocolEvent] = field(default_factory=list)
    overlay_edges: list[tuple[str, str]] = field(default_factory=list)
    probes: dict[int, Probe] = field(default_factory=dict)
    confirm_generation: dict[tuple[str, str], int] = field(default_factory=dict)
    protocol_message_count: int = 0
    limitations: list[str] = field(default_factory=list)
    status: SessionStatus = SessionStatus.INITIALIZED
    event_seq: int = 0
    last_probe: ProbeHighlight | None = None
    probe_seq: int = 0

    @property
    def scenario_id(self) -> str:
        return self.scenario.definition.id

    def snapshot(self) -> Snapshot:
        node_snapshots = [self._node_snapshot(node) for node in self.nodes.values()]
        status_counts = {status: 0 for status in MemberStatus}
        for node in node_snapshots:
            status_counts[node.display_status] += 1

        edges = [
            EdgeSnapshot(source=source, target=target, kind="overlay", active=False)
            for source, target in self.overlay_edges
        ]
        if self.last_probe:
            edges.append(
                EdgeSnapshot(
                    source=self.last_probe.source,
                    target=self.last_probe.target,
                    kind="probe",
                    active=True,
                )
            )

        return Snapshot(
            session_id=self.session_id,
            scenario_id=self.scenario_id,
            scenario_title=self.scenario.definition.title,
            status=self.status,
            demo_cluster=True,
            persistence="in-memory",
            sim_time=self.clock.now,
            protocol_period=self.clock.period,
            nodes=node_snapshots,
            edges=edges,
            metrics=MetricsSnapshot(
                total_members=len(node_snapshots),
                alive_members=status_counts[MemberStatus.ALIVE],
                suspected_members=status_counts[MemberStatus.SUSPECTED],
                failed_members=status_counts[MemberStatus.FAILED],
                protocol_messages=self.protocol_message_count,
                membership_convergence=None,
            ),
            limitations=list(self.limitations),
            active_probe=self.last_probe,
            capabilities=dict(ENGINE_CAPABILITIES),
        )

    def _node_snapshot(self, node: Node) -> NodeSnapshot:
        return NodeSnapshot(
            node_id=node.node_id,
            process_state=node.process_state,
            display_status=self._display_status(node.node_id),
            incarnation=node.incarnation,
            position=node.position,
            local_view=list(node.local_view.values()),
        )

    def _display_status(self, node_id: str) -> MemberStatus:
        observed = [
            observer.local_view[node_id].status
            for observer in self.nodes.values()
            if node_id in observer.local_view
        ]
        if MemberStatus.FAILED in observed:
            return MemberStatus.FAILED
        if MemberStatus.SUSPECTED in observed:
            return MemberStatus.SUSPECTED
        return MemberStatus.ALIVE


class SimulationEngine:
    """Discrete-event SWIM engine independent of HTTP and UI layers."""

    def run_scenario(self, scenario: ScenarioSpec) -> SimulationSession:
        session = self._initialize_session(scenario)
        self._schedule_scenario(session)
        self.run_until_idle(session)
        self._finalize(session)
        return session

    def run_until_idle(self, session: SimulationSession) -> None:
        while session.clock.has_events():
            self.step(session)

    def step(self, session: SimulationSession) -> ProtocolEvent | None:
        scheduled = session.clock.pop_next()
        if scheduled is None:
            return None
        handler = {
            "crash": self._on_crash,
            "ping": self._on_ping,
            "ack": self._on_ack,
            "probe_timeout": self._on_probe_timeout,
            "fail_confirm": self._on_fail_confirm,
        }[scheduled.kind]
        handler(session, scheduled.payload)
        return session.events[-1] if session.events else None

    def _initialize_session(self, scenario: ScenarioSpec) -> SimulationSession:
        node_ids = [f"n{index}" for index in range(scenario.node_count)]
        positions = _circular_layout(node_ids)
        nodes: dict[str, Node] = {}
        for node_id in node_ids:
            node = Node(
                node_id=node_id,
                ack_delay=scenario.ack_delays.get(node_id, DEFAULT_ACK_DELAY),
                position=positions[node_id],
                local_view={
                    other_id: MembershipEntry(node_id=other_id, status=MemberStatus.ALIVE)
                    for other_id in node_ids
                    if other_id != node_id
                },
            )
            nodes[node_id] = node

        overlay_edges = [
            (node_ids[index], node_ids[(index + 1) % len(node_ids)])
            for index in range(len(node_ids))
        ]
        session = SimulationSession(
            session_id=str(uuid.uuid4()),
            scenario=scenario,
            clock=SimulatedClock(),
            nodes=nodes,
            overlay_edges=overlay_edges,
            limitations=list(scenario.limitations),
        )
        self._emit(
            session,
            EventType.SESSION_STARTED,
            outcome="created",
            detail=(
                f"Server-owned in-memory session created for scenario '{scenario.definition.title}'. "
                "Restarting the backend clears this session."
            ),
        )
        self._emit(
            session,
            EventType.CLUSTER_INITIALIZED,
            outcome="demo_cluster",
            detail=f"Initialized deterministic demo cluster with {len(node_ids)} members.",
        )
        return session

    def _schedule_scenario(self, session: SimulationSession) -> None:
        spec = session.scenario
        if spec.crash_node:
            session.clock.schedule(
                spec.crash_at,
                "crash",
                {"node_id": spec.crash_node},
            )
        session.clock.schedule(
            spec.ping_at,
            "ping",
            {"source": spec.probe_source, "target": spec.probe_target},
        )

    def _finalize(self, session: SimulationSession) -> None:
        unimplemented = session.scenario.definition.unimplemented_capabilities
        if unimplemented or session.limitations:
            session.status = SessionStatus.COMPLETED_WITH_LIMITATIONS
            self._emit(
                session,
                EventType.SCENARIO_LIMITED,
                outcome="completed_with_limitations",
                detail="Scenario ran with the implemented engine subset; see limitations.",
            )
            return
        session.status = SessionStatus.COMPLETED
        self._emit(
            session,
            EventType.SCENARIO_COMPLETED,
            outcome="completed",
            detail="Scenario completed using implemented direct-probe behavior.",
        )

    def _on_crash(self, session: SimulationSession, payload: dict) -> None:
        node = session.nodes[payload["node_id"]]
        node.process_state = ProcessState.CRASHED
        self._emit(
            session,
            EventType.NODE_CRASHED,
            outcome="crashed",
            target_node=node.node_id,
            detail=f"{node.node_id} process state changed to crashed (ground truth).",
        )

    def _on_ping(self, session: SimulationSession, payload: dict) -> None:
        source_id = payload["source"]
        target_id = payload["target"]
        session.clock.period += 1
        session.probe_seq += 1
        probe = Probe(
            probe_id=session.probe_seq,
            source=source_id,
            target=target_id,
            period=session.clock.period,
            start_time=session.clock.now,
        )
        session.probes[probe.probe_id] = probe
        session.protocol_message_count += 1
        session.last_probe = ProbeHighlight(source=source_id, target=target_id, outcome="sent")
        self._emit(
            session,
            EventType.PING,
            outcome="sent",
            source_node=source_id,
            target_node=target_id,
            detail=f"{source_id} sent a direct PING to {target_id}.",
        )

        target = session.nodes[target_id]
        session.clock.schedule(PING_TIMEOUT, "probe_timeout", {"probe_id": probe.probe_id})
        if target.process_state is ProcessState.RUNNING:
            session.clock.schedule(
                target.ack_delay,
                "ack",
                {"probe_id": probe.probe_id},
            )

    def _on_ack(self, session: SimulationSession, payload: dict) -> None:
        probe = session.probes[payload["probe_id"]]
        target = session.nodes[probe.target]
        observer = session.nodes[probe.source]
        if target.process_state is ProcessState.CRASHED:
            return
        current = observer.local_view[probe.target]
        if current.status is MemberStatus.FAILED:
            return

        probe.acked = True
        session.protocol_message_count += 1
        session.last_probe = ProbeHighlight(
            source=probe.source,
            target=probe.target,
            outcome="ack",
        )
        previous = current.status
        membership_update = None
        if previous is MemberStatus.SUSPECTED:
            observer.local_view[probe.target] = MembershipEntry(
                node_id=probe.target,
                status=MemberStatus.ALIVE,
                incarnation=target.incarnation,
            )
            key = (probe.source, probe.target)
            session.confirm_generation[key] = session.confirm_generation.get(key, 0) + 1
            membership_update = MembershipUpdate(
                observer_id=probe.source,
                node_id=probe.target,
                previous_status=previous,
                new_status=MemberStatus.ALIVE,
                incarnation=target.incarnation,
            )
            self._emit(
                session,
                EventType.ACK,
                outcome="success",
                source_node=probe.target,
                target_node=probe.source,
                membership_update=membership_update,
                detail=f"{probe.target} delivered a delayed ACK to {probe.source}.",
            )
            self._emit(
                session,
                EventType.RECOVERED,
                outcome="restored_alive",
                source_node=probe.source,
                target_node=probe.target,
                membership_update=membership_update,
                detail=(
                    f"{probe.source} restored {probe.target} to alive after a valid ACK "
                    "arrived before failure confirmation."
                ),
            )
            return

        self._emit(
            session,
            EventType.ACK,
            outcome="success",
            source_node=probe.target,
            target_node=probe.source,
            detail=f"{probe.target} acknowledged the PING from {probe.source}.",
        )

    def _on_probe_timeout(self, session: SimulationSession, payload: dict) -> None:
        probe = session.probes[payload["probe_id"]]
        if probe.acked:
            return
        probe.timed_out = True
        observer = session.nodes[probe.source]
        current = observer.local_view[probe.target]
        self._emit(
            session,
            EventType.TIMEOUT,
            outcome="expired",
            source_node=probe.source,
            target_node=probe.target,
            detail=f"Direct probe from {probe.source} to {probe.target} timed out.",
        )
        if current.status is MemberStatus.ALIVE:
            observer.local_view[probe.target] = MembershipEntry(
                node_id=probe.target,
                status=MemberStatus.SUSPECTED,
                incarnation=current.incarnation,
            )
            key = (probe.source, probe.target)
            generation = session.confirm_generation.get(key, 0) + 1
            session.confirm_generation[key] = generation
            update = MembershipUpdate(
                observer_id=probe.source,
                node_id=probe.target,
                previous_status=MemberStatus.ALIVE,
                new_status=MemberStatus.SUSPECTED,
                incarnation=current.incarnation,
            )
            self._emit(
                session,
                EventType.SUSPECTED,
                outcome="local_view_updated",
                source_node=probe.source,
                target_node=probe.target,
                membership_update=update,
                detail=f"{probe.source} marked {probe.target} as suspected in its local view.",
            )
            session.clock.schedule(
                FAIL_CONFIRM_TIMEOUT,
                "fail_confirm",
                {
                    "observer_id": probe.source,
                    "target_id": probe.target,
                    "generation": generation,
                },
            )

    def _on_fail_confirm(self, session: SimulationSession, payload: dict) -> None:
        key = (payload["observer_id"], payload["target_id"])
        if session.confirm_generation.get(key) != payload["generation"]:
            return
        observer = session.nodes[payload["observer_id"]]
        current = observer.local_view[payload["target_id"]]
        if current.status is not MemberStatus.SUSPECTED:
            return
        observer.local_view[payload["target_id"]] = MembershipEntry(
            node_id=payload["target_id"],
            status=MemberStatus.FAILED,
            incarnation=current.incarnation,
        )
        update = MembershipUpdate(
            observer_id=observer.node_id,
            node_id=payload["target_id"],
            previous_status=MemberStatus.SUSPECTED,
            new_status=MemberStatus.FAILED,
            incarnation=current.incarnation,
        )
        self._emit(
            session,
            EventType.FAILED,
            outcome="local_view_updated",
            source_node=observer.node_id,
            target_node=payload["target_id"],
            membership_update=update,
            detail=(
                f"{observer.node_id} confirmed {payload['target_id']} as failed "
                "after the suspicion timeout elapsed without recovery."
            ),
        )

    def _emit(
        self,
        session: SimulationSession,
        event_type: EventType,
        outcome: str,
        source_node: str | None = None,
        target_node: str | None = None,
        membership_update: MembershipUpdate | None = None,
        detail: str = "",
    ) -> None:
        session.event_seq += 1
        session.events.append(
            ProtocolEvent(
                event_id=f"evt-{session.event_seq:04d}",
                sim_time=round(session.clock.now, 3),
                protocol_period=session.clock.period,
                event_type=event_type,
                source_node=source_node,
                target_node=target_node,
                outcome=outcome,
                membership_update=membership_update,
                detail=detail,
            )
        )


def _circular_layout(node_ids: list[str]) -> dict[str, Position]:
    count = len(node_ids)
    positions: dict[str, Position] = {}
    for index, node_id in enumerate(node_ids):
        angle = -math.pi / 2 + (2 * math.pi * index / count)
        positions[node_id] = Position(
            x=round(LAYOUT_RADIUS * math.cos(angle), 2),
            y=round(LAYOUT_RADIUS * math.sin(angle), 2),
        )
    return positions
