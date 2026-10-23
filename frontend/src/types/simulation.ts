export type MemberStatus = 'alive' | 'suspected' | 'failed'
export type ProcessState = 'running' | 'crashed'
export type SessionStatus = 'initialized' | 'completed' | 'completed_with_limitations'
export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type EventType =
  | 'session_started'
  | 'cluster_initialized'
  | 'node_crashed'
  | 'node_joined'
  | 'node_left'
  | 'ping'
  | 'ack'
  | 'ping_req'
  | 'helper_ping'
  | 'piggyback'
  | 'timeout'
  | 'suspected'
  | 'recovered'
  | 'failed'
  | 'scenario_completed'
  | 'scenario_limited'

export interface MembershipEntry {
  node_id: string
  status: MemberStatus
  incarnation: number
}

export interface MembershipUpdate {
  observer_id: string
  node_id: string
  previous_status: MemberStatus
  new_status: MemberStatus
  incarnation: number
}

export interface ProtocolEvent {
  event_id: string
  sim_time: number
  protocol_period: number
  event_type: EventType
  source_node: string | null
  target_node: string | null
  outcome: string
  membership_update: MembershipUpdate | null
  detail: string
  piggybacked?: string[]
}

export interface Position {
  x: number
  y: number
}

export interface NodeSnapshot {
  node_id: string
  process_state: ProcessState
  display_status: MemberStatus
  incarnation: number
  position: Position
  local_view: MembershipEntry[]
}

export interface EdgeSnapshot {
  source: string
  target: string
  kind: 'overlay' | 'probe'
  active: boolean
}

export interface MetricsSnapshot {
  total_members: number
  alive_members: number
  suspected_members: number
  failed_members: number
  protocol_messages: number
  membership_convergence: number | null
}

export interface ProbeHighlight {
  source: string
  target: string
  outcome: string
}

export interface Snapshot {
  session_id: string
  scenario_id: string
  scenario_title: string
  status: SessionStatus
  demo_cluster: boolean
  persistence: 'in-memory'
  sim_time: number
  protocol_period: number
  nodes: NodeSnapshot[]
  edges: EdgeSnapshot[]
  metrics: MetricsSnapshot
  limitations: string[]
  active_probe: ProbeHighlight | null
  capabilities: Record<string, boolean>
  k_helpers?: number
  piggybacked_updates?: number
  packets_sent?: number
  protocol_phase?: string | null
  helper_ids?: string[]
  udp_enabled?: boolean
  udp_ports?: Record<string, number>
  latest_update_label?: string | null
  latest_update_knowers?: string[]
  local_health?: number | null
  adaptive_timeout?: number | null
  extra_broadcast_packets?: number
  probing?: boolean
  awaiting_helpers?: boolean
  ack_timeout_ms?: number
  suspicion_timeout_ms?: number
  pending_source?: string | null
  pending_target?: string | null
  demo_path?: string | null
  auto_run?: boolean
  probe_mode?: 'round_robin' | 'random'
  next_targets?: Record<string, string>
  completeness_bound_periods?: number
  probe_deadlines?: Record<string, number>
  probe_deadline_by?: Record<string, string>
  piggyback_limit?: number
}

export interface ScenarioDefinition {
  id: string
  title: string
  difficulty: Difficulty
  objective: string
  expected_observation: string
  required_capabilities: string[]
  unimplemented_capabilities: string[]
}

export interface HealthResponse {
  status: 'ok'
  api_version: string
  persistence: 'in-memory'
  persistence_note: string
  capabilities: Record<string, boolean>
}

export interface CurrentSimulationResponse {
  session_id: string | null
  snapshot: Snapshot | null
  events: ProtocolEvent[]
  message: string | null
}

export interface StartScenarioResponse {
  session_id: string
  snapshot: Snapshot
  events: ProtocolEvent[]
  limitations: string[]
}

export interface ApiErrorBody {
  error: string
  detail: string
  code: string
  known_scenarios?: string[]
}

export type BackendStatus = 'checking' | 'connected' | 'unreachable'
