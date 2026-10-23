import type {
  EventType,
  MemberStatus,
  MetricsSnapshot,
  NodeSnapshot,
  ProtocolEvent,
  Snapshot,
} from '../types/simulation'

export const MESSAGE_EVENT_TYPES: readonly EventType[] = ['ping', 'ack', 'ping_req', 'helper_ping']

export type EventKind = 'message' | 'timeout' | 'membership' | 'crash' | 'limitation' | 'meta'

export interface ActivePacket {
  source: string
  target: string
  label: string
}

export interface PlaybackFrame {
  index: number
  event: ProtocolEvent | null
  simTime: number
  protocolPeriod: number
  nodes: NodeSnapshot[]
  overlayEdges: Array<{ source: string; target: string }>
  packet: ActivePacket | null
  highlightNodeIds: string[]
  highlightEdge: { source: string; target: string } | null
  metrics: MetricsSnapshot
}

export function eventKind(eventType: EventType): EventKind {
  if (MESSAGE_EVENT_TYPES.includes(eventType)) {
    return 'message'
  }
  if (eventType === 'timeout') {
    return 'timeout'
  }
  if (eventType === 'suspected' || eventType === 'recovered' || eventType === 'failed') {
    return 'membership'
  }
  if (eventType === 'node_crashed') {
    return 'crash'
  }
  if (eventType === 'scenario_limited') {
    return 'limitation'
  }
  return 'meta'
}

export function isMessageEvent(eventType: EventType): boolean {
  return MESSAGE_EVENT_TYPES.includes(eventType)
}

const VISIBLE_EVENT_TYPES: readonly EventType[] = [
  'node_crashed',
  'ping',
  'ack',
  'ping_req',
  'timeout',
  'suspected',
  'recovered',
  'failed',
]

export function firstVisibleEventIndex(events: ProtocolEvent[]): number {
  const index = events.findIndex((event) => VISIBLE_EVENT_TYPES.includes(event.event_type))
  return index >= 0 ? index : 0
}

export function isMetaEvent(eventType: EventType): boolean {
  return eventKind(eventType) === 'meta'
}

export function packetLabel(eventType: EventType): string {
  if (eventType === 'ping') {
    return 'PING'
  }
  if (eventType === 'ack') {
    return 'ACK'
  }
  if (eventType === 'ping_req') {
    return 'PING-REQ'
  }
  return eventType.replaceAll('_', ' ').toUpperCase()
}

export function replayTo(snapshot: Snapshot, events: ProtocolEvent[], index: number): PlaybackFrame {
  const clamped = events.length === 0 ? -1 : Math.max(-1, Math.min(index, events.length - 1))
  const applied = clamped < 0 ? [] : events.slice(0, clamped + 1)
  const nodes = applyEvents(initialNodes(snapshot), applied)
  const event = clamped >= 0 ? events[clamped] : null
  const highlightNodeIds = eventNodeIds(event)
  const highlightEdge =
    event?.source_node && event.target_node
      ? { source: event.source_node, target: event.target_node }
      : null
  const packet =
    event && isMessageEvent(event.event_type) && event.source_node && event.target_node
      ? {
          source: event.source_node,
          target: event.target_node,
          label: packetLabel(event.event_type),
        }
      : null

  return {
    index: clamped,
    event,
    simTime: event?.sim_time ?? 0,
    protocolPeriod: event?.protocol_period ?? 0,
    nodes,
    overlayEdges: snapshot.edges
      .filter((edge) => edge.kind === 'overlay')
      .map((edge) => ({ source: edge.source, target: edge.target })),
    packet,
    highlightNodeIds,
    highlightEdge,
    metrics: metricsFrom(nodes, applied, snapshot.metrics.membership_convergence),
  }
}

export function applyEvents(nodes: NodeSnapshot[], events: ProtocolEvent[]): NodeSnapshot[] {
  let current = cloneNodes(nodes)
  for (const event of events) {
    current = applyEvent(current, event)
  }
  return current
}

export function applyEvent(nodes: NodeSnapshot[], event: ProtocolEvent): NodeSnapshot[] {
  const next = cloneNodes(nodes)
  if (event.event_type === 'node_crashed' && event.target_node) {
    const crashed = next.find((node) => node.node_id === event.target_node)
    if (crashed) {
      crashed.process_state = 'crashed'
    }
  }
  if (event.membership_update) {
    const observer = next.find((node) => node.node_id === event.membership_update?.observer_id)
    const update = observer?.local_view.find((entry) => entry.node_id === event.membership_update?.node_id)
    if (update && event.membership_update) {
      update.status = event.membership_update.new_status
      update.incarnation = event.membership_update.incarnation
    }
  }
  return withDisplayStatus(next)
}

function initialNodes(snapshot: Snapshot): NodeSnapshot[] {
  return snapshot.nodes.map((node) => ({
    ...node,
    process_state: 'running',
    display_status: 'alive',
    incarnation: 0,
    local_view: snapshot.nodes
      .filter((other) => other.node_id !== node.node_id)
      .map((other) => ({
        node_id: other.node_id,
        status: 'alive' as const,
        incarnation: 0,
      })),
  }))
}

function withDisplayStatus(nodes: NodeSnapshot[]): NodeSnapshot[] {
  return nodes.map((node) => ({
    ...node,
    display_status: displayStatusFor(node.node_id, nodes),
  }))
}

function displayStatusFor(nodeId: string, nodes: NodeSnapshot[]): MemberStatus {
  const observed = nodes.flatMap((observer) =>
    observer.local_view.filter((entry) => entry.node_id === nodeId).map((entry) => entry.status),
  )
  if (observed.includes('failed')) {
    return 'failed'
  }
  if (observed.includes('suspected')) {
    return 'suspected'
  }
  return 'alive'
}

function metricsFrom(
  nodes: NodeSnapshot[],
  applied: ProtocolEvent[],
  membershipConvergence: number | null,
): MetricsSnapshot {
  const counts = { alive: 0, suspected: 0, failed: 0 }
  for (const node of nodes) {
    counts[node.display_status] += 1
  }
  return {
    total_members: nodes.length,
    alive_members: counts.alive,
    suspected_members: counts.suspected,
    failed_members: counts.failed,
    protocol_messages: applied.filter((event) => isMessageEvent(event.event_type)).length,
    membership_convergence: membershipConvergence,
  }
}

function eventNodeIds(event: ProtocolEvent | null): string[] {
  if (!event) {
    return []
  }
  const ids = [event.source_node, event.target_node, event.membership_update?.observer_id, event.membership_update?.node_id]
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

function cloneNodes(nodes: NodeSnapshot[]): NodeSnapshot[] {
  return nodes.map((node) => ({
    ...node,
    local_view: node.local_view.map((entry) => ({ ...entry })),
  }))
}
