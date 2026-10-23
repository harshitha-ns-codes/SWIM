import { API_BASE_URL } from './config'
import type {
  ApiErrorBody,
  CurrentSimulationResponse,
  HealthResponse,
  ProtocolEvent,
  ScenarioDefinition,
  Snapshot,
  StartScenarioResponse,
} from '../types/simulation'

export class ApiError extends Error {
  status: number
  body: ApiErrorBody | null

  constructor(message: string, status: number, body: ApiErrorBody | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('Backend unreachable', 0, {
      error: 'Backend unreachable',
      detail: `Could not reach ${API_BASE_URL}. Start the FastAPI server and retry.`,
      code: 'unreachable',
    })
  }

  const text = await response.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!response.ok) {
    const body = (data ?? {}) as ApiErrorBody
    throw new ApiError(body.detail ?? `Request failed (${response.status})`, response.status, {
      error: body.error ?? 'Request failed',
      detail: body.detail ?? `Request failed with status ${response.status}.`,
      code: body.code ?? 'http_error',
      known_scenarios: body.known_scenarios,
    })
  }
  return data as T
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/v1/health')
}

export function getCurrentSimulation(): Promise<CurrentSimulationResponse> {
  return request<CurrentSimulationResponse>('/api/v1/simulation/current')
}

export function getScenarios(): Promise<{
  scenarios: ScenarioDefinition[]
  capabilities: Record<string, boolean>
}> {
  return request('/api/v1/simulation/scenarios')
}

export function startScenario(scenarioId: string): Promise<StartScenarioResponse> {
  return request<StartScenarioResponse>(`/api/v1/simulation/scenarios/${scenarioId}/start`, {
    method: 'POST',
  })
}

export function getSnapshot(sessionId: string): Promise<{ snapshot: Snapshot }> {
  return request(`/api/v1/simulation/${sessionId}/snapshot`)
}

export function getEvents(sessionId: string): Promise<{ session_id: string; events: ProtocolEvent[] }> {
  return request(`/api/v1/simulation/${sessionId}/events`)
}

export interface LiveStartBody {
  member_count?: number
  k_helpers?: number
  enable_udp?: boolean
  animation_ms?: number
}

export interface LiveActionResponse {
  session_id: string
  snapshot: Snapshot
  events: ProtocolEvent[]
}

export function startLiveCluster(body?: LiveStartBody): Promise<LiveActionResponse> {
  return request<LiveActionResponse>('/api/v1/live/start', {
    method: 'POST',
    body: JSON.stringify({
      member_count: 8,
      k_helpers: 3,
      enable_udp: true,
      animation_ms: 280,
      ...body,
    }),
  })
}

export function getCurrentLive(): Promise<CurrentSimulationResponse> {
  return request<CurrentSimulationResponse>('/api/v1/live/current')
}

export function probeLive(
  sessionId: string,
  sourceId: string,
  targetId: string,
  options?: {
    path?: 'healthy' | 'failure' | 'refute'
    helperIds?: string[]
    ackTimeoutMs?: number
    suspicionTimeoutMs?: number
  },
): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/probe`, {
    method: 'POST',
    body: JSON.stringify({
      source_id: sourceId,
      target_id: targetId,
      path: options?.path,
      helper_ids: options?.helperIds ?? [],
      ack_timeout_ms: options?.ackTimeoutMs,
      suspicion_timeout_ms: options?.suspicionTimeoutMs,
    }),
  })
}

export function askLiveHelpers(
  sessionId: string,
  helperIds: string[],
  suspicionTimeoutMs?: number,
): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/helpers`, {
    method: 'POST',
    body: JSON.stringify({
      helper_ids: helperIds,
      suspicion_timeout_ms: suspicionTimeoutMs,
    }),
  })
}

export function crashLiveNode(sessionId: string, nodeId: string): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/crash`, {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  })
}

export function isolateLiveNode(sessionId: string, nodeId: string): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/isolate`, {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  })
}

export function freezeLiveNode(sessionId: string, nodeId: string): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/freeze`, {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  })
}

export function dropNextLive(sessionId: string, nodeId: string): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/drop`, {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  })
}

export function updateLiveSettings(
  sessionId: string,
  settings: { k_helpers?: number; loss?: number; delay_ms?: number },
): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/settings`, {
    method: 'POST',
    body: JSON.stringify(settings),
  })
}

export function runLivePeriod(
  sessionId: string,
  options?: {
    probeMode?: 'round_robin' | 'random'
    ackTimeoutMs?: number
    suspicionTimeoutMs?: number
  },
): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/period`, {
    method: 'POST',
    body: JSON.stringify({
      probe_mode: options?.probeMode,
      ack_timeout_ms: options?.ackTimeoutMs,
      suspicion_timeout_ms: options?.suspicionTimeoutMs,
    }),
  })
}

export function setLiveAutoRun(
  sessionId: string,
  enabled: boolean,
  options?: {
    probeMode?: 'round_robin' | 'random'
    ackTimeoutMs?: number
    suspicionTimeoutMs?: number
  },
): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/auto-run`, {
    method: 'POST',
    body: JSON.stringify({
      enabled,
      probe_mode: options?.probeMode,
      ack_timeout_ms: options?.ackTimeoutMs,
      suspicion_timeout_ms: options?.suspicionTimeoutMs,
    }),
  })
}

export function joinLiveNode(sessionId: string, contactId?: string | null): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ contact_id: contactId ?? null }),
  })
}

export function leaveLiveNode(sessionId: string, nodeId: string): Promise<LiveActionResponse> {
  return request<LiveActionResponse>(`/api/v1/live/${sessionId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  })
}
