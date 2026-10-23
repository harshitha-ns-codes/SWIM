import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProtocolEvent, Snapshot } from '../../types/simulation'

export function InfectionChart({ events, snapshot }: { events: ProtocolEvent[]; snapshot: Snapshot }) {
  const data = spreadSeries(events, snapshot.nodes.length)

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">Infection spread</h2>
      <p className="mt-1 text-[11px] text-mute">How many members know the latest membership update over time.</p>
      <div className="mt-3 h-36">
        {data.length < 2 ? (
          <p className="flex h-full items-center text-sm text-mute">No membership infection yet. Fail a probe to watch gossip spread.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="step" hide />
              <YAxis hide domain={[0, snapshot.nodes.length]} />
              <Tooltip
                contentStyle={{ background: '#12182b', border: '1px solid #2a3550', fontSize: 12 }}
                labelStyle={{ color: '#8b98b3' }}
              />
              <Area type="monotone" dataKey="knowers" stroke="#2dd4bf" fill="#134e4a" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function spreadSeries(events: ProtocolEvent[], memberCount: number): Array<{ step: number; knowers: number }> {
  const points: Array<{ step: number; knowers: number }> = [{ step: 0, knowers: 0 }]
  const knowers = new Set<string>()
  let subject: string | null = null
  let status: string | null = null
  events.forEach((event, index) => {
    const update = event.membership_update
    if (!update) {
      return
    }
    if (subject !== update.node_id || status !== update.new_status) {
      knowers.clear()
      subject = update.node_id
      status = update.new_status
    }
    knowers.add(update.observer_id)
    points.push({ step: index + 1, knowers: Math.min(knowers.size, memberCount) })
  })
  return points
}
