import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isLivePath } from '../live/handoff'
import {
  ApiError,
  askLiveHelpers,
  crashLiveNode,
  dropNextLive,
  freezeLiveNode,
  getCurrentLive,
  isolateLiveNode,
  joinLiveNode,
  leaveLiveNode,
  probeLive,
  runLivePeriod,
  setLiveAutoRun,
  startLiveCluster,
  updateLiveSettings,
} from '../services/api'
import { connectSimulationSocket } from '../services/websocket'
import type { ProtocolEvent, Snapshot } from '../types/simulation'

export interface FlyingPacket {
  id: string
  source: string
  target: string
  label: string
  piggybacked: boolean
  born: number
}

export function useLiveSimulator() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [events, setEvents] = useState<ProtocolEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [viewId, setViewId] = useState<string | null>('n2')
  const [kHelpers, setKHelpers] = useState(3)
  const [loss, setLoss] = useState(0)
  const [delayMs, setDelayMs] = useState(80)
  const [ackTimeoutMs, setAckTimeoutMs] = useState(1200)
  const [suspicionTimeoutMs, setSuspicionTimeoutMs] = useState(3000)
  const [searchParams] = useSearchParams()
  const [path, setPath] = useState<'healthy' | 'failure' | 'refute'>(() => {
    const queryPath = searchParams.get('path')
    return isLivePath(queryPath) ? queryPath : 'healthy'
  })
  const [probeMode, setProbeMode] = useState<'round_robin' | 'random'>('round_robin')
  const [helperIds, setHelperIds] = useState<string[]>([])
  const [packets, setPackets] = useState<FlyingPacket[]>([])
  const [busy, setBusy] = useState(false)
  const sessionId = snapshot?.session_id ?? null
  const sessionRef = useRef<string | null>(null)
  const awaitingHelpers =
    snapshot?.awaiting_helpers === true || snapshot?.protocol_phase === 'select_helpers'
  const probing = (snapshot?.probing === true || busy) && !awaitingHelpers
  const awaitingRef = useRef(false)
  const sourceRef = useRef<string | null>(null)
  const targetRef = useRef<string | null>(null)
  awaitingRef.current = awaitingHelpers
  sourceRef.current = sourceId
  targetRef.current = targetId

  const apply = useCallback((nextSnapshot: Snapshot, nextEvents: ProtocolEvent[]) => {
    sessionRef.current = nextSnapshot.session_id
    setSnapshot(nextSnapshot)
    setEvents(nextEvents)
    setKHelpers(nextSnapshot.k_helpers ?? 3)
    if (nextSnapshot.probe_mode) {
      setProbeMode(nextSnapshot.probe_mode)
    }
  }, [])

  const spawnPacket = useCallback((event: ProtocolEvent) => {
    if (!event.source_node || !event.target_node) {
      return
    }
    if (!['ping', 'ack', 'ping_req', 'helper_ping'].includes(event.event_type)) {
      return
    }
    const packet: FlyingPacket = {
      id: event.event_id,
      source: event.source_node,
      target: event.target_node,
      label:
        event.event_type === 'ping_req'
          ? 'PING-REQ'
          : event.event_type === 'ack'
            ? 'ACK'
            : 'PING',
      piggybacked: Boolean(event.piggybacked?.length) || event.outcome === 'infection',
      born: performance.now(),
    }
    setPackets((current) => [...current.slice(-10), packet])
  }, [])

  useEffect(() => {
    const queryPath = searchParams.get('path')
    if (isLivePath(queryPath)) {
      setPath(queryPath)
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      try {
        const current = await getCurrentLive()
        if (cancelled) {
          return
        }
        if (current.snapshot) {
          apply(current.snapshot, current.events)
          setError(null)
        } else {
          const started = await startLiveCluster()
          if (cancelled) {
            return
          }
          apply(started.snapshot, started.events)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : 'Could not start the live cluster.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [apply])

  useEffect(() => {
    if (!sessionId) {
      return
    }
    let cancelled = false
    const subscribed = sessionId
    const disconnect = connectSimulationSocket(subscribed, {
      onInit: (message) => {
        if (cancelled || sessionRef.current !== message.session_id) {
          return
        }
        apply(message.snapshot, message.events)
        setError(null)
      },
      onEvent: (message) => {
        if (cancelled || sessionRef.current !== message.snapshot.session_id) {
          return
        }
        setSnapshot(message.snapshot)
        setEvents((current) => {
          if (current.some((event) => event.event_id === message.event.event_id)) {
            return current
          }
          return [...current, message.event]
        })
        spawnPacket(message.event)
      },
      onError: (message) => {
        if (!cancelled) {
          setError(message.detail)
        }
      },
    })
    return () => {
      cancelled = true
      disconnect()
    }
  }, [apply, sessionId, spawnPacket])

  useEffect(() => {
    if (packets.length === 0) {
      return
    }
    const timer = window.setInterval(() => {
      const now = performance.now()
      setPackets((current) => current.filter((packet) => now - packet.born < 900))
    }, 80)
    return () => window.clearInterval(timer)
  }, [packets.length])

  const run = useCallback(async (action: () => Promise<{ snapshot: Snapshot; events: ProtocolEvent[] }>) => {
    try {
      const result = await action()
      if (sessionRef.current !== result.snapshot.session_id) {
        return
      }
      setSnapshot(result.snapshot)
      setEvents(result.events)
      setError(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Live action failed.')
    }
  }, [])

  const askHelpers = useCallback(async () => {
    if (!sessionId || helperIds.length === 0 || busy) {
      return
    }
    setBusy(true)
    try {
      await run(() => askLiveHelpers(sessionId, helperIds, suspicionTimeoutMs))
    } finally {
      setBusy(false)
    }
  }, [busy, helperIds, run, sessionId, suspicionTimeoutMs])

  const probe = useCallback(async () => {
    if (busy) {
      return
    }
    if (awaitingRef.current) {
      await askHelpers()
      return
    }
    if (!sessionId || !sourceId || !targetId || sourceId === targetId) {
      return
    }
    setBusy(true)
    setHelperIds([])
    try {
      await run(() =>
        probeLive(sessionId, sourceId, targetId, {
          path,
          ackTimeoutMs,
          suspicionTimeoutMs,
        }),
      )
    } finally {
      setBusy(false)
    }
  }, [ackTimeoutMs, askHelpers, busy, path, run, sessionId, sourceId, suspicionTimeoutMs, targetId])

  const toggleHelper = useCallback(
    (nodeId: string) => {
      if (nodeId === sourceRef.current || nodeId === targetRef.current) {
        return
      }
      setHelperIds((current) => {
        if (current.includes(nodeId)) {
          return current.filter((id) => id !== nodeId)
        }
        if (current.length >= kHelpers) {
          return [...current.slice(1), nodeId]
        }
        return [...current, nodeId]
      })
    },
    [kHelpers],
  )

  const autoRun = snapshot?.auto_run === true

  const selectNode = useCallback(
    (nodeId: string) => {
      setViewId(nodeId)
      if (awaitingRef.current) {
        toggleHelper(nodeId)
        return
      }
      if (autoRun) {
        return
      }
      if (probing) {
        return
      }
      if (!sourceId || sourceId === nodeId) {
        setSourceId(nodeId)
        setTargetId(null)
        setHelperIds([])
        return
      }
      setTargetId(nodeId)
    },
    [autoRun, probing, sourceId, toggleHelper],
  )

  const runPeriod = useCallback(async () => {
    if (!sessionId || busy || awaitingRef.current) {
      return
    }
    setBusy(true)
    try {
      await run(() =>
        runLivePeriod(sessionId, {
          probeMode,
          ackTimeoutMs,
          suspicionTimeoutMs,
        }),
      )
    } finally {
      setBusy(false)
    }
  }, [ackTimeoutMs, busy, probeMode, run, sessionId, suspicionTimeoutMs])

  const toggleAutoRun = useCallback(async () => {
    if (!sessionId || busy) {
      return
    }
    setBusy(true)
    try {
      await run(() =>
        setLiveAutoRun(sessionId, !autoRun, {
          probeMode,
          ackTimeoutMs,
          suspicionTimeoutMs,
        }),
      )
    } finally {
      setBusy(false)
    }
  }, [ackTimeoutMs, autoRun, busy, probeMode, run, sessionId, suspicionTimeoutMs])

  const changeProbeMode = useCallback(
    async (mode: 'round_robin' | 'random') => {
      setProbeMode(mode)
      if (sessionId && autoRun) {
        await run(() =>
          setLiveAutoRun(sessionId, true, {
            probeMode: mode,
            ackTimeoutMs,
            suspicionTimeoutMs,
          }),
        )
      }
    },
    [ackTimeoutMs, autoRun, run, sessionId, suspicionTimeoutMs],
  )

  const restart = useCallback(async () => {
    setLoading(true)
    setSourceId(null)
    setTargetId(null)
    setHelperIds([])
    setPackets([])
    try {
      const started = await startLiveCluster({ k_helpers: kHelpers })
      apply(started.snapshot, started.events)
      setError(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not restart the live cluster.')
    } finally {
      setLoading(false)
    }
  }, [apply, kHelpers])

  const actions = useMemo(
    () => ({
      crash: (nodeId: string) => (sessionId ? run(() => crashLiveNode(sessionId, nodeId)) : Promise.resolve()),
      isolate: (nodeId: string) => (sessionId ? run(() => isolateLiveNode(sessionId, nodeId)) : Promise.resolve()),
      freeze: (nodeId: string) => (sessionId ? run(() => freezeLiveNode(sessionId, nodeId)) : Promise.resolve()),
      dropNext: (nodeId: string) => (sessionId ? run(() => dropNextLive(sessionId, nodeId)) : Promise.resolve()),
      setK: (value: number) => {
        setKHelpers(value)
        if (sessionId) {
          void run(() => updateLiveSettings(sessionId, { k_helpers: value }))
        }
      },
      setLoss: (value: number) => {
        setLoss(value)
        if (sessionId) {
          void run(() => updateLiveSettings(sessionId, { loss: value / 100 }))
        }
      },
      setDelay: (value: number) => {
        setDelayMs(value)
        if (sessionId) {
          void run(() => updateLiveSettings(sessionId, { delay_ms: value }))
        }
      },
      join: (contactId?: string | null) =>
        sessionId ? run(() => joinLiveNode(sessionId, contactId)) : Promise.resolve(),
      leave: (nodeId: string) => (sessionId ? run(() => leaveLiveNode(sessionId, nodeId)) : Promise.resolve()),
    }),
    [run, sessionId],
  )

  const latest = events.length > 0 ? events[events.length - 1] : null

  return {
    snapshot,
    events,
    latest,
    error,
    loading,
    sourceId,
    targetId,
    viewId,
    setViewId,
    kHelpers,
    loss,
    delayMs,
    ackTimeoutMs,
    setAckTimeoutMs,
    suspicionTimeoutMs,
    setSuspicionTimeoutMs,
    path,
    setPath,
    probeMode,
    changeProbeMode,
    autoRun,
    runPeriod,
    toggleAutoRun,
    helperIds,
    toggleHelper,
    packets,
    probing,
    awaitingHelpers,
    selectNode,
    probe,
    askHelpers,
    restart,
    actions,
  }
}
