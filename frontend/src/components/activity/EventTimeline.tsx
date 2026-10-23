import { eventKind } from '../../playback/replay'
import type { ProtocolEvent } from '../../types/simulation'

const kindClass: Record<string, string> = {
  message: 'border-accent/40 text-accent',
  timeout: 'border-suspect/40 text-suspect',
  membership: 'border-ink/30 text-ink',
  crash: 'border-failed/40 text-failed',
  limitation: 'border-suspect/40 text-suspect',
  meta: 'border-line text-mute',
}

export function EventTimeline({
  events,
  selectedIndex,
  emptyMessage,
  loading,
  error,
  completed,
  onSelect,
}: {
  events: ProtocolEvent[]
  selectedIndex: number
  emptyMessage: string | null
  loading: boolean
  error: string | null
  completed: boolean
  onSelect: (index: number) => void
}) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Tape</h2>
      </div>
      {loading ? (
        <p className="px-4 py-6 text-sm text-mute">Starting…</p>
      ) : error ? (
        <p className="px-4 py-6 text-sm text-failed">{error}</p>
      ) : events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-mute">{emptyMessage ?? 'Play a tape to load events.'}</p>
      ) : (
        <ol className="max-h-[220px] overflow-auto">
          {events.map((event, index) => {
            const selected = index === selectedIndex
            const kind = eventKind(event.event_type)
            return (
              <li key={event.event_id}>
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-2 text-left last:border-b-0 ${
                    selected ? 'bg-accent-dim/40' : 'hover:bg-panel-alt'
                  }`}
                >
                  <span className="w-12 shrink-0 font-mono text-[11px] text-mute">t={event.sim_time.toFixed(1)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm capitalize">{event.event_type.replaceAll('_', ' ')}</span>
                  <span className="hidden font-mono text-[11px] text-mute sm:inline">
                    {event.source_node ?? '—'}
                    {event.target_node ? ` → ${event.target_node}` : ''}
                  </span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${kindClass[kind]}`}>
                    {kind}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {completed && events.length > 0 ? (
        <p className="border-t border-line px-4 py-2 text-xs text-mute">End of tape.</p>
      ) : null}
    </section>
  )
}
