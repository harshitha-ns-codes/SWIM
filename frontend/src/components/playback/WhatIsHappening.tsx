import { explainEvent, observerViewStatus } from '../../playback/explanations'
import type { PlaybackFrame } from '../../playback/replay'
import type { ProtocolEvent, Snapshot } from '../../types/simulation'

export function WhatIsHappening({
  snapshot,
  frame,
}: {
  snapshot: Snapshot | null
  frame: PlaybackFrame | null
}) {
  const explanation = explainEvent(frame?.event ?? null, snapshot)
  const event = frame?.event ?? null
  const view = viewedMembership(event)

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-mute">What is happening?</p>
        <h3 className="mt-1 text-sm font-semibold">{explanation.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-mute">{explanation.happening}</p>
      </div>
      {view ? (
        <p className="font-mono text-xs text-ink">
          {view.observer} local view of {view.subject}: {observerViewStatus(frame, view.observer, view.subject) ?? '—'}
        </p>
      ) : null}
      {event?.membership_update ? (
        <p className="font-mono text-xs text-accent">
          {event.membership_update.observer_id} table: {event.membership_update.node_id}{' '}
          {event.membership_update.previous_status} → {event.membership_update.new_status}
        </p>
      ) : null}
    </section>
  )
}

function viewedMembership(event: ProtocolEvent | null): { observer: string; subject: string } | null {
  if (!event) {
    return null
  }
  if (event.membership_update) {
    return { observer: event.membership_update.observer_id, subject: event.membership_update.node_id }
  }
  if (!event.source_node || !event.target_node) {
    return null
  }
  if (event.event_type === 'ack') {
    return { observer: event.target_node, subject: event.source_node }
  }
  return { observer: event.source_node, subject: event.target_node }
}
