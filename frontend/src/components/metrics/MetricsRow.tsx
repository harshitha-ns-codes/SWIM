import { AlertTriangle, HeartPulse, MessagesSquare, Skull, Users } from 'lucide-react'
import type { MetricsSnapshot } from '../../types/simulation'

const cards = [
  { key: 'total_members', label: 'Members', icon: Users },
  { key: 'alive_members', label: 'Alive', icon: HeartPulse, tone: 'alive' },
  { key: 'suspected_members', label: 'Suspect', icon: AlertTriangle, tone: 'suspect' },
  { key: 'failed_members', label: 'Failed', icon: Skull, tone: 'failed' },
  { key: 'protocol_messages', label: 'Messages', icon: MessagesSquare },
] as const

export function MetricsRow({ metrics }: { metrics: MetricsSnapshot | null }) {
  return (
    <section aria-label="Summary metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        const value = metrics ? String(metrics[card.key]) : '—'
        const tone =
          'tone' in card
            ? card.tone === 'alive'
              ? 'text-alive'
              : card.tone === 'suspect'
                ? 'text-suspect'
                : 'text-failed'
            : 'text-ink'
        return (
          <article key={card.key} className="rounded-xl border border-line bg-panel px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-wide text-mute">{card.label}</p>
              <Icon size={14} className="text-mute" aria-hidden="true" />
            </div>
            <p className={`mt-2 font-mono text-xl font-medium ${tone}`}>{value}</p>
          </article>
        )
      })}
    </section>
  )
}
