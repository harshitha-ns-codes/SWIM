import { describe, expect, it } from 'vitest'
import type { ProtocolEvent, Snapshot } from '../types/simulation'
import { applyEvent, eventKind, firstVisibleEventIndex, replayTo } from './replay'

function snapshot(): Snapshot {
  const ids = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']
  return {
    session_id: 'session-a',
    scenario_id: 'crash_and_convergence',
    scenario_title: 'Crash and Convergence',
    status: 'completed_with_limitations',
    demo_cluster: true,
    persistence: 'in-memory',
    sim_time: 16,
    protocol_period: 1,
    nodes: ids.map((node_id, index) => ({
      node_id,
      process_state: node_id === 'n4' ? 'crashed' : 'running',
      display_status: node_id === 'n4' ? 'failed' : 'alive',
      incarnation: 0,
      position: { x: index, y: 0 },
      local_view: ids
        .filter((other) => other !== node_id)
        .map((other) => ({
          node_id: other,
          status: node_id === 'n0' && other === 'n4' ? 'failed' : 'alive',
          incarnation: 0,
        })),
    })),
    edges: [{ source: 'n0', target: 'n1', kind: 'overlay', active: false }],
    metrics: {
      total_members: 6,
      alive_members: 5,
      suspected_members: 0,
      failed_members: 1,
      protocol_messages: 1,
      membership_convergence: null,
    },
    limitations: ['Gossip is not implemented.'],
    active_probe: { source: 'n0', target: 'n4', outcome: 'timeout' },
    capabilities: {
      direct_ping_ack: true,
      gossip_dissemination: false,
      convergence_metrics: false,
    },
  }
}

function event(partial: Partial<ProtocolEvent> & Pick<ProtocolEvent, 'event_id' | 'event_type'>): ProtocolEvent {
  return {
    sim_time: 0,
    protocol_period: 0,
    source_node: null,
    target_node: null,
    outcome: 'ok',
    membership_update: null,
    detail: '',
    ...partial,
  }
}

const crashEvents: ProtocolEvent[] = [
  event({ event_id: 'evt-0001', event_type: 'session_started' }),
  event({ event_id: 'evt-0002', event_type: 'cluster_initialized' }),
  event({ event_id: 'evt-0003', event_type: 'node_crashed', target_node: 'n4', sim_time: 0 }),
  event({ event_id: 'evt-0004', event_type: 'ping', source_node: 'n0', target_node: 'n4', sim_time: 1 }),
  event({ event_id: 'evt-0005', event_type: 'timeout', source_node: 'n0', target_node: 'n4', sim_time: 6 }),
  event({
    event_id: 'evt-0006',
    event_type: 'suspected',
    source_node: 'n0',
    target_node: 'n4',
    sim_time: 6,
    membership_update: {
      observer_id: 'n0',
      node_id: 'n4',
      previous_status: 'alive',
      new_status: 'suspected',
      incarnation: 0,
    },
  }),
  event({
    event_id: 'evt-0007',
    event_type: 'failed',
    source_node: 'n0',
    target_node: 'n4',
    sim_time: 16,
    membership_update: {
      observer_id: 'n0',
      node_id: 'n4',
      previous_status: 'suspected',
      new_status: 'failed',
      incarnation: 0,
    },
  }),
]

describe('replayTo', () => {
  it('starts from a healthy cluster, ignoring the final snapshot membership', () => {
    const frame = replayTo(snapshot(), crashEvents, 1)
    const n4 = frame.nodes.find((node) => node.node_id === 'n4')
    expect(n4?.process_state).toBe('running')
    expect(n4?.display_status).toBe('alive')
    expect(frame.metrics.failed_members).toBe(0)
    expect(frame.metrics.membership_convergence).toBeNull()
  })

  it('applies a crash as ground truth without changing other local views', () => {
    const frame = replayTo(snapshot(), crashEvents, 2)
    const n4 = frame.nodes.find((node) => node.node_id === 'n4')
    const n0 = frame.nodes.find((node) => node.node_id === 'n0')
    const n1 = frame.nodes.find((node) => node.node_id === 'n1')
    expect(n4?.process_state).toBe('crashed')
    expect(n4?.display_status).toBe('alive')
    expect(n0?.local_view.find((entry) => entry.node_id === 'n4')?.status).toBe('alive')
    expect(n1?.local_view.find((entry) => entry.node_id === 'n4')?.status).toBe('alive')
  })

  it('animates a PING packet only when a ping event is selected', () => {
    const frame = replayTo(snapshot(), crashEvents, 3)
    expect(frame.packet).toEqual({ source: 'n0', target: 'n4', label: 'PING' })
    expect(frame.metrics.protocol_messages).toBe(1)
  })

  it('does not invent an ACK when the log has none', () => {
    const frame = replayTo(snapshot(), crashEvents, crashEvents.length - 1)
    expect(crashEvents.some((item) => item.event_type === 'ack')).toBe(false)
    expect(frame.packet).toBeNull()
    expect(frame.metrics.protocol_messages).toBe(1)
  })

  it('shows suspicion then local failure without claiming cluster agreement', () => {
    const suspected = replayTo(snapshot(), crashEvents, 5)
    expect(suspected.nodes.find((node) => node.node_id === 'n4')?.display_status).toBe('suspected')
    expect(suspected.metrics.suspected_members).toBe(1)

    const failed = replayTo(snapshot(), crashEvents, 6)
    const n0 = failed.nodes.find((node) => node.node_id === 'n0')
    const n1 = failed.nodes.find((node) => node.node_id === 'n1')
    expect(failed.nodes.find((node) => node.node_id === 'n4')?.display_status).toBe('failed')
    expect(n0?.local_view.find((entry) => entry.node_id === 'n4')?.status).toBe('failed')
    expect(n1?.local_view.find((entry) => entry.node_id === 'n4')?.status).toBe('alive')
    expect(failed.metrics.failed_members).toBe(1)
    expect(failed.metrics.alive_members).toBe(5)
  })
})

describe('applyEvent', () => {
  it('restores alive only when a recovery membership update is present', () => {
    const base = replayTo(snapshot(), crashEvents, 5).nodes
    const recovered = applyEvent(base, event({
      event_id: 'evt-rec',
      event_type: 'recovered',
      membership_update: {
        observer_id: 'n0',
        node_id: 'n4',
        previous_status: 'suspected',
        new_status: 'alive',
        incarnation: 0,
      },
    }))
    expect(recovered.find((node) => node.node_id === 'n0')?.local_view.find((entry) => entry.node_id === 'n4')?.status).toBe('alive')
    expect(recovered.find((node) => node.node_id === 'n4')?.display_status).toBe('alive')
  })
})

describe('firstVisibleEventIndex', () => {
  it('skips session setup so Run Scenario lands on the first protocol change', () => {
    expect(firstVisibleEventIndex(crashEvents)).toBe(2)
    expect(crashEvents[2]?.event_type).toBe('node_crashed')
    expect(firstVisibleEventIndex([crashEvents[0], crashEvents[1]])).toBe(0)
  })
})

describe('eventKind', () => {
  it('classifies protocol messages separately from timeouts', () => {
    expect(eventKind('ping')).toBe('message')
    expect(eventKind('ack')).toBe('message')
    expect(eventKind('timeout')).toBe('timeout')
    expect(eventKind('failed')).toBe('membership')
    expect(eventKind('node_crashed')).toBe('crash')
    expect(eventKind('scenario_limited')).toBe('limitation')
  })
})
