import { PHASES, phaseFromEvent } from '../../live/format'
import type { ProtocolEvent, Snapshot } from '../../types/simulation'

const LABELS: Record<string, string> = {
  ping: '1 PING',
  ack: '2 ACK?',
  ping_req: '3 PING-REQ ×k',
  suspect: '4 SUSPECT',
  gossip: '5 GOSSIP',
  confirm: '6 CONFIRM',
}

export function PhaseStrip({
  snapshot,
  event,
}: {
  snapshot: Snapshot | null
  event: ProtocolEvent | null
}) {
  const active = phaseFromEvent(event, snapshot)
  const title = event?.detail || 'Click a source node, then a target node, to start a SWIM probe.'

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      <ol className="flex flex-wrap gap-2">
        {PHASES.map((phase) => {
          const on =
            active === phase ||
            (phase === 'ping_req' && (active === 'helper_ping' || active === 'select_helpers'))
          return (
            <li
              key={phase}
              className={[
                'rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide',
                on
                  ? 'border-accent bg-accent-dim text-accent'
                  : 'border-line bg-panel-alt text-mute',
              ].join(' ')}
            >
              {LABELS[phase]}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
