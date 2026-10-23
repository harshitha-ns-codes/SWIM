from __future__ import annotations

import asyncio
import json
import math
import random
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from app.errors import InvalidLiveActionError
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
from app.services.event_log import log_event
from app.simulation.gossip import apply_update, gossip_kind, status_from_kind

LAYOUT_RADIUS = 168.0
LIVE_CAPABILITIES: dict[str, bool] = {
    "direct_ping_ack": True,
    "indirect_ping_req": True,
    "simulated_timeouts": True,
    "suspicion_and_recovery": True,
    "incarnation_precedence": True,
    "piggybacked_updates": True,
    "failure_confirmation": True,
    "gossip_dissemination": True,
    "convergence_metrics": True,
}


@dataclass
class GossipItem:
    kind: str
    node_id: str
    incarnation: int
    count: int = 0
    born: int = 0

    def as_dict(self) -> dict[str, str | int]:
        return {
            "kind": self.kind,
            "node_id": self.node_id,
            "incarnation": self.incarnation,
            "count": self.count,
            "born": self.born,
        }

    def label(self) -> str:
        return f"{self.kind}:{self.node_id}#{self.incarnation}"


MAX_LIVE_MEMBERS = 16
MIN_LIVE_MEMBERS = 4


@dataclass
class LiveMember:
    node_id: str
    position: Position
    process_state: ProcessState = ProcessState.RUNNING
    incarnation: int = 0
    isolated: bool = False
    frozen: bool = False
    local_view: dict[str, MembershipEntry] = field(default_factory=dict)
    buffer: list[GossipItem] = field(default_factory=list)
    probe_order: list[str] = field(default_factory=list)
    probe_index: int = 0
    rtt_ewma: float | None = None
    successes: int = 0
    attempts: int = 0


class _UdpProtocol(asyncio.DatagramProtocol):
    def __init__(self, mailbox: asyncio.Queue[bytes]) -> None:
        self.mailbox = mailbox
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, _addr: tuple[str, int]) -> None:
        try:
            self.mailbox.put_nowait(data)
        except asyncio.QueueFull:
            return


