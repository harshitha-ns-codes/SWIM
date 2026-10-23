"""Honest capability flags for the milestone-1 engine.

True means the engine actually executes that behavior during a scenario.
False means callers must not claim the behavior ran.
"""

ENGINE_CAPABILITIES: dict[str, bool] = {
    "direct_ping_ack": True,
    "indirect_ping_req": False,
    "simulated_timeouts": True,
    "suspicion_and_recovery": True,
    "incarnation_precedence": False,
    "piggybacked_updates": False,
    "failure_confirmation": True,
    "gossip_dissemination": False,
    "convergence_metrics": False,
}

CAPABILITY_NOTES: dict[str, str] = {
    "direct_ping_ack": "Direct PING/ACK probing is implemented on a simulated clock.",
    "indirect_ping_req": "Indirect PING-REQ probing is not implemented.",
    "simulated_timeouts": "Probe and suspicion timeouts are discrete simulated-time events.",
    "suspicion_and_recovery": (
        "A missed direct ACK marks the target suspected; a later valid ACK "
        "restores alive in the observer's local view. This is not the full SWIM refute path."
    ),
    "incarnation_precedence": "Incarnation numbers exist on records but precedence rules are not applied.",
    "piggybacked_updates": "Membership updates are not piggybacked on protocol messages.",
    "failure_confirmation": (
        "If suspicion is not cleared before the confirmation timeout, the observer "
        "marks the target failed in its local view only."
    ),
    "gossip_dissemination": "Gossip dissemination of membership updates is not implemented.",
    "convergence_metrics": "Membership-view agreement is not computed; the API returns null.",
}
