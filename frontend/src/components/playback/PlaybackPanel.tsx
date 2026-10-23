import type { ReactNode } from 'react'
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { explainEvent } from '../../playback/explanations'
import type { PlaybackFrame } from '../../playback/replay'
import type { Snapshot } from '../../types/simulation'

export function PlaybackPanel({
  snapshot,
  frame,
  index,
  total,
  playing,
  speed,
  completed,
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
  completed: boolean
  canReset: boolean
  resetting: boolean
  disabled: boolean
  onPlay: () => void
  onPause: () => void
  onStep: () => void
  onReset: () => void
  onCycleSpeed: () => void
}) {
  const explanation = explainEvent(frame?.event ?? null, snapshot)
  const event = frame?.event

  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Scenario playback</h2>
          <p className="text-xs text-mute">
            Protocol time comes from backend timestamps. Playback speed only changes how fast those recorded events are shown.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ControlButton
            label={playing ? 'Pause' : 'Play'}
            disabled={disabled || total === 0}
            onClick={playing ? onPause : onPlay}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? 'Pause' : 'Play'}
          </ControlButton>
          <ControlButton label="Step forward" disabled={disabled || total === 0} onClick={onStep}>
            <SkipForward size={14} />
            Step
          </ControlButton>
          <ControlButton label="Reset scenario" disabled={!canReset || resetting} onClick={onReset}>
            <RotateCcw size={14} />
            {resetting ? 'Resetting…' : 'Reset'}
          </ControlButton>
          <button
            type="button"
            onClick={onCycleSpeed}
            className="rounded-md border border-line px-3 py-2 font-mono text-xs text-mute hover:text-ink"
            aria-label="Cycle playback speed"
          >
            {speed}× speed
          </button>
        </div>
      </div>

      {total === 0 ? (
        <p className="px-4 py-8 text-sm text-mute">No recorded events to play. Run a guided scenario first.</p>
      ) : (
        <div className="grid gap-4 px-4 py-4 md:grid-cols-[auto_1fr]">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs md:block md:space-y-2">
            <Row label="Sim time" value={`t=${(event?.sim_time ?? 0).toFixed(1)}`} />
            <Row label="Period" value={`p${event?.protocol_period ?? 0}`} />
            <Row label="Event" value={`${Math.min(index + 1, total)} / ${total}`} />
            <Row label="Type" value={event?.event_type.replaceAll('_', ' ') ?? '—'} />
            <Row label="Source" value={event?.source_node ?? '—'} />
            <Row label="Target" value={event?.target_node ?? '—'} />
            <Row label="ID" value={event?.event_id ?? '—'} />
          </dl>
          <div>
            <p className="text-xs uppercase tracking-wide text-mute">Now showing</p>
            <p className="mt-1 text-sm font-medium">{explanation.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-mute">{explanation.happening}</p>
            {completed ? (
              <p className="mt-3 text-xs text-accent">End of recorded sequence. Reset to request a fresh backend session.</p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="text-mute">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function ControlButton({
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
      className="inline-flex items-center gap-2 rounded-md border border-accent/30 bg-accent-dim/40 px-3 py-2 text-sm text-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}