class LiveCluster:
    """Interactive SWIM cluster: direct ping, k indirect probes, suspicion, confirm, piggyback gossip."""

    def __init__(
        self,
        member_count: int = 8,
        k_helpers: int = 3,
        enable_udp: bool = False,
        animation_ms: int = 0,
        seed: int = 7,
    ) -> None:
        self.session_id = str(uuid.uuid4())
        self.member_ids = [f"n{index}" for index in range(member_count)]
        self.k_helpers = k_helpers
        self.enable_udp = enable_udp
        self.step_delay = animation_ms / 1000.0
        self.network_delay = 0.04 if animation_ms else 0.0
        self.loss = 0.0
        self.rng = random.Random(seed)
        self.members: dict[str, LiveMember] = {}
        self.mailboxes: dict[str, asyncio.Queue[bytes]] = {}
        self.overlay_edges: list[tuple[str, str]] = []
        self.events: list[ProtocolEvent] = []
        self.limitations: list[str] = []
        self.status = SessionStatus.INITIALIZED
        self.sim_time = 0.0
        self.protocol_period = 0
        self.event_seq = 0
        self.seq = 0
        self.packets_sent = 0
        self.piggybacked_updates = 0
        self.extra_broadcast_packets = 0
        self.protocol_phase: str | None = "idle"
        self.helper_ids: list[str] = []
        self.udp_ports: dict[str, int] = {}
        self.last_probe: ProbeHighlight | None = None
        self.latest_subject: str | None = None
        self.latest_status: MemberStatus | None = None
        self.probing = False
        self.awaiting_helpers = False
        self.demo_path: str | None = None
        self.pending_source: str | None = None
        self.pending_target: str | None = None
        self.ack_timeout_s = 0.8
        self.suspicion_timeout_s = 2.5
        self._pending_seq: int | None = None
        self._pending_piggy: list[dict[str, str | int]] = []
        self._silent_nodes: set[str] = set()
        self.on_event: Callable[[ProtocolEvent, Snapshot], None] | None = None
        self._closed = False
        self._drop_next_from: str | None = None
        self._waiters: dict[tuple[str, int], asyncio.Future] = {}
        self._tasks: list[asyncio.Task] = []
        self._transports: dict[str, asyncio.DatagramTransport] = {}
        self._addrs: dict[str, tuple[str, int]] = {}
        self._probe_lock = asyncio.Lock()
        self.auto_run = False
        self.probe_mode = "round_robin"
        self._mute_acks: set[str] = set()
        self._pending_refutes: set[str] = set()
        self._refuting: set[str] = set()
        self._auto_task: asyncio.Task | None = None
        self._gossip_seq = 0

        positions = _circular_layout(self.member_ids)
        for node_id in self.member_ids:
            member = LiveMember(
                node_id=node_id,
                position=positions[node_id],
                local_view={
                    other: MembershipEntry(node_id=other, status=MemberStatus.ALIVE)
                    for other in self.member_ids
                },
            )
            self.members[node_id] = member
            self.mailboxes[node_id] = asyncio.Queue()
        self._relayout()
        self._reset_probe_orders()

    async def start(self) -> None:
        if self.enable_udp:
            try:
                await self._bind_udp()
            except OSError:
                self.enable_udp = False
                self.limitations.append("UDP bind failed; probes continue on an in-process datagram bus.")
        self._tasks = [
            asyncio.create_task(self._dispatch_loop(node_id), name=f"swim-dispatch-{node_id}")
            for node_id in self.member_ids
        ]
        self._emit(
            EventType.SESSION_STARTED,
            outcome="started",
            detail=(
                "Interactive SWIM cluster started. Click source then target to probe, "
                "or run protocol periods so every member pings once per round."
            ),
        )
        self._emit(
            EventType.CLUSTER_INITIALIZED,
            outcome="ready",
            detail=(
                f"{len(self.member_ids)} members, k={self.k_helpers} helpers, "
                f"{'UDP sockets bound' if self.enable_udp else 'in-process datagrams'}."
            ),
        )

    async def close(self) -> None:
        self._closed = True
        self.auto_run = False
        for task in self._tasks:
            task.cancel()
        for transport in self._transports.values():
            transport.close()
        for mailbox in self.mailboxes.values():
            try:
                mailbox.put_nowait(b"{}")
            except asyncio.QueueFull:
                pass
        self._tasks.clear()
        self._transports.clear()

    async def probe(
        self,
        source_id: str,
        target_id: str,
        path: str | None = None,
        helper_ids: list[str] | None = None,
        ack_timeout_ms: int | None = None,
        suspicion_timeout_ms: int | None = None,
    ) -> Snapshot:
        source = self._require_member(source_id)
        target = self._require_member(target_id)
        if source_id == target_id:
            raise InvalidLiveActionError("Choose two different nodes as source and target.")
        if source.process_state is ProcessState.CRASHED:
            raise InvalidLiveActionError(f"{source_id} is crashed and cannot probe.")
        if source.frozen or source.isolated:
            raise InvalidLiveActionError(f"{source_id} is frozen or isolated and cannot probe.")
        if ack_timeout_ms is not None:
            self.ack_timeout_s = ack_timeout_ms / 1000.0
        if suspicion_timeout_ms is not None:
            self.suspicion_timeout_s = suspicion_timeout_ms / 1000.0
        async with self._probe_lock:
            self.probing = True
            self.awaiting_helpers = False
            self.protocol_period += 1
            self.helper_ids = []
            self.demo_path = path
            try:
                await self._run_period(source, target, path=path, helper_ids=helper_ids or [])
            finally:
                if not self.awaiting_helpers:
                    self.probing = False
                    self.protocol_phase = "idle"
                    self._silent_nodes.clear()
                    self._mute_acks.clear()
                self.last_probe = ProbeHighlight(
                    source=source_id,
                    target=target_id,
                    outcome=self._view_status(source_id, target_id).value,
                )
        return self.snapshot()

    async def continue_with_helpers(
        self,
        helper_ids: list[str],
        suspicion_timeout_ms: int | None = None,
    ) -> Snapshot:
        if not self.awaiting_helpers or self.pending_source is None or self.pending_target is None:
            raise InvalidLiveActionError("There is no probe waiting for helper nodes. Ping first on the failure path.")
        if suspicion_timeout_ms is not None:
            self.suspicion_timeout_s = suspicion_timeout_ms / 1000.0
        source = self._require_member(self.pending_source)
        target = self._require_member(self.pending_target)
        helpers = self._validated_helpers(source.node_id, target.node_id, helper_ids)
        async with self._probe_lock:
            try:
                await self._run_helpers_then_confirm(source, target, helpers)
            finally:
                self.awaiting_helpers = False
                self.probing = False
                self.protocol_phase = "idle"
                self._silent_nodes.clear()
                self._mute_acks.clear()
                self.pending_source = None
                self.pending_target = None
                self._pending_seq = None
                self.last_probe = ProbeHighlight(
                    source=source.node_id,
                    target=target.node_id,
                    outcome=self._view_status(source.node_id, target.node_id).value,
                )
        return self.snapshot()

    async def crash(self, node_id: str) -> Snapshot:
        member = self._require_member(node_id)
        member.process_state = ProcessState.CRASHED
        self._emit(
            EventType.NODE_CRASHED,
            target=node_id,
            outcome="crashed",
            detail=f"{node_id} crashed. Other members still list it alive until a probe fails.",
        )
        return self.snapshot()

    async def isolate(self, node_id: str) -> Snapshot:
        member = self._require_member(node_id)
        member.isolated = not member.isolated
        self._emit(
            EventType.TIMEOUT,
            source=node_id,
            target=node_id,
            outcome="isolated" if member.isolated else "rejoined",
            detail=f"{node_id} {'is isolated from the network' if member.isolated else 'rejoined the network'}.",
        )
        return self.snapshot()

    async def freeze(self, node_id: str) -> Snapshot:
        member = self._require_member(node_id)
        member.frozen = not member.frozen
        self._emit(
            EventType.TIMEOUT,
            source=node_id,
            target=node_id,
            outcome="frozen" if member.frozen else "thawed",
            detail=f"{node_id} {'is frozen and will not reply' if member.frozen else 'resumed replies'}.",
        )
        return self.snapshot()

    async def run_one_period(
        self,
        probe_mode: str | None = None,
        ack_timeout_ms: int | None = None,
        suspicion_timeout_ms: int | None = None,
    ) -> Snapshot:
        if self.awaiting_helpers:
            raise InvalidLiveActionError("Finish helper selection before running a protocol period.")
        if probe_mode in {"round_robin", "random"}:
            self.probe_mode = probe_mode
        if ack_timeout_ms is not None:
            self.ack_timeout_s = ack_timeout_ms / 1000.0
        if suspicion_timeout_ms is not None:
            self.suspicion_timeout_s = suspicion_timeout_ms / 1000.0
        async with self._probe_lock:
            if self.awaiting_helpers:
                raise InvalidLiveActionError("Finish helper selection before running a protocol period.")
            self.probing = True
            self.demo_path = None
            self.protocol_period += 1
            self.helper_ids = []
            try:
                for source in self._probers():
                    if self._closed:
                        break
                    target = self._next_target(source)
                    if target is None:
                        continue
                    await self._run_period(source, target, path=None, helper_ids=[], wait_confirm=False)
            finally:
                self.probing = False
                self.protocol_phase = "idle"
                self._silent_nodes.clear()
                self._mute_acks.clear()
        return self.snapshot()

    async def set_auto_run(
        self,
        enabled: bool,
        probe_mode: str | None = None,
        ack_timeout_ms: int | None = None,
        suspicion_timeout_ms: int | None = None,
    ) -> Snapshot:
        if probe_mode in {"round_robin", "random"}:
            self.probe_mode = probe_mode
        if ack_timeout_ms is not None:
            self.ack_timeout_s = ack_timeout_ms / 1000.0
        if suspicion_timeout_ms is not None:
            self.suspicion_timeout_s = suspicion_timeout_ms / 1000.0
        if enabled and self.awaiting_helpers:
            raise InvalidLiveActionError("Finish helper selection before auto-run.")
        self.auto_run = enabled
        if enabled:
            if self._auto_task is None or self._auto_task.done():
                self._auto_task = asyncio.create_task(self._auto_loop(), name="swim-auto-run")
                self._tasks.append(self._auto_task)
            self._emit(
                EventType.CLUSTER_INITIALIZED,
                outcome="auto_run",
                detail=(
                    f"Auto-run on ({self.probe_mode}). Every alive member probes one target each period. "
                    "Click a node to inspect its membership list."
                ),
            )
        else:
            self._emit(
                EventType.CLUSTER_INITIALIZED,
                outcome="auto_run_paused",
                detail="Auto-run paused. Run one period, or click source then target to probe.",
            )
        return self.snapshot()

    async def join(self, contact_id: str | None = None) -> Snapshot:
        if len(self.members) >= MAX_LIVE_MEMBERS:
            raise InvalidLiveActionError(f"Cluster already has {MAX_LIVE_MEMBERS} members.")
        async with self._probe_lock:
            return await self._join_locked(contact_id)

    async def _join_locked(self, contact_id: str | None) -> Snapshot:
        if len(self.members) >= MAX_LIVE_MEMBERS:
            raise InvalidLiveActionError(f"Cluster already has {MAX_LIVE_MEMBERS} members.")
        contact = self._join_contact(contact_id)
        new_id = self._allocate_id()
        joiner = LiveMember(
            node_id=new_id,
            position=Position(x=0, y=0),
            local_view={
                node_id: MembershipEntry(
                    node_id=node_id,
                    status=entry.status,
                    incarnation=entry.incarnation,
                )
                for node_id, entry in contact.local_view.items()
            },
        )
        joiner.local_view[new_id] = MembershipEntry(node_id=new_id, status=MemberStatus.ALIVE)
        self.members[new_id] = joiner
        self.member_ids.append(new_id)
        self.mailboxes[new_id] = asyncio.Queue()
        self._relayout()
        self._reset_probe_orders()
        self._tasks.append(asyncio.create_task(self._dispatch_loop(new_id), name=f"swim-dispatch-{new_id}"))
        if self.enable_udp:
            try:
                await self._bind_one_udp(new_id)
            except OSError:
                self.limitations.append(f"UDP bind failed for {new_id}; join continues on the in-process bus.")
        self._emit(
            EventType.NODE_JOINED,
            source=new_id,
            target=contact.node_id,
            outcome="joined",
            detail=f"{new_id} joined by contacting {contact.node_id}. That member will infect Alive:{new_id}.",
        )
        self._mark_local(contact, new_id, MemberStatus.ALIVE, 0)
        await self._disseminate_status(contact, MemberStatus.ALIVE, new_id, 0)
        self.protocol_phase = "idle"
        return self.snapshot()

    async def leave(self, node_id: str) -> Snapshot:
        async with self._probe_lock:
            return await self._leave_locked(node_id)

    async def _leave_locked(self, node_id: str) -> Snapshot:
        if len([member for member in self.members.values() if member.process_state is ProcessState.RUNNING]) <= MIN_LIVE_MEMBERS:
            raise InvalidLiveActionError(f"Keep at least {MIN_LIVE_MEMBERS} running members.")
        member = self._require_member(node_id)
        if member.process_state is ProcessState.CRASHED:
            raise InvalidLiveActionError(f"{node_id} has already left or crashed.")
        if node_id in {self.pending_source, self.pending_target}:
            raise InvalidLiveActionError("That node is part of the current probe. Finish it first.")
        self._emit(
            EventType.NODE_LEFT,
            source=node_id,
            target=node_id,
            outcome="left",
            detail=f"{node_id} announced a leave. Confirm:{node_id} will infect the group.",
        )
        self._mark_local(member, node_id, MemberStatus.FAILED, member.incarnation)
        await self._disseminate_status(member, MemberStatus.FAILED, node_id, member.incarnation)
        member.process_state = ProcessState.CRASHED
        self.protocol_phase = "idle"
        return self.snapshot()

    def configure(
        self,
        k_helpers: int | None = None,
        loss: float | None = None,
        delay_ms: float | None = None,
        drop_next: bool = False,
        drop_from: str | None = None,
    ) -> Snapshot:
        if k_helpers is not None:
            self.k_helpers = k_helpers
        if loss is not None:
            self.loss = loss
        if delay_ms is not None:
            self.network_delay = delay_ms / 1000.0
        if drop_next:
            self._drop_next_from = drop_from
        return self.snapshot()

    def snapshot(self) -> Snapshot:
        node_snapshots = [self._node_snapshot(member) for member in self.members.values()]
        counts = {status: 0 for status in MemberStatus}
        for node in node_snapshots:
            counts[node.display_status] += 1
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
        health = None
        timeout = None
        if self.last_probe:
            source = self.members.get(self.last_probe.source)
            if source:
                health = source.successes / max(source.attempts, 1)
                timeout = self._direct_timeout(source)
        deadlines, deadline_by = self._probe_deadlines()
        return Snapshot(
            session_id=self.session_id,
            scenario_id="live",
            scenario_title="Live SWIM cluster",
            status=self.status,
            demo_cluster=True,
            persistence="in-memory",
            sim_time=round(self.sim_time, 3),
            protocol_period=self.protocol_period,
            nodes=node_snapshots,
            edges=edges,
            metrics=MetricsSnapshot(
                total_members=len(node_snapshots),
                alive_members=counts[MemberStatus.ALIVE],
                suspected_members=counts[MemberStatus.SUSPECTED],
                failed_members=counts[MemberStatus.FAILED],
                protocol_messages=self.packets_sent,
                membership_convergence=self._convergence(),
            ),
            limitations=list(self.limitations),
            active_probe=self.last_probe,
            capabilities=dict(LIVE_CAPABILITIES),
            k_helpers=self.k_helpers,
            piggybacked_updates=self.piggybacked_updates,
            packets_sent=self.packets_sent,
            protocol_phase=self.protocol_phase,
            helper_ids=list(self.helper_ids),
            udp_enabled=self.enable_udp,
            udp_ports=dict(self.udp_ports),
            latest_update_label=self._latest_label(),
            latest_update_knowers=self._knowers(),
            local_health=health,
            adaptive_timeout=timeout,
            extra_broadcast_packets=self.extra_broadcast_packets,
            probing=self.probing,
            awaiting_helpers=self.awaiting_helpers,
            ack_timeout_ms=int(self.ack_timeout_s * 1000),
            suspicion_timeout_ms=int(self.suspicion_timeout_s * 1000),
            pending_source=self.pending_source,
            pending_target=self.pending_target,
            demo_path=self.demo_path,
            auto_run=self.auto_run,
            probe_mode=self.probe_mode if self.probe_mode in {"round_robin", "random"} else "round_robin",
            next_targets=self._next_targets_preview(),
            completeness_bound_periods=2 * max(len(self.member_ids), 1),
            probe_deadlines=deadlines,
            probe_deadline_by=deadline_by,
            piggyback_limit=self._piggyback_limit(),
        )

    async def _run_period(
        self,
        source: LiveMember,
        target: LiveMember,
        path: str | None = None,
        helper_ids: list[str] | None = None,
        wait_confirm: bool = True,
    ) -> None:
        source.attempts += 1
        self.seq += 1
        seq = self.seq
        timeout = self.ack_timeout_s if path else self._direct_timeout(source)
        if path == "failure":
            self._silent_nodes.add(target.node_id)
        if path == "refute":
            self._mute_acks.add(target.node_id)
        self.protocol_phase = "ping"
        self.last_probe = ProbeHighlight(source=source.node_id, target=target.node_id, outcome="probing")
        piggy = self._take_buffer(source)
        waiter = self._register_waiter(source.node_id, seq)
        await self._send(
            source.node_id,
            target.node_id,
            {
                "kind": "ping",
                "seq": seq,
                "from": source.node_id,
                "to": target.node_id,
                "origin": source.node_id,
                "piggybacks": piggy,
            },
        )
        self._emit(
            EventType.PING,
            source=source.node_id,
            target=target.node_id,
            outcome="sent",
            detail=f"{source.node_id} sent a direct PING to {target.node_id}.",
            piggybacked=[_item_from_dict(item).label() for item in piggy],
        )
        await self._pause()
        ack = await self._await_waiter(waiter, timeout)
        if ack and path not in {"failure", "refute"}:
            source.successes += 1
            self._note_rtt(source, timeout)
            self.protocol_phase = "ack"
            await self._pause()
            return

        if path == "refute":
            await self._suspect_then_refute(source, target, timeout)
            return

        if path == "failure" and not helper_ids:
            self.awaiting_helpers = True
            self.probing = False
            self.protocol_phase = "select_helpers"
            self.pending_source = source.node_id
            self.pending_target = target.node_id
            self._pending_seq = seq
            self._pending_piggy = piggy
            self.helper_ids = []
            self._mark_local(source, target.node_id, MemberStatus.SUSPECTED, target.incarnation)
            await self._disseminate_status(
                source,
                MemberStatus.SUSPECTED,
                target.node_id,
                target.incarnation,
            )
            self.protocol_phase = "select_helpers"
            self._emit(
                EventType.TIMEOUT,
                source=source.node_id,
                target=target.node_id,
                outcome="timeout",
                detail=(
                    f"No ACK from {target.node_id} within {int(timeout * 1000)} ms. "
                    f"{target.node_id} is suspected and that update was piggybacked. "
                    f"Click {self.k_helpers} helper nodes (not source/target), then Ask helpers."
                ),
            )
            return

        self._emit(
            EventType.TIMEOUT,
            source=source.node_id,
            target=target.node_id,
            outcome="timeout",
            detail=f"No ACK from {target.node_id}. {source.node_id} starts indirect probing with k={self.k_helpers} helpers.",
        )

        helpers = (
            self._validated_helpers(source.node_id, target.node_id, helper_ids)
            if helper_ids
            else self._choose_helpers(source.node_id, target.node_id)
        )
        await self._run_helpers_then_confirm(
            source,
            target,
            helpers,
            seq=seq,
            piggy=piggy,
            timeout=timeout,
            wait_confirm=wait_confirm,
        )

    async def _run_helpers_then_confirm(
        self,
        source: LiveMember,
        target: LiveMember,
        helpers: list[str],
        seq: int | None = None,
        piggy: list[dict[str, str | int]] | None = None,
        timeout: float | None = None,
        wait_confirm: bool = True,
    ) -> None:
        seq = seq if seq is not None else self._pending_seq or self.seq
        piggy = self._take_buffer(source) or piggy or self._pending_piggy
        timeout = timeout if timeout is not None else self.ack_timeout_s
        self.helper_ids = helpers
        self.protocol_phase = "ping_req"
        if helpers:
            waiter = self._register_waiter(source.node_id, seq)
            piggy_labels = [_item_from_dict(item).label() for item in piggy]
            for helper_id in helpers:
                self._emit(
                    EventType.PING_REQ,
                    source=source.node_id,
                    target=helper_id,
                    outcome="sent",
                    detail=f"{source.node_id} asked {helper_id} to ping {target.node_id}.",
                    piggybacked=piggy_labels,
                )
            await asyncio.gather(
                *[
                    self._send(
                        source.node_id,
                        helper_id,
                        {
                            "kind": "ping_req",
                            "seq": seq,
                            "from": source.node_id,
                            "to": helper_id,
                            "origin": source.node_id,
                            "probe_target": target.node_id,
                            "piggybacks": piggy,
                        },
                    )
                    for helper_id in helpers
                ]
            )
            await self._pause()
            ack = await self._await_waiter(waiter, timeout)
            if ack and target.node_id not in self._silent_nodes:
                source.successes += 1
                self.protocol_phase = "ack"
                await self._pause()
                return

        already_suspected = self._view_status(source.node_id, target.node_id) is MemberStatus.SUSPECTED
        if not already_suspected:
            self.protocol_phase = "suspect"
            self._mark_local(source, target.node_id, MemberStatus.SUSPECTED, target.incarnation)
            await self._pause()
            self.protocol_phase = "gossip"
            if wait_confirm:
                await self._infection_rounds(rounds=3)
            else:
                await self._disseminate_status(
                    source,
                    MemberStatus.SUSPECTED,
                    target.node_id,
                    target.incarnation,
                )

        if not wait_confirm:
            self._emit(
                EventType.TIMEOUT,
                source=source.node_id,
                target=target.node_id,
                outcome="helper_timeout",
                detail=(
                    f"Helper pings also missed. {target.node_id} is suspected. "
                    f"If it is alive it can refute; otherwise it is confirmed after the suspicion timeout."
                ),
            )
            self._schedule_confirm(source.node_id, target.node_id)
            return

        suspicion_timeout = self.suspicion_timeout_s if self.demo_path else max(timeout * 2, self.step_delay * 2, 0.08)
        self._emit(
            EventType.TIMEOUT,
            source=source.node_id,
            target=target.node_id,
            outcome="helper_timeout",
            detail=(
                f"Helper pings also missed. Waiting {int(suspicion_timeout * 1000)} ms, "
                f"then declaring {target.node_id} failed unless it refutes with a higher incarnation."
            ),
        )
        await asyncio.sleep(suspicion_timeout)
        self.sim_time += suspicion_timeout

        if self._view_status(source.node_id, target.node_id) is MemberStatus.SUSPECTED:
            self.protocol_phase = "confirm"
            self._mark_local(source, target.node_id, MemberStatus.FAILED, target.incarnation)
            if target.process_state is ProcessState.RUNNING and target.node_id in self._silent_nodes:
                target.process_state = ProcessState.CRASHED
            elif target.process_state is ProcessState.RUNNING and self.demo_path == "failure":
                target.process_state = ProcessState.CRASHED
            await self._pause()
            await self._disseminate_status(
                source,
                MemberStatus.FAILED,
                target.node_id,
                target.incarnation,
            )

    def _validated_helpers(self, source_id: str, target_id: str, helper_ids: list[str]) -> list[str]:
        chosen: list[str] = []
        for helper_id in helper_ids:
            if helper_id in {source_id, target_id} or helper_id in chosen:
                continue
            member = self.members.get(helper_id)
            if member is None:
                raise InvalidLiveActionError(f"Unknown helper '{helper_id}'.")
            if member.process_state is ProcessState.CRASHED:
                raise InvalidLiveActionError(f"{helper_id} is crashed and cannot help.")
            chosen.append(helper_id)
        if not chosen:
            raise InvalidLiveActionError("Select at least one helper node that is not the source or target.")
        return chosen[: self.k_helpers]

    async def _suspect_then_refute(self, source: LiveMember, target: LiveMember, timeout: float) -> None:
        self.protocol_phase = "suspect"
        self._mark_local(source, target.node_id, MemberStatus.SUSPECTED, target.incarnation)
        await self._disseminate_status(
            source,
            MemberStatus.SUSPECTED,
            target.node_id,
            target.incarnation,
        )
        self._emit(
            EventType.TIMEOUT,
            source=source.node_id,
            target=target.node_id,
            outcome="timeout",
            detail=(
                f"No ACK from {target.node_id} within {int(timeout * 1000)} ms, so it was suspected. "
                f"{target.node_id} is still alive and will refute with a higher incarnation."
            ),
        )
        await self._drain()
        await self._refute(target)
        self._mute_acks.discard(target.node_id)
        self.protocol_phase = "idle"

    async def _refute(self, member: LiveMember) -> None:
        if member.process_state is not ProcessState.RUNNING or member.node_id in self._silent_nodes:
            return
        if member.node_id in self._refuting:
            return
        suspected_by_others = any(
            observer.node_id != member.node_id
            and (entry := observer.local_view.get(member.node_id)) is not None
            and entry.status is MemberStatus.SUSPECTED
            for observer in self.members.values()
        )
        already_alive = (
            member.incarnation > 0
            and (own := member.local_view.get(member.node_id)) is not None
            and own.status is MemberStatus.ALIVE
        )
        if already_alive and not suspected_by_others:
            return
        self._refuting.add(member.node_id)
        try:
            member.incarnation += 1
            self.protocol_phase = "gossip"
            self._mark_local(member, member.node_id, MemberStatus.ALIVE, member.incarnation)
            await self._disseminate_status(
                member,
                MemberStatus.ALIVE,
                member.node_id,
                member.incarnation,
            )
        finally:
            self._refuting.discard(member.node_id)

    def _schedule_confirm(self, source_id: str, target_id: str) -> None:
        async def later() -> None:
            try:
                await asyncio.sleep(self.suspicion_timeout_s)
                if self._closed:
                    return
                source = self.members.get(source_id)
                target = self.members.get(target_id)
                if source is None or target is None:
                    return
                if self._view_status(source_id, target_id) is not MemberStatus.SUSPECTED:
                    return
                self.protocol_phase = "confirm"
                self._mark_local(source, target_id, MemberStatus.FAILED, target.incarnation)
                await self._disseminate_status(
                    source,
                    MemberStatus.FAILED,
                    target_id,
                    target.incarnation,
                )
                self.protocol_phase = "idle"
            except asyncio.CancelledError:
                return

        task = asyncio.create_task(later(), name=f"swim-confirm-{target_id}")
        self._tasks.append(task)

    async def _auto_loop(self) -> None:
        try:
            while not self._closed and self.auto_run:
                if self.awaiting_helpers:
                    self.auto_run = False
                    break
                try:
                    await self.run_one_period()
                except InvalidLiveActionError:
                    await asyncio.sleep(0.05)
                    continue
                await asyncio.sleep(max(self.step_delay, 0.08))
        except asyncio.CancelledError:
            return

    async def _disseminate_status(
        self,
        origin: LiveMember,
        status: MemberStatus,
        subject_id: str,
        incarnation: int,
    ) -> None:
        """Infect the group by piggybacking on random pings — not a fan-out from origin."""
        self.protocol_phase = "gossip"
        self._buffer_update(origin, gossip_kind(status), subject_id, incarnation)
        await self._infection_rounds(rounds=self._infection_round_count())
        await self._drain()

    async def _infection_rounds(self, rounds: int) -> None:
        alive = [
            member.node_id
            for member in self.members.values()
            if member.process_state is ProcessState.RUNNING and not member.isolated and not member.frozen
        ]
        for _ in range(rounds):
            sends = []
            for src in alive:
                peers = [peer for peer in alive if peer != src]
                if not peers:
                    continue
                dst = self.rng.choice(peers)
                sends.append(self._gossip_contact(src, dst))
            if sends:
                await asyncio.gather(*sends)
            await self._pause()

    async def _gossip_contact(self, src: str, dst: str) -> None:
        self.seq += 1
        piggy = self._take_buffer(self.members[src])
        await self._send(
            src,
            dst,
            {
                "kind": "ping",
                "seq": self.seq,
                "from": src,
                "to": dst,
                "origin": src,
                "purpose": "infection",
                "piggybacks": piggy,
            },
        )
        if piggy:
            self._emit(
                EventType.PING,
                source=src,
                target=dst,
                outcome="infection",
                detail=f"{src} piggybacked membership updates to {dst}.",
                piggybacked=[_item_from_dict(item).label() for item in piggy],
            )

    def _mark_local(
        self,
        observer: LiveMember,
        subject_id: str,
        status: MemberStatus,
        incarnation: int,
    ) -> None:
        previous = observer.local_view.get(subject_id)
        updated = apply_update(previous, subject_id, status, incarnation)
        if updated is None:
            return
        observer.local_view[subject_id] = updated
        self._buffer_update(observer, gossip_kind(status), subject_id, incarnation)
        self.latest_subject = subject_id
        self.latest_status = status
        event_type = {
            MemberStatus.SUSPECTED: EventType.SUSPECTED,
            MemberStatus.FAILED: EventType.FAILED,
            MemberStatus.ALIVE: EventType.RECOVERED,
        }[status]
        self._emit(
            event_type,
            source=observer.node_id,
            target=subject_id,
            outcome=status.value,
            membership_update=MembershipUpdate(
                observer_id=observer.node_id,
                node_id=subject_id,
                previous_status=previous.status if previous else MemberStatus.ALIVE,
                new_status=status,
                incarnation=incarnation,
            ),
            detail=(
                f"{observer.node_id} marked {subject_id} {status.value} and will infect the group "
                "by piggybacking this update on later pings and acks."
            ),
        )

    def _choose_helpers(self, source_id: str, target_id: str) -> list[str]:
        candidates = [
            member.node_id
            for member in self.members.values()
            if member.node_id not in {source_id, target_id}
            and member.process_state is ProcessState.RUNNING
            and not member.isolated
            and not member.frozen
        ]
        if not candidates:
            return []
        count = min(self.k_helpers, len(candidates))
        return self.rng.sample(candidates, count)

    def _direct_timeout(self, source: LiveMember) -> float:
        rtt = source.rtt_ewma if source.rtt_ewma is not None else max(self.network_delay * 2, 0.02)
        timeout = min(max(rtt * 4, 0.05), 1.2)
        health = source.successes / max(source.attempts, 1)
        if source.attempts >= 2 and health < 0.4:
            timeout *= 2
        return timeout + self.step_delay * 0.5

    def _note_rtt(self, source: LiveMember, timeout: float) -> None:
        sample = min(timeout, max(self.network_delay * 2, 0.01))
        if source.rtt_ewma is None:
            source.rtt_ewma = sample
        else:
            source.rtt_ewma = 0.75 * source.rtt_ewma + 0.25 * sample

    def _piggyback_limit(self) -> int:
        """Each update is piggybacked at most λ log2(N) times (paper §4.1)."""
        return max(3, math.ceil(2 * math.log2(max(len(self.member_ids), 2))))

    def _infection_round_count(self) -> int:
        return max(5, math.ceil(2 * math.log2(max(len(self.member_ids), 2))))

    def _take_buffer(self, member: LiveMember) -> list[dict[str, str | int]]:
        if not member.buffer:
            return []
        limit = self._piggyback_limit()

        def recency(item: GossipItem) -> tuple[int, int]:
            return (item.count, -item.born)

        failed = sorted((item for item in member.buffer if item.kind == "confirm"), key=recency)
        active = sorted((item for item in member.buffer if item.kind != "confirm"), key=recency)
        chosen: list[GossipItem] = []
        while len(chosen) < 6 and (failed or active):
            take_active = bool(active) and (
                not failed
                or len([item for item in chosen if item.kind != "confirm"])
                <= len([item for item in chosen if item.kind == "confirm"])
            )
            if take_active:
                chosen.append(active.pop(0))
            else:
                chosen.append(failed.pop(0))
        for item in chosen:
            item.count += 1
        member.buffer = [item for item in member.buffer if item.count < limit]
        return [item.as_dict() for item in chosen]

    def _buffer_update(self, member: LiveMember, kind: str, node_id: str, incarnation: int) -> None:
        for item in member.buffer:
            if item.node_id == node_id and item.kind == kind and item.incarnation == incarnation:
                return
        self._gossip_seq += 1
        member.buffer.append(
            GossipItem(kind=kind, node_id=node_id, incarnation=incarnation, born=self._gossip_seq)
        )

    def _apply_piggybacks(self, receiver_id: str, piggybacks: list[dict], sender_id: str | None) -> None:
        receiver = self.members[receiver_id]
        for raw in piggybacks:
            item = _item_from_dict(raw)
            status = status_from_kind(item.kind)
            previous = receiver.local_view.get(item.node_id)
            updated = apply_update(previous, item.node_id, status, item.incarnation)
            if updated is None:
                continue
            receiver.local_view[item.node_id] = updated
            self._buffer_update(receiver, item.kind, item.node_id, item.incarnation)
            self.latest_subject = item.node_id
            self.latest_status = status
            self.piggybacked_updates += 1
            self._emit(
                EventType.PIGGYBACK,
                source=sender_id,
                target=receiver_id,
                outcome="infected",
                membership_update=MembershipUpdate(
                    observer_id=receiver_id,
                    node_id=item.node_id,
                    previous_status=previous.status if previous else MemberStatus.ALIVE,
                    new_status=status,
                    incarnation=item.incarnation,
                ),
                detail=f"{receiver_id} learned {item.label()} via piggyback from {sender_id}.",
                piggybacked=[item.label()],
            )
            if (
                item.node_id == receiver_id
                and status is MemberStatus.SUSPECTED
                and receiver.process_state is ProcessState.RUNNING
                and receiver_id not in self._silent_nodes
            ):
                self._pending_refutes.add(receiver_id)

    async def _send(self, src: str, dst: str, msg: dict) -> None:
        self.packets_sent += 1
        self.sim_time += max(self.network_delay, 0.01)
        if self._drop_next_from in {src, None} and self._drop_next_from is not None:
            if src == self._drop_next_from:
                self._drop_next_from = None
                return
        source = self.members[src]
        dest = self.members[dst]
        if source.isolated or dest.isolated:
            return
        if self.rng.random() < self.loss:
            return
        payload = json.dumps(msg).encode()
        if self.network_delay:
            await asyncio.sleep(self.network_delay)
        if self.enable_udp and src in self._transports and dst in self._addrs:
            try:
                self._transports[src].sendto(payload, self._addrs[dst])
                return
            except OSError:
                pass
        await self.mailboxes[dst].put(payload)

    async def _dispatch_loop(self, node_id: str) -> None:
        mailbox = self.mailboxes[node_id]
        while not self._closed:
            try:
                payload = await mailbox.get()
            except asyncio.CancelledError:
                return
            if self._closed:
                return
            try:
                msg = json.loads(payload.decode() if isinstance(payload, (bytes, bytearray)) else payload)
            except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
                continue
            if not isinstance(msg, dict) or "kind" not in msg:
                continue
            await self._handle(node_id, msg)

    async def _handle(self, node_id: str, msg: dict) -> None:
        member = self.members[node_id]
        sender = msg.get("from")
        piggybacks = msg.get("piggybacks") or []
        if (
            piggybacks
            and member.process_state is ProcessState.RUNNING
            and node_id not in self._silent_nodes
        ):
            self._apply_piggybacks(node_id, piggybacks, sender)
        if node_id in self._pending_refutes:
            self._pending_refutes.discard(node_id)
            await self._refute(member)
        kind = msg.get("kind")
        if kind in {"ack", "ack_fwd"}:
            seq = msg.get("seq")
            local_waiter = self._waiters.get((node_id, seq))
            if local_waiter is not None and not local_waiter.done():
                local_waiter.set_result(msg)
            if msg.get("purpose") != "infection":
                self._emit(
                    EventType.ACK,
                    source=sender,
                    target=node_id,
                    outcome="forwarded" if kind == "ack_fwd" else "success",
                    detail=(
                        f"{sender} forwarded an ACK for the original probe to {node_id}."
                        if kind == "ack_fwd"
                        else f"ACK received in time. {sender} is alive."
                    ),
                    piggybacked=[_item_from_dict(item).label() for item in piggybacks],
                )
            return
        if member.process_state is ProcessState.CRASHED or member.frozen:
            return
        if kind == "ping":
            if node_id in self._silent_nodes or node_id in self._mute_acks:
                return
            reply_piggy = self._take_buffer(member)
            await self._send(
                node_id,
                sender,
                {
                    "kind": "ack",
                    "seq": msg.get("seq"),
                    "from": node_id,
                    "to": sender,
                    "origin": msg.get("origin") or sender,
                    "purpose": msg.get("purpose"),
                    "piggybacks": reply_piggy,
                },
            )
            return
        if kind == "ping_req":
            await self._handle_ping_req(member, msg)

    async def _handle_ping_req(self, helper: LiveMember, msg: dict) -> None:
        target_id = msg.get("probe_target")
        origin = msg.get("origin")
        seq = msg.get("seq")
        if not target_id or not origin:
            return
        self._emit(
            EventType.HELPER_PING,
            source=helper.node_id,
            target=target_id,
            outcome="sent",
            detail=f"Helper {helper.node_id} pinged {target_id} on behalf of {origin}.",
        )
        waiter = self._register_waiter(helper.node_id, seq)
        await self._send(
            helper.node_id,
            target_id,
            {
                "kind": "ping",
                "seq": seq,
                "from": helper.node_id,
                "to": target_id,
                "origin": origin,
                "indirect": True,
                "piggybacks": self._take_buffer(helper),
            },
        )
        ack = await self._await_waiter(waiter, self._direct_timeout(helper))
        if not ack:
            return
        await self._send(
            helper.node_id,
            origin,
            {
                "kind": "ack_fwd",
                "seq": seq,
                "from": helper.node_id,
                "to": origin,
                "origin": origin,
                "probe_target": target_id,
                "piggybacks": self._take_buffer(helper),
            },
        )

    def _register_waiter(self, waiter_id: str, seq: int) -> asyncio.Future:
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._waiters[(waiter_id, seq)] = future
        return future

    async def _await_waiter(self, future: asyncio.Future, timeout: float) -> dict | None:
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            for key, pending in list(self._waiters.items()):
                if pending is future:
                    self._waiters.pop(key, None)

    async def _bind_udp(self) -> None:
        for node_id in self.member_ids:
            await self._bind_one_udp(node_id)

    async def _bind_one_udp(self, node_id: str) -> None:
        loop = asyncio.get_running_loop()
        mailbox = self.mailboxes[node_id]
        transport, _protocol = await loop.create_datagram_endpoint(
            lambda box=mailbox: _UdpProtocol(box),
            local_addr=("127.0.0.1", 0),
        )
        sockname = transport.get_extra_info("sockname")
        self._transports[node_id] = transport
        self._addrs[node_id] = ("127.0.0.1", sockname[1])
        self.udp_ports[node_id] = sockname[1]

    async def _pause(self) -> None:
        if self.step_delay > 0:
            await asyncio.sleep(self.step_delay)
        else:
            await asyncio.sleep(0)

    def _emit(
        self,
        event_type: EventType,
        outcome: str,
        source: str | None = None,
        target: str | None = None,
        detail: str = "",
        membership_update: MembershipUpdate | None = None,
        piggybacked: list[str] | None = None,
    ) -> ProtocolEvent:
        self.event_seq += 1
        event = ProtocolEvent(
            event_id=f"live-{self.event_seq:04d}",
            sim_time=round(self.sim_time, 3),
            protocol_period=self.protocol_period,
            event_type=event_type,
            source_node=source,
            target_node=target,
            outcome=outcome,
            membership_update=membership_update,
            detail=detail,
            piggybacked=piggybacked or [],
        )
        self.events.append(event)
        try:
            log_event(self.session_id, event)
        except OSError:
            pass
        if self.on_event is not None:
            self.on_event(event, self.snapshot())
        return event

    def _require_member(self, node_id: str) -> LiveMember:
        member = self.members.get(node_id)
        if member is None:
            raise InvalidLiveActionError(f"Unknown node '{node_id}'.")
        return member

    def _view_status(self, observer_id: str, subject_id: str) -> MemberStatus:
        entry = self.members[observer_id].local_view.get(subject_id)
        return entry.status if entry else MemberStatus.ALIVE

    def _display_status(self, node_id: str) -> MemberStatus:
        member = self.members[node_id]
        views = [
            observer.local_view[node_id]
            for observer in self.members.values()
            if node_id in observer.local_view
        ]
        if any(entry.status is MemberStatus.FAILED for entry in views):
            return MemberStatus.FAILED
        max_alive = max(
            (entry.incarnation for entry in views if entry.status is MemberStatus.ALIVE),
            default=-1,
        )
        max_suspect = max(
            (entry.incarnation for entry in views if entry.status is MemberStatus.SUSPECTED),
            default=-1,
        )
        if max_suspect >= 0 and max_alive <= max_suspect:
            return MemberStatus.SUSPECTED
        if member.process_state is ProcessState.CRASHED:
            return MemberStatus.ALIVE
        return MemberStatus.ALIVE

    def _node_snapshot(self, member: LiveMember) -> NodeSnapshot:
        return NodeSnapshot(
            node_id=member.node_id,
            process_state=member.process_state,
            display_status=self._display_status(member.node_id),
            incarnation=member.incarnation,
            position=member.position,
            local_view=list(member.local_view.values()),
        )

    def _knowers(self) -> list[str]:
        if self.latest_subject is None or self.latest_status is None:
            return []
        return [
            member.node_id
            for member in self.members.values()
            if member.local_view.get(self.latest_subject)
            and member.local_view[self.latest_subject].status is self.latest_status
        ]

    def _latest_label(self) -> str | None:
        if self.latest_subject is None or self.latest_status is None:
            return None
        return f"{self.latest_status.value}:{self.latest_subject}"

    def _convergence(self) -> float:
        if self.latest_subject is None or self.latest_status is None:
            return 1.0
        knowers = len(self._knowers())
        return round(knowers / max(len(self.member_ids), 1), 3)

    async def _drain(self) -> None:
        await self._pause()
        await asyncio.sleep(0)
        await asyncio.sleep(0)

    def _probers(self) -> list[LiveMember]:
        return [
            member
            for member in self.members.values()
            if member.process_state is ProcessState.RUNNING and not member.frozen and not member.isolated
        ]

    def _join_contact(self, contact_id: str | None) -> LiveMember:
        if contact_id:
            contact = self._require_member(contact_id)
            if contact.process_state is ProcessState.CRASHED or contact.isolated:
                raise InvalidLiveActionError(f"{contact_id} cannot accept a join.")
            return contact
        candidates = [
            member
            for member in self.members.values()
            if member.process_state is ProcessState.RUNNING and not member.isolated and not member.frozen
        ]
        if not candidates:
            raise InvalidLiveActionError("No running member can accept a join.")
        return self.rng.choice(candidates)

    def _allocate_id(self) -> str:
        existing = set(self.member_ids)
        index = 0
        while f"n{index}" in existing:
            index += 1
        return f"n{index}"

    def _relayout(self) -> None:
        positions = _circular_layout(self.member_ids)
        for node_id, member in self.members.items():
            member.position = positions[node_id]
        self.overlay_edges = [
            (self.member_ids[index], self.member_ids[(index + 1) % len(self.member_ids)])
            for index in range(len(self.member_ids))
        ]

    def _reset_probe_orders(self) -> None:
        for member in self.members.values():
            others = [node_id for node_id in self.member_ids if node_id != member.node_id]
            member.probe_order = others[:]
            self.rng.shuffle(member.probe_order)
            member.probe_index = 0

    def _next_target(self, source: LiveMember) -> LiveMember | None:
        skip_failed = {
            node_id
            for node_id, entry in source.local_view.items()
            if entry.status is MemberStatus.FAILED
        }
        if self.probe_mode == "random":
            options = [
                node_id
                for node_id in self.member_ids
                if node_id != source.node_id and node_id not in skip_failed
            ]
            if not options:
                return None
            return self.members[self.rng.choice(options)]
        order = source.probe_order or [node_id for node_id in self.member_ids if node_id != source.node_id]
        if not order:
            return None
        if source.probe_index >= len(order):
            self.rng.shuffle(order)
            source.probe_order = order
            source.probe_index = 0
        for _ in range(len(order)):
            if source.probe_index >= len(order):
                self.rng.shuffle(order)
                source.probe_order = order
                source.probe_index = 0
            candidate = order[source.probe_index]
            source.probe_index += 1
            if candidate in self.members and candidate not in skip_failed:
                return self.members[candidate]
        return None

    def _next_targets_preview(self) -> dict[str, str]:
        preview: dict[str, str] = {}
        for member in self._probers():
            hit = self._next_probe_offset(member)
            if hit is not None:
                preview[member.node_id] = hit[0]
        return preview

    def _next_probe_offset(self, source: LiveMember) -> tuple[str, int] | None:
        skip_failed = {
            node_id
            for node_id, entry in source.local_view.items()
            if entry.status is MemberStatus.FAILED
        }
        order = source.probe_order or [node_id for node_id in self.member_ids if node_id != source.node_id]
        if not order:
            return None
        index = source.probe_index % len(order)
        for offset in range(len(order)):
            candidate = order[(index + offset) % len(order)]
            if candidate in self.members and candidate not in skip_failed:
                return candidate, offset
        return None

    def _probe_deadlines(self) -> tuple[dict[str, int], dict[str, str]]:
        deadlines: dict[str, int] = {}
        deadline_by: dict[str, str] = {}
        for subject_id in self.member_ids:
            best_periods: int | None = None
            best_prober: str | None = None
            for source in self._probers():
                if source.node_id == subject_id:
                    continue
                skip_failed = {
                    node_id
                    for node_id, entry in source.local_view.items()
                    if entry.status is MemberStatus.FAILED
                }
                if subject_id in skip_failed:
                    continue
                order = source.probe_order or [
                    node_id for node_id in self.member_ids if node_id != source.node_id
                ]
                if not order or subject_id not in order:
                    continue
                index = source.probe_index % len(order)
                try:
                    position = order.index(subject_id)
                except ValueError:
                    continue
                periods = (position - index) % len(order)
                if best_periods is None or periods < best_periods:
                    best_periods = periods
                    best_prober = source.node_id
            if best_periods is not None and best_prober is not None:
                deadlines[subject_id] = best_periods
                deadline_by[subject_id] = best_prober
        return deadlines, deadline_by


def _item_from_dict(raw: dict) -> GossipItem:
    return GossipItem(
        kind=str(raw.get("kind", "alive")),
        node_id=str(raw.get("node_id", "")),
        incarnation=int(raw.get("incarnation", 0)),
        count=int(raw.get("count", 0)),
        born=int(raw.get("born", 0)),
    )


def _circular_layout(node_ids: list[str]) -> dict[str, Position]:
    count = max(len(node_ids), 1)
    return {
        node_id: Position(
            x=round(LAYOUT_RADIUS * math.cos(2 * math.pi * index / count - math.pi / 2), 2),
            y=round(LAYOUT_RADIUS * math.sin(2 * math.pi * index / count - math.pi / 2), 2),
        )
        for index, node_id in enumerate(node_ids)
    }
