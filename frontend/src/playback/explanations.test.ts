import { describe, expect, it } from 'vitest'
import type { ProtocolEvent, ScenarioDefinition, Snapshot } from '../types/simulation'
import { explainEvent, localDetectionWithoutGossip, whatToObserve } from './explanations'
import { replayTo } from './replay'

const scenario: ScenarioDefinition = {
  id: 'crash_and_convergence',
  title: 'Crash and Convergence',
  difficulty: 'advanced',
  objective: 'Show crash detection',
  expected_observation: 'n4 crashes and n0 confirms failure locally.',
  required_capabilities: ['gossip_dissemination'],
  unimplemented_capabilities: ['gossip_dissemination', 'indirect_ping_req'],
}

function pingEvent(): ProtocolEvent {
  return {
    event_id: 'evt-0004',
    sim_time: 1,
    protocol_period: 1,
    event_type: 'ping',
    source_node: 'n0',
    target_node: 'n1',
    outcome: 'sent',
    membership_update: null,
    detail: 'n0 sent a direct PING to n1.',
  }
}

describe('explainEvent', () => {
  it('describes the recorded PING endpoints without inventing an ACK', () => {
    const text = explainEvent(pingEvent(), null)
    expect(text.title).toContain('n0')
    expect(text.title).toContain('n1')
    expect(text.happening.toLowerCase()).toContain('ping')
    expect(text.happening.toLowerCase()).not.toContain('acknowled')
  })

  it('keeps limitation text tied to the snapshot limitations', () => {
    const snapshot = {
      limitations: ['Gossip and piggybacked membership dissemination are not implemented.'],
      capabilities: { gossip_dissemination: false },
    } as unknown as Snapshot
    const text = explainEvent(
      {
        event_id: 'evt-lim',
        sim_time: 16,
        protocol_period: 1,
        event_type: 'scenario_limited',
        source_node: null,
        target_node: null,
        outcome: 'completed_with_limitations',
        membership_update: null,
        detail: 'limited',
      },
      snapshot,
    )
    expect(text.happening).toContain('Gossip')
  })
})

describe('whatToObserve', () => {
  it('states gossip and convergence gaps from the scenario definition', () => {
    const notes = whatToObserve(scenario, {
      metrics: {
        total_members: 6,
        alive_members: 5,
        suspected_members: 0,
        failed_members: 1,
        protocol_messages: 1,
        membership_convergence: null,
      },
    })
    expect(notes[0]).toContain('n4 crashes')
    expect(notes.some((note) => note.toLowerCase().includes('gossip'))).toBe(true)
    expect(notes.some((note) => note.toLowerCase().includes('not measured'))).toBe(true)
  })
})

describe('localDetectionWithoutGossip', () => {
  it('is true only after a recorded local failure event when gossip is off', () => {
    const snapshot = {
      capabilities: { gossip_dissemination: false },
    }
    const events: ProtocolEvent[] = [
      pingEvent(),
      {
        ...pingEvent(),
        event_id: 'evt-fail',
        event_type: 'failed',
      },
    ]
    expect(localDetectionWithoutGossip(snapshot, events, 0)).toBe(false)
    expect(localDetectionWithoutGossip(snapshot, events, 1)).toBe(true)
    expect(localDetectionWithoutGossip({ capabilities: { gossip_dissemination: true } }, events, 1)).toBe(false)
  })
})

describe('replay and explanation stay aligned', () => {
  it('does not create a packet for timeout events', () => {
    const nodes = ['n0', 'n1'].map((node_id, index) => ({
      node_id,
      process_state: 'running' as const,
      display_status: 'alive' as const,
      incarnation: 0,
      position: { x: index, y: 0 },
      local_view: [],
    }))
    const snap = {
      session_id: 's',
      scenario_id: 'successful_probe',
      scenario_title: 'Successful Probe',
      status: 'completed',
      demo_cluster: true,
      persistence: 'in-memory',
      sim_time: 1,
      protocol_period: 1,
      nodes,
      edges: [],
      metrics: {
        total_members: 2,
        alive_members: 2,
        suspected_members: 0,
        failed_members: 0,
        protocol_messages: 0,
        membership_convergence: null,
      },
      limitations: [],
      active_probe: null,
      capabilities: {},
    } as unknown as Snapshot
    const timeout: ProtocolEvent = {
      event_id: 'evt-t',
      sim_time: 5,
      protocol_period: 1,
      event_type: 'timeout',
      source_node: 'n0',
      target_node: 'n1',
      outcome: 'expired',
      membership_update: null,
      detail: 'timed out',
    }
    const frame = replayTo(snap, [timeout], 0)
    expect(frame.packet).toBeNull()
    expect(frame.highlightEdge).toEqual({ source: 'n0', target: 'n1' })
  })
})
