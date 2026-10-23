from dataclasses import dataclass, field

from app.models.api import ScenarioCardModel
from app.simulation.capabilities import ENGINE_CAPABILITIES


@dataclass(frozen=True)
class ScenarioSpec:
    definition: ScenarioCardModel
    node_count: int = 6
    probe_source: str = "n0"
    probe_target: str = "n1"
    ping_at: float = 0.0
    crash_node: str | None = None
    crash_at: float = 0.0
    ack_delays: dict[str, float] = field(default_factory=dict)
    limitations: tuple[str, ...] = ()


def _unimplemented(required: list[str]) -> list[str]:
    return [name for name in required if not ENGINE_CAPABILITIES.get(name, False)]


SUCCESSFUL_PROBE = ScenarioSpec(
    definition=ScenarioCardModel(
        id="successful_probe",
        title="Successful Probe",
        difficulty="beginner",
        objective="Show a healthy member answering a direct SWIM probe.",
        expected_observation="n0 sends PING to n1 and receives ACK before the probe timeout.",
        required_capabilities=["direct_ping_ack"],
        unimplemented_capabilities=_unimplemented(["direct_ping_ack"]),
    ),
    probe_source="n0",
    probe_target="n1",
    ping_at=0.0,
)

SUSPICION_RECOVERY = ScenarioSpec(
    definition=ScenarioCardModel(
        id="suspicion_recovery",
        title="Suspicion and Recovery",
        difficulty="intermediate",
        objective="Show a missed probe, a suspicion update, and recovery from a valid late ACK.",
        expected_observation=(
            "n0 probes n2, the ACK is delayed past the probe timeout, n0 marks n2 "
            "suspected, then the delayed ACK restores n2 to alive before failure confirmation."
        ),
        required_capabilities=[
            "direct_ping_ack",
            "simulated_timeouts",
            "suspicion_and_recovery",
            "indirect_ping_req",
            "incarnation_precedence",
        ],
        unimplemented_capabilities=_unimplemented(
            [
                "direct_ping_ack",
                "simulated_timeouts",
                "suspicion_and_recovery",
                "indirect_ping_req",
                "incarnation_precedence",
            ]
        ),
    ),
    probe_source="n0",
    probe_target="n2",
    ping_at=0.0,
    ack_delays={"n2": 8.0},
    limitations=(
        "Indirect PING-REQ probing is not implemented; suspicion is based only on a missed direct ACK.",
        "Incarnation-number refutation is not implemented; recovery happens because a delayed direct ACK arrived before failure confirmation.",
    ),
)

CRASH_AND_CONVERGENCE = ScenarioSpec(
    definition=ScenarioCardModel(
        id="crash_and_convergence",
        title="Crash and Convergence",
        difficulty="advanced",
        objective="Show crash detection and the membership divergence that gossip would later repair.",
        expected_observation=(
            "n4 crashes, n0's direct probe times out, n0 suspects then confirms n4 as failed. "
            "Other members still list n4 as alive because dissemination is not implemented."
        ),
        required_capabilities=[
            "direct_ping_ack",
            "simulated_timeouts",
            "failure_confirmation",
            "gossip_dissemination",
            "convergence_metrics",
        ],
        unimplemented_capabilities=_unimplemented(
            [
                "direct_ping_ack",
                "simulated_timeouts",
                "failure_confirmation",
                "gossip_dissemination",
                "convergence_metrics",
            ]
        ),
    ),
    probe_source="n0",
    probe_target="n4",
    ping_at=1.0,
    crash_node="n4",
    crash_at=0.0,
    limitations=(
        "Indirect PING-REQ probing is not implemented.",
        "Gossip and piggybacked membership dissemination are not implemented, so only the probing node's local view is updated.",
        "Membership convergence is not measured; the snapshot reports it as not measured.",
    ),
)

SCENARIOS: dict[str, ScenarioSpec] = {
    spec.definition.id: spec
    for spec in (SUCCESSFUL_PROBE, SUSPICION_RECOVERY, CRASH_AND_CONVERGENCE)
}


def list_scenarios() -> list[ScenarioCardModel]:
    return [spec.definition for spec in SCENARIOS.values()]


def list_scenario_ids() -> list[str]:
    return list(SCENARIOS.keys())


def get_scenario(scenario_id: str) -> ScenarioSpec | None:
    return SCENARIOS.get(scenario_id)
