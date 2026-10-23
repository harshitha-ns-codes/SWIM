from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Union

from app.errors import SessionNotFoundError, UnknownScenarioError
from app.models.domain import ProtocolEvent, Snapshot
from app.simulation.engine import SimulationEngine, SimulationSession
from app.simulation.live import LiveCluster
from app.simulation.scenarios import get_scenario, list_scenario_ids

AnySession = Union[SimulationSession, LiveCluster]


class SessionManager:
    """In-memory owner of simulation sessions.

    Overview scenario sessions and the live cluster are stored separately so
    starting a live probe does not overwrite a guided Overview run.
    """

    def __init__(self, engine: SimulationEngine | None = None) -> None:
        self._engine = engine or SimulationEngine()
        self._sessions: dict[str, AnySession] = {}
        self._current_session_id: str | None = None
        self._live_session_id: str | None = None
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def start_scenario(self, scenario_id: str) -> SimulationSession:
        spec = get_scenario(scenario_id)
        if spec is None:
            raise UnknownScenarioError(scenario_id, list_scenario_ids())
        session = self._engine.run_scenario(spec)
        self._sessions[session.session_id] = session
        self._current_session_id = session.session_id
        return session

    async def start_live(
        self,
        member_count: int = 8,
        k_helpers: int = 3,
        enable_udp: bool = True,
        animation_ms: int = 280,
    ) -> LiveCluster:
        if self._live_session_id:
            previous = self._sessions.get(self._live_session_id)
            if isinstance(previous, LiveCluster):
                await previous.close()
        cluster = LiveCluster(
            member_count=member_count,
            k_helpers=k_helpers,
            enable_udp=enable_udp,
            animation_ms=animation_ms,
        )
        cluster.on_event = lambda event, snapshot: self.publish(cluster.session_id, event, snapshot)
        await cluster.start()
        self._sessions[cluster.session_id] = cluster
        self._live_session_id = cluster.session_id
        return cluster

    def live(self) -> LiveCluster | None:
        if self._live_session_id is None:
            return None
        session = self._sessions.get(self._live_session_id)
        return session if isinstance(session, LiveCluster) else None

    def get_live(self, session_id: str) -> LiveCluster:
        session = self.get(session_id)
        if not isinstance(session, LiveCluster):
            raise SessionNotFoundError(session_id)
        return session

    def get(self, session_id: str) -> AnySession:
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        return session

    def get_or_none(self, session_id: str) -> AnySession | None:
        return self._sessions.get(session_id)

    def current(self) -> SimulationSession | None:
        if self._current_session_id is None:
            return None
        session = self._sessions.get(self._current_session_id)
        return session if isinstance(session, SimulationSession) else None

    def subscribe(self, session_id: str) -> asyncio.Queue:
        self.get(session_id)
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[session_id].add(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue) -> None:
        subscribers = self._subscribers.get(session_id)
        if not subscribers:
            return
        subscribers.discard(queue)
        if not subscribers:
            self._subscribers.pop(session_id, None)

    def publish(self, session_id: str, event: ProtocolEvent, snapshot: Snapshot) -> None:
        message = {
            "type": "event",
            "event": event.model_dump(mode="json"),
            "snapshot": snapshot.model_dump(mode="json"),
        }
        for queue in list(self._subscribers.get(session_id, set())):
            queue.put_nowait(message)
