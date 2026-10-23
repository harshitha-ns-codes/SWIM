import { useCallback, useEffect, useMemo, useState } from 'react'
import { firstVisibleEventIndex, isMetaEvent, replayTo, type PlaybackFrame } from '../playback/replay'
import type { ProtocolEvent, Snapshot } from '../types/simulation'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const SPEEDS = [0.5, 1, 2, 4] as const
export type PlaybackSpeed = (typeof SPEEDS)[number]

const BASE_STEP_MS = 650
const META_STEP_MS = 60

export function usePlayback(snapshot: Snapshot | null, events: ProtocolEvent[]) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(2)
  const [packetProgress, setPacketProgress] = useState(1)
  const reducedMotion = usePrefersReducedMotion()
  const sessionId = snapshot?.session_id ?? null
  const lastIndex = Math.max(0, events.length - 1)

  useEffect(() => {
    const start = firstVisibleEventIndex(events)
    setIndex(start)
    setPlaying(events.length > 0)
    setPacketProgress(reducedMotion ? 1 : 0)
  }, [sessionId])

  const frame: PlaybackFrame | null = useMemo(() => {
    if (!snapshot) {
      return null
    }
    return replayTo(snapshot, events, events.length === 0 ? -1 : index)
  }, [events, index, snapshot])

  useEffect(() => {
    if (!frame?.packet || reducedMotion) {
      setPacketProgress(1)
      return
    }
    setPacketProgress(0)
    const started = performance.now()
    const duration = Math.max(280, BASE_STEP_MS / speed - 400)
    let frameId = 0
    const tick = (now: number) => {
      const next = Math.min(1, (now - started) / duration)
      setPacketProgress(next)
      if (next < 1) {
        frameId = window.requestAnimationFrame(tick)
      }
    }
    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [frame?.event?.event_id, frame?.packet, reducedMotion, speed])

  useEffect(() => {
    if (!playing || events.length === 0) {
      return
    }
    if (index >= lastIndex) {
      setPlaying(false)
      return
    }
    const current = events[index]
    const delay = current && isMetaEvent(current.event_type) ? META_STEP_MS / speed : BASE_STEP_MS / speed
    const timer = window.setTimeout(() => {
      setIndex((currentIndex) => Math.min(currentIndex + 1, lastIndex))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [events, index, lastIndex, playing, speed])

  const play = useCallback(() => {
    if (events.length === 0) {
      return
    }
    if (index >= lastIndex) {
      setIndex(firstVisibleEventIndex(events))
    }
    setPlaying(true)
  }, [events, index, lastIndex])

  const pause = useCallback(() => {
    setPlaying(false)
  }, [])

  const stepForward = useCallback(() => {
    setPlaying(false)
    setIndex((current) => Math.min(current + 1, lastIndex))
  }, [lastIndex])

  const selectIndex = useCallback(
    (next: number) => {
      setPlaying(false)
      setIndex(Math.max(0, Math.min(next, lastIndex)))
    },
    [lastIndex],
  )

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const at = SPEEDS.indexOf(current)
      return SPEEDS[(at + 1) % SPEEDS.length] ?? 1
    })
  }, [])

  return {
    index,
    lastIndex,
    playing,
    speed,
    packetProgress: reducedMotion ? 1 : packetProgress,
    reducedMotion,
    frame,
    completed: events.length > 0 && index >= lastIndex && !playing,
    play,
    pause,
    stepForward,
    selectIndex,
    cycleSpeed,
  }
}
