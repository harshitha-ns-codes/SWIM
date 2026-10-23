from app.simulation.engine import SimulationEngine
from app.simulation.scenarios import get_scenario


def test_engine_is_deterministic_for_successful_probe() -> None:
    engine = SimulationEngine()
    spec = get_scenario("successful_probe")
    assert spec is not None
    first = engine.run_scenario(spec)
    second = engine.run_scenario(spec)
    first_types = [event.event_type.value for event in first.events]
    second_types = [event.event_type.value for event in second.events]
    assert first_types == second_types
    assert first.snapshot().metrics.model_dump() == second.snapshot().metrics.model_dump()


def test_successful_probe_does_not_mark_failure() -> None:
    spec = get_scenario("successful_probe")
    assert spec is not None
    session = SimulationEngine().run_scenario(spec)
    snapshot = session.snapshot()
    assert snapshot.metrics.failed_members == 0
    assert snapshot.status.value == "completed"
