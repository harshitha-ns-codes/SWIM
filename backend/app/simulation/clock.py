from dataclasses import dataclass, field
import heapq
from typing import Any, NamedTuple


class ScheduledEvent(NamedTuple):
    time: float
    seq: int
    kind: str
    payload: dict[str, Any]


@dataclass
class SimulatedClock:
    """Monotonic simulated time used by the discrete-event engine.

    Wall-clock speed, pause, and replay can later wrap this clock without
    changing protocol logic.
    """

    now: float = 0.0
    period: int = 0
    _seq: int = 0
    _queue: list[ScheduledEvent] = field(default_factory=list)

    def advance_to(self, time: float) -> None:
        if time < self.now:
            raise ValueError(f"Cannot move simulated time backwards from {self.now} to {time}")
        self.now = time

    def schedule(self, delay: float, kind: str, payload: dict[str, Any] | None = None) -> int:
        if delay < 0:
            raise ValueError("delay must be >= 0")
        self._seq += 1
        event = ScheduledEvent(self.now + delay, self._seq, kind, payload or {})
        heapq.heappush(self._queue, event)
        return self._seq

    def pop_next(self) -> ScheduledEvent | None:
        if not self._queue:
            return None
        event = heapq.heappop(self._queue)
        self.advance_to(event.time)
        return event

    def has_events(self) -> bool:
        return bool(self._queue)
