import { localDetectionWithoutGossip, whatToObserve } from '../../playback/explanations'
import type { ProtocolEvent, ScenarioDefinition, Snapshot } from '../../types/simulation'

export function ScenarioGuide({
  scenario,
  snapshot,
  events,
  currentIndex,
}: {
  scenario: ScenarioDefinition | undefined
  snapshot: Snapshot | null
  events: ProtocolEvent[]
  currentIndex: number
}) {
  if (!snapshot) {
    return null
  }

  const notes = whatToObserve(scenario, snapshot)
  const showGossipGap = localDetectionWithoutGossip(snapshot, events, currentIndex)
  const recovered = events.some((event) => event.event_type === 'recovered')
  const ack = events.some((event) => event.event_type === 'ack')

  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel px-4 py-4">
      <div>
        <h2 className="text-sm font-semibold">What to observe · {snapshot.scenario_title}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mute">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      {snapshot.scenario_id === 'suspicion_recovery' && !recovered ? (
        <p className="rounded-md border border-suspect/30 bg-suspect/10 px-3 py-2 text-sm text-suspect">
          No `recovered` event is in this log
          {ack ? '' : ', and no ACK was recorded'}. Suspicion recovery is not claimed.
        </p>
      ) : null}

      {showGossipGap ? (
        <p className="rounded-md border border-suspect/30 bg-suspect/10 px-3 py-2 text-sm text-suspect">
          Failure detected locally; dissemination not implemented. Other members still retain stale alive views.
        </p>
      ) : null}

      {snapshot.limitations.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-mute">Implemented vs limited</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-suspect">
            {snapshot.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-alive">This scenario used only implemented direct PING/ACK behavior.</p>
      )}
    </section>
  )
}
