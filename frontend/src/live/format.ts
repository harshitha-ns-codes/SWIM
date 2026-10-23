import type { EventType, MemberStatus, ProtocolEvent, Snapshot } from '../types/simulation'

export const STATUS_COLOR: Record<MemberStatus, string> = {
  alive: '#22c55e',
  suspected: '#f59e0b',
  failed: '#ef4444',
}

export const PHASES = ['ping', 'ack', 'ping_req', 'suspect', 'gossip', 'confirm'] as const

export function displayNodeId(id: string): string {
  return id.replace(/^n/i, 'N')
}

export function packetKind(eventType: EventType): string {
  if (eventType === 'ping') {
    return 'PING'
  }
  if (eventType === 'ack') {
    return 'ACK'
  }
  if (eventType === 'ping_req') {
    return 'PING-REQ'
  }
  if (eventType === 'helper_ping') {
    return 'PING'
  }
  if (eventType === 'piggyback') {
    return 'GOSSIP'
  }
  return eventType.replaceAll('_', ' ').toUpperCase()
}

export function phaseFromEvent(event: ProtocolEvent | null, snapshot: Snapshot | null): string {
  if (snapshot?.protocol_phase && snapshot.protocol_phase !== 'idle') {
    return snapshot.protocol_phase
  }
  if (!event) {
    return 'idle'
  }
  if (event.event_type === 'ping_req' || event.event_type === 'helper_ping' || snapshot?.protocol_phase === 'select_helpers') {
    return 'ping_req'
  }
  if (event.event_type === 'piggyback' || event.outcome === 'infection') {
    return 'gossip'
  }
  if (event.event_type === 'suspected') {
    return 'suspect'
  }
  if (event.event_type === 'failed') {
    return 'confirm'
  }
  if (event.event_type === 'recovered') {
    return 'gossip'
  }
  return event.event_type
}

export function viewStatus(
  snapshot: Snapshot | null,
  observerId: string | null,
  subjectId: string,
): MemberStatus | null {
  if (!snapshot || !observerId) {
    return snapshot?.nodes.find((node) => node.node_id === subjectId)?.display_status ?? null
  }
  const observer = snapshot.nodes.find((node) => node.node_id === observerId)
  return observer?.local_view.find((entry) => entry.node_id === subjectId)?.status ?? null
}

export function matrixCell(
  snapshot: Snapshot,
  observerId: string,
  subjectId: string,
): MemberStatus | 'self' | 'unknown' {
  if (observerId === subjectId) {
    return 'self'
  }
  const observer = snapshot.nodes.find((node) => node.node_id === observerId)
  return observer?.local_view.find((entry) => entry.node_id === subjectId)?.status ?? 'unknown'
}
