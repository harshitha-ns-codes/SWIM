# Protocol scope (milestone 1)

## Implemented and tested

- Deterministic demo cluster initialization
- Server-owned in-memory simulation sessions
- Simulated clock and discrete-event queue
- Direct PING / ACK
- Probe timeouts
- Local suspicion after a missed direct ACK
- Recovery when a delayed ACK arrives before failure confirmation
- Local failure confirmation after the suspicion timeout
- Snapshot metrics derived from engine state
- Honest limitation reporting when a scenario needs unimplemented behavior

## Not implemented

- Indirect PING-REQ probing
- Incarnation-number update precedence / refute
- Piggybacked membership updates
- Gossip dissemination
- Membership convergence measurement
- Pause, replay, and acceleration controls
- PostgreSQL persistence
- Live Simulator stepping UI
- Experiments
- How SWIM Works explainer content

Membership convergence is returned as `null` and must be shown as **Not measured**.
