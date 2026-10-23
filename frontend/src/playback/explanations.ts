import type { ProtocolEvent, ScenarioDefinition, Snapshot } from '../types/simulation'
import type { PlaybackFrame } from './replay'

export function explainEvent(
  event: ProtocolEvent | null,
  snapshot: Snapshot | null,
): { title: string; happening: string } {
  if (!event) {
    return {
      title: 'Waiting for a scenario',
      happening: 'Run a guided scenario to load a server-owned event log. Playback uses only backend-recorded events.',
    }
  }

  const from = event.source_node ?? '—'
  const to = event.target_node ?? '—'
  const update = event.membership_update

  switch (event.event_type) {
    case 'session_started':
      return {
        title: 'Session created',
        happening: event.detail || 'The backend created an in-memory simulation session.',
      }
    case 'cluster_initialized':
      return {
        title: 'Demo cluster ready',
        happening: event.detail || 'A deterministic demo cluster was initialized. Every member currently sees every other member as alive.',
      }
    case 'node_crashed':
      return {
        title: `${to} crashed`,
        happening: `${to} is now crashed in process ground truth. Other members have not been told yet; their local views still list ${to} as alive until a probe fails.`,
      }
    case 'ping':
      return {
        title: `PING ${from} → ${to}`,
        happening: `${from} sent a direct SWIM PING to ${to}. Watch the PING travel along that edge. This is not an indirect PING-REQ.`,
      }
    case 'ack':
      return {
        title: `ACK ${from} → ${to}`,
        happening:
          update && update.new_status === 'alive' && update.previous_status === 'suspected'
            ? `${from} delivered a delayed ACK to ${to}. ${to} restored ${from} to alive in its local view because the ACK arrived before failure confirmation.`
            : `${from} acknowledged the PING. ${to} keeps ${from} as alive in its local membership view.`,
      }
    case 'ping_req':
      return {
        title: `PING-REQ ${from} → ${to}`,
        happening: event.detail || `${from} sent an indirect PING-REQ toward ${to}.`,
      }
    case 'helper_ping':
      return {
        title: `Helper PING ${from} → ${to}`,
        happening: event.detail || `Helper ${from} pinged ${to} on behalf of the original probe.`,
      }
    case 'piggyback':
      return {
        title: update
          ? `${update.observer_id} learned ${update.node_id} is ${update.new_status}`
          : `Piggyback ${from} → ${to}`,
        happening: event.detail
          || (update
            ? `${update.observer_id} applied a piggybacked membership update: ${update.node_id} ${update.previous_status} → ${update.new_status}. Infection-style gossip does not use extra broadcast packets.`
            : `${from} piggybacked a membership update to ${to}.`),
      }
    case 'timeout':
      return {
        title: `Probe timeout ${from} → ${to}`,
        happening: `No ACK arrived before the simulated probe timeout. ${from} has not yet confirmed failure; SWIM would now suspect ${to} in ${from}'s local view if a suspicion event follows.`,
      }
    case 'suspected':
      return {
        title: `${update?.observer_id ?? from} suspects ${update?.node_id ?? to}`,
        happening: update
          ? `${update.observer_id} updated its local view: ${update.node_id} ${update.previous_status} → ${update.new_status}. This is only ${update.observer_id}'s membership table, not cluster-wide agreement.`
          : event.detail,
      }
    case 'recovered':
      return {
        title: `${update?.node_id ?? to} recovered`,
        happening: update
          ? `${update.observer_id} restored ${update.node_id} to alive after a valid ACK. Incarnation-number refute is not applied in this engine.`
          : event.detail,
      }
    case 'failed':
      return {
        title: `${update?.observer_id ?? from} confirmed ${update?.node_id ?? to} failed`,
        happening: update
          ? `${update.observer_id} marked ${update.node_id} failed in its local view. Other members keep their previous view unless a later dissemination event exists.`
          : event.detail,
      }
    case 'scenario_completed':
      return {
        title: 'Scenario complete',
        happening: event.detail || 'The recorded event sequence finished using implemented direct-probe behavior.',
      }
    case 'scenario_limited':
      return {
        title: 'Completed with limitations',
        happening:
          snapshot?.limitations.length
            ? `The engine ran the implemented subset. ${snapshot.limitations.join(' ')}`
            : event.detail,
      }
  }
}

export function whatToObserve(
  scenario: ScenarioDefinition | undefined,
  snapshot: Pick<Snapshot, 'metrics'> | null,
): string[] {
  if (!scenario) {
    return ['Start a guided scenario to see the recorded protocol sequence.']
  }
  const notes = [scenario.expected_observation]
  if (scenario.unimplemented_capabilities.includes('indirect_ping_req')) {
    notes.push('Indirect PING-REQ probing is not in this event log.')
  }
  if (scenario.unimplemented_capabilities.includes('gossip_dissemination')) {
    notes.push('Do not expect every node to agree on failure; gossip dissemination is not implemented.')
  }
  if (snapshot?.metrics.membership_convergence == null) {
    notes.push('Membership convergence is not measured.')
  }
  return notes
}

export function localDetectionWithoutGossip(
  snapshot: Pick<Snapshot, 'capabilities'> | null,
  events: ProtocolEvent[],
  currentIndex: number,
): boolean {
  if (!snapshot || snapshot.capabilities.gossip_dissemination) {
    return false
  }
  const applied = events.slice(0, currentIndex + 1)
  return applied.some((event) => event.event_type === 'failed')
}

export function observerViewStatus(
  frame: PlaybackFrame | null,
  observerId: string,
  targetId: string,
): string | null {
  const observer = frame?.nodes.find((node) => node.node_id === observerId)
  return observer?.local_view.find((entry) => entry.node_id === targetId)?.status ?? null
}
