import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { ArrowRight, Radio, Server } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useSimulation } from '../../hooks/useSimulation'
import { getCurrentLive } from '../../services/api'
import type { Snapshot } from '../../types/simulation'

const pageCopy: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Overview',
    description: 'Recorded walkthrough. The live cluster is on Live Simulator.',
  },
  '/simulator': {
    title: 'Live Simulator',
    description: 'Interactive cluster — ping, periods, refute, join, gossip.',
  },
  '/experiments': {
    title: 'Results',
    description: 'Paper §5 — load, detection time, infection, false positives. Not built yet.',
  },
  '/paper': {
    title: 'Paper',
    description: 'Das, Gupta, Motivala — Cornell 2002. Why SWIM is not heartbeating.',
  },
  '/how-it-works': {
    title: 'Paper',
    description: 'Das, Gupta, Motivala — Cornell 2002. Why SWIM is not heartbeating.',
  },
}

export function Header() {
  const { backendStatus, health, healthError, snapshot } = useSimulation()
  const location = useLocation()
  const copy = pageCopy[location.pathname] ?? pageCopy['/']
  const onLive = location.pathname.startsWith('/simulator')
  const live = useLiveHeader(onLive && backendStatus === 'connected')

  return (
    <header className="flex flex-col gap-3 border-b border-line bg-panel/80 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-mute">{copy.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusChip
          icon={<Server size={14} aria-hidden="true" />}
          label="API"
          value={
            backendStatus === 'connected'
              ? `v${health?.api_version ?? '?'}`
              : backendStatus === 'checking'
                ? '…'
                : 'Down'
          }
          tone={backendStatus === 'connected' ? 'good' : backendStatus === 'checking' ? 'idle' : 'bad'}
          title={healthError ?? health?.persistence_note}
        />
        {onLive ? (
          <StatusChip
            icon={<Radio size={14} aria-hidden="true" />}
            label="Live"
            value={liveLabel(live)}
            tone={live ? 'good' : 'idle'}
            title={live ? live.session_id : 'No live cluster'}
          />
        ) : (
          <StatusChip
            icon={<Radio size={14} aria-hidden="true" />}
            label="Tape"
            value={tapeLabel(snapshot)}
            tone={snapshot ? (snapshot.limitations.length ? 'warn' : 'good') : 'idle'}
            title={snapshot ? `${snapshot.scenario_title} · ${snapshot.session_id}` : 'No guided session'}
          />
        )}
        {onLive ? (
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-mute hover:text-ink"
          >
            Overview
          </Link>
        ) : (
          <Link
            to="/simulator"
            className="inline-flex items-center gap-2 rounded-md border border-accent/30 bg-accent-dim/40 px-3 py-2 text-sm text-accent hover:bg-accent-dim"
          >
            Live
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
    </header>
  )
}

function useLiveHeader(enabled: boolean): Snapshot | null {
  const [live, setLive] = useState<Snapshot | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLive(null)
      return
    }
    let cancelled = false
    const load = () => {
      void getCurrentLive()
        .then((result) => {
          if (!cancelled) {
            setLive(result.snapshot)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLive(null)
          }
        })
    }
    load()
    const timer = window.setInterval(load, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled])

  return live
}

function tapeLabel(snapshot: Snapshot | null): string {
  if (!snapshot) {
    return 'Idle'
  }
  const short = snapshot.scenario_title.replace(' and ', ' · ')
  return snapshot.limitations.length ? `${short} · limited` : short
}

function liveLabel(snapshot: Snapshot | null): string {
  if (!snapshot) {
    return 'Idle'
  }
  const period = snapshot.protocol_period
  const n = snapshot.metrics.total_members
  return snapshot.auto_run ? `${n} · p${period} · auto` : `${n} · p${period}`
}

function StatusChip({
  icon,
  label,
  value,
  tone,
  title,
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'good' | 'warn' | 'bad' | 'idle'
  title?: string
}) {
  const toneClass = {
    good: 'border-alive/30 text-alive',
    warn: 'border-suspect/30 text-suspect',
    bad: 'border-failed/30 text-failed',
    idle: 'border-line text-mute',
  }[tone]

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border bg-panel-alt px-3 py-2 text-xs ${toneClass}`}
      title={title}
    >
      {icon}
      <span className="text-mute">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
