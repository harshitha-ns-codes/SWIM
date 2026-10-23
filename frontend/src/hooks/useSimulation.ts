import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ApiError,
  getCurrentSimulation,
  getEvents,
  getHealth,
  getScenarios,
  getSnapshot,
  startScenario,
} from '../services/api'
import { connectSimulationSocket } from '../services/websocket'
import type {
  BackendStatus,
  HealthResponse,
  ProtocolEvent,
  ScenarioDefinition,
  Snapshot,
} from '../types/simulation'

interface SimulationContextValue {
  backendStatus: BackendStatus
  health: HealthResponse | null
  healthError: string | null
  snapshot: Snapshot | null
  events: ProtocolEvent[]
  emptyMessage: string | null
  scenarios: ScenarioDefinition[]
  scenariosError: string | null
  sessionError: string | null
  loading: boolean
  startingScenarioId: string | null
  socketState: 'idle' | 'connected' | 'disconnected'
  runScenario: (scenarioId: string) => Promise<void>
  refresh: () => Promise<void>
}

const SimulationContext = createContext<SimulationContextValue | null>(null)

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [events, setEvents] = useState<ProtocolEvent[]>([])
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([])
  const [scenariosError, setScenariosError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [startingScenarioId, setStartingScenarioId] = useState<string | null>(null)
  const [socketState, setSocketState] = useState<'idle' | 'connected' | 'disconnected'>('idle')
  const sessionId = snapshot?.session_id ?? null
  const activeSessionIdRef = useRef<string | null>(null)

  const applySession = useCallback(
    (nextSnapshot: Snapshot | null, nextEvents: ProtocolEvent[], message: string | null) => {
      activeSessionIdRef.current = nextSnapshot?.session_id ?? null
      setSnapshot(nextSnapshot)
      setEvents(nextEvents)
      setEmptyMessage(message)
    },
    [],
  )

  const loadHealth = useCallback(async () => {
    try {
      const nextHealth = await getHealth()
      setHealth(nextHealth)
      setBackendStatus('connected')
      setHealthError(null)
      return true
    } catch (error) {
      setHealth(null)
      setBackendStatus('unreachable')
      setHealthError(error instanceof ApiError ? error.message : 'Backend health check failed.')
      return false
    }
  }, [])

  const loadSession = useCallback(async () => {
    try {
      const current = await getCurrentSimulation()
      applySession(current.snapshot, current.events, current.message)
      setSessionError(null)
    } catch (error) {
      applySession(null, [], null)
      setSessionError(error instanceof ApiError ? error.message : 'Failed to load the current simulation.')
    }
  }, [applySession])

  const loadScenarios = useCallback(async () => {
    try {
      const payload = await getScenarios()
      setScenarios(payload.scenarios)
      setScenariosError(null)
    } catch (error) {
      setScenarios([])
      setScenariosError(error instanceof ApiError ? error.message : 'Failed to load scenarios.')
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    const healthy = await loadHealth()
    if (healthy) {
      await Promise.all([loadSession(), loadScenarios()])
    } else {
      applySession(null, [], null)
      setScenarios([])
    }
    setLoading(false)
  }, [applySession, loadHealth, loadScenarios, loadSession])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      void loadHealth()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [loadHealth, refresh])

  useEffect(() => {
    if (backendStatus !== 'connected' || !sessionId) {
      setSocketState('idle')
      return
    }

    let cancelled = false
    const subscribedSessionId = sessionId
    const disconnect = connectSimulationSocket(subscribedSessionId, {
      onInit: (message) => {
        if (cancelled || activeSessionIdRef.current !== message.session_id) {
          return
        }
        applySession(message.snapshot, message.events, null)
        setSocketState('connected')
        setSessionError(null)
      },
      onEvent: (message) => {
        if (cancelled || activeSessionIdRef.current !== message.snapshot.session_id) {
          return
        }
        setSnapshot(message.snapshot)
        setEvents((current) => [...current, message.event])
        setEmptyMessage(null)
      },
      onError: (message) => {
        if (cancelled) {
          return
        }
        setSessionError(message.detail)
        setSocketState('disconnected')
      },
      onClose: () => {
        if (cancelled || activeSessionIdRef.current !== subscribedSessionId) {
          return
        }
        setSocketState('disconnected')
        void Promise.all([getSnapshot(subscribedSessionId), getEvents(subscribedSessionId)])
          .then(([payload, eventPayload]) => {
            if (cancelled || activeSessionIdRef.current !== subscribedSessionId) {
              return
            }
            applySession(payload.snapshot, eventPayload.events, null)
            setSessionError(null)
          })
          .catch((error: unknown) => {
            if (cancelled || activeSessionIdRef.current !== subscribedSessionId) {
              return
            }
            if (error instanceof ApiError) {
              setSessionError(error.message)
            }
          })
      },
    })

    return () => {
      cancelled = true
      disconnect()
    }
  }, [applySession, backendStatus, sessionId])

  const runScenario = useCallback(
    async (scenarioId: string) => {
      setStartingScenarioId(scenarioId)
      setSessionError(null)
      try {
        const result = await startScenario(scenarioId)
        applySession(result.snapshot, result.events, null)
      } catch (error) {
        setSessionError(
          error instanceof ApiError
            ? error.message
            : `Failed to start scenario '${scenarioId}'.`,
        )
      } finally {
        setStartingScenarioId(null)
      }
    },
    [applySession],
  )

  const value = useMemo<SimulationContextValue>(
    () => ({
      backendStatus,
      health,
      healthError,
      snapshot,
      events,
      emptyMessage,
      scenarios,
      scenariosError,
      sessionError,
      loading,
      startingScenarioId,
      socketState,
      runScenario,
      refresh,
    }),
    [
      backendStatus,
      emptyMessage,
      events,
      health,
      healthError,
      loading,
      refresh,
      runScenario,
      scenarios,
      scenariosError,
      sessionError,
      snapshot,
      socketState,
      startingScenarioId,
    ],
  )

  return createElement(SimulationContext.Provider, { value }, children)
}

export function useSimulation(): SimulationContextValue {
  const value = useContext(SimulationContext)
  if (!value) {
    throw new Error('useSimulation must be used within SimulationProvider')
  }
  return value
}
