import type { ReactNode } from 'react'
import { ArrowRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { Link } from 'react-router-dom'
import { liveHandoff } from '../../live/handoff'
import { explainEvent } from '../../playback/explanations'
import type { PlaybackFrame } from '../../playback/replay'
import type { Snapshot } from '../../types/simulation'

export function OverviewNow({
  snapshot,
  frame,
  index,
  total,
  playing,
  speed,
  canReset,
  resetting,
  disabled,
  onPlay,
  onPause,
  onStep,
  onReset,
  onCycleSpeed,
}: {
  snapshot: Snapshot | null
  frame: PlaybackFrame | null
  index: number
  total: number
  playing: boolean
  speed: number
  canReset: boolean
  resetting: boolean
  disabled: boolean
  onPlay: () => void
  onPause: () => void
  onStep: () => void
  onReset: () => void
  onCycleSpeed: () => void
}) {
  const event = frame?.event
  const explanation = explainEvent(event ?? null, snapshot)
  const handoff = liveHandoff(snapshot?.scenario_id)
  const limited = Boolean(snapshot?.limitations.length)
  const pair =
    event?.source_node && event?.target_node ? `${event.source_node} → ${event.target_node}` : null

  return (
    <section className="flex h-full flex-col rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-mute">Now</p>
        {limited ? (
          <span className="rounded-full border border-suspect/30 bg-suspect/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-suspect">
            Local view only
          </span>
        ) : snapshot ? (
          <span className="rounded-full border border-alive/30 bg-alive/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-alive">
            Direct ping
          </span>
        ) : null}
      </div>

      <h2 className="mt-3 text-base font-semibold leading-snug">
        {snapshot ? snapshot.scenario_title : 'Pick a tape'}
      </h2>
      <p className="mt-2 text-sm font-medium text-ink">{explanation.title}</p>
      {pair ? <p className="mt-1 font-mono text-xs text-accent">{pair}</p> : null}

      <dl className="mt-4 grid grid-cols-3 gap-2 font-mono text-[11px]">
        <Stat label="t" value={(event?.sim_time ?? 0).toFixed(1)} />
        <Stat label="p" value={String(event?.protocol_period ?? 0)} />
        <Stat label="#" value={total ? `${Math.min(index + 1, total)}/${total}` : '—'} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <IconBtn label={playing ? 'Pause' : 'Play'} disabled={disabled || total === 0} onClick={playing ? onPause : onPlay}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </IconBtn>
        <IconBtn label="Step" disabled={disabled || total === 0} onClick={onStep}>
          <SkipForward size={14} />
        </IconBtn>
        <IconBtn label="Reset" disabled={!canReset || resetting} onClick={onReset}>
          <RotateCcw size={14} />
        </IconBtn>
        <button
          type="button"
          onClick={onCycleSpeed}
          className="rounded-md border border-line px-2.5 py-2 font-mono text-xs text-mute hover:text-ink"
        >
          {speed}×
        </button>
      </div>

      <Link
        to={handoff.href}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent-dim px-3 py-2.5 text-sm font-medium text-accent hover:bg-accent-dim/80"
      >
        Try on Live · {handoff.cue}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-alt px-2 py-2">
      <dt className="text-mute">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  )
}

function IconBtn({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-dim/40 px-2.5 py-2 text-xs text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
      {label}
    </button>
  )
}
