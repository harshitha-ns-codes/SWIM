import { RotateCcw } from 'lucide-react'
import { InfectionChart } from '../components/live/InfectionChart'
import { LiveRing } from '../components/live/LiveRing'
import { MembershipMatrix } from '../components/live/MembershipMatrix'
import { PhaseStrip } from '../components/live/PhaseStrip'
import { useLiveSimulator } from '../hooks/useLiveSimulator'
import { displayNodeId, STATUS_COLOR } from '../live/format'

export function SimulatorPage() {
  const live = useLiveSimulator()
  const selected = live.snapshot?.nodes.find((node) => node.node_id === live.viewId) ?? live.snapshot?.nodes[0]
  const actor = live.autoRun
    ? (live.viewId ?? live.targetId ?? live.sourceId)
    : (live.targetId ?? live.viewId ?? live.sourceId)
  const helperCount = live.helperIds.length
  const memberCount = live.snapshot?.nodes.length ?? 0
  const runningCount = live.snapshot?.nodes.filter((node) => node.process_state === 'running').length ?? 0
  const nextTarget = live.viewId ? live.snapshot?.next_targets?.[live.viewId] : undefined
  const pathCopy = {
    healthy: 'Ping. The target ACKs inside the ACK timeout. Membership stays alive.',
    failure: `Ping. No ACK in ${live.ackTimeoutMs} ms → suspected (orange). Select ${live.kHelpers} helpers, click Ping helpers, wait ${live.suspicionTimeoutMs} ms, then failed (red).`,
    refute:
      'Ping. The ACK is dropped (lossy, not crashed). Target goes suspected (orange), then increments incarnation and infects Alive — table back to green.',
  }[live.path]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <section className="rounded-xl border border-line bg-panel p-4">
          <PhaseStrip snapshot={live.snapshot} event={live.latest} />
          {live.error ? <p className="mt-3 text-sm text-failed">{live.error}</p> : null}
        </section>

        <section className="rounded-xl border border-accent/30 bg-accent-dim/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Judge demo</p>
          <p className="mt-2 text-sm text-ink">
            Click-to-inspect always works. Manual Ping still uses source then target. Auto-run / Run one period makes
            every alive member probe once per protocol period (paper Figure 1).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={live.path === 'healthy' ? demoBtn : btnClass}
              disabled={live.probing || live.autoRun}
              onClick={() => live.setPath('healthy')}
            >
              Healthy path (PING → ACK)
            </button>
            <button
              type="button"
              className={live.path === 'failure' ? demoBtn : btnClass}
              disabled={live.probing || live.autoRun}
              onClick={() => live.setPath('failure')}
            >
              Failure path (timeout → helpers → suspect → fail)
            </button>
            <button
              type="button"
              className={live.path === 'refute' ? demoBtn : btnClass}
              disabled={live.probing || live.autoRun}
              onClick={() => live.setPath('refute')}
            >
              Alive refute (suspect → Alive)
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-mute">
              ACK timeout
              <span className="ml-2 font-mono text-ink">{live.ackTimeoutMs} ms</span>
              <input
                type="range"
                min={200}
                max={5000}
                step={100}
                className="mt-1 w-full"
                value={live.ackTimeoutMs}
                disabled={live.probing}
                onChange={(event) => live.setAckTimeoutMs(Number(event.target.value))}
              />
            </label>
            <label className="text-xs text-mute">
              Suspicion timeout (then fail)
              <span className="ml-2 font-mono text-ink">{live.suspicionTimeoutMs} ms</span>
              <input
                type="range"
                min={500}
                max={10000}
                step={100}
                className="mt-1 w-full"
                value={live.suspicionTimeoutMs}
                disabled={live.probing && !live.awaitingHelpers}
                onChange={(event) => live.setSuspicionTimeoutMs(Number(event.target.value))}
              />
            </label>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-mute">
            <li>
              {live.autoRun
                ? 'Auto-run is on. Click any node to inspect its membership list. Periods keep probing round-robin or random targets.'
                : 'Click source, then target, then Ping — or press Run one period so every member probes.'}
            </li>
            <li>{pathCopy}</li>
            <li>
              Join contacts one member and infects Alive. Leave infects Confirm so others do not wait for a timeout.
            </li>
          </ol>
        </section>

        {live.snapshot ? (
          <LiveRing
            snapshot={live.snapshot}
            sourceId={live.sourceId}
            targetId={live.targetId}
            viewId={live.viewId}
            helperIds={live.helperIds.length ? live.helperIds : (live.snapshot.helper_ids ?? [])}
            packets={live.packets}
            onSelect={live.selectNode}
          />
        ) : (
          <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-line bg-panel text-sm text-mute">
            {live.loading ? 'Starting live SWIM cluster…' : 'Backend unreachable. Start FastAPI and retry.'}
          </div>
        )}

        <section className="rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 font-mono text-sm text-accent">
              {live.sourceId && live.targetId
                ? `${displayNodeId(live.sourceId)} → ${displayNodeId(live.targetId)}`
                : live.viewId
                  ? displayNodeId(live.viewId)
                  : '—'}
            </span>
            <button
              type="button"
              className={demoBtn}
              onClick={() => void live.probe()}
              disabled={
                live.autoRun
                  ? true
                  : live.awaitingHelpers
                    ? helperCount === 0 || live.probing
                    : !live.sourceId || !live.targetId || live.probing
              }
            >
              {live.awaitingHelpers ? `Ping helpers (${helperCount}/${live.kHelpers})` : 'Ping'}
            </button>
            <button
              type="button"
              className={live.autoRun ? demoBtn : btnClass}
              disabled={!live.snapshot || live.awaitingHelpers || (live.probing && !live.autoRun)}
              onClick={() => void live.toggleAutoRun()}
            >
              {live.autoRun ? 'Auto-run on' : 'Auto-run'}
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={!live.snapshot || live.autoRun || live.probing || live.awaitingHelpers}
              onClick={() => void live.runPeriod()}
            >
              Run one period
            </button>
            {live.awaitingHelpers ? (
              <div className="w-full space-y-2">
                <p className="text-xs text-suspect">
                  {displayNodeId(live.targetId ?? 'target')} is suspected. Select {live.kHelpers} helpers, then click{' '}
                  <span className="font-semibold">Ping helpers</span>. After that timeout it is declared failed.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(live.snapshot?.nodes ?? [])
                    .filter((node) => node.node_id !== live.sourceId && node.node_id !== live.targetId)
                    .map((node) => {
                      const on = live.helperIds.includes(node.node_id)
                      return (
                        <button
                          key={node.node_id}
                          type="button"
                          className={on ? demoBtn : btnClass}
                          onClick={() => live.toggleHelper(node.node_id)}
                        >
                          {displayNodeId(node.node_id)}
                        </button>
                      )
                    })}
                </div>
              </div>
            ) : null}
            <button type="button" className={btnClass} disabled={!actor || (live.probing && !live.autoRun)} onClick={() => actor && live.actions.crash(actor)}>
              Crash
            </button>
            <button type="button" className={btnClass} disabled={!actor || (live.probing && !live.autoRun)} onClick={() => actor && live.actions.freeze(actor)}>
              Freeze
            </button>
            <button type="button" className={btnClass} disabled={!actor || (live.probing && !live.autoRun)} onClick={() => actor && live.actions.isolate(actor)}>
              Isolate
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={!live.snapshot || (live.probing && !live.autoRun) || memberCount >= 16}
              onClick={() => void live.actions.join(live.autoRun ? live.viewId : (live.sourceId ?? live.viewId))}
            >
              Join
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={!actor || (live.probing && !live.autoRun) || runningCount <= 4}
              onClick={() => actor && void live.actions.leave(actor)}
            >
              Leave
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-mute">
              Probe order
              <select
                className="rounded-md border border-line bg-panel-alt px-2 py-1 text-ink"
                value={live.probeMode}
                disabled={live.probing && !live.autoRun}
                onChange={(event) => void live.changeProbeMode(event.target.value as 'round_robin' | 'random')}
              >
                <option value="round_robin">Round-robin</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-mute">
              k helpers
              <select
                className="rounded-md border border-line bg-panel-alt px-2 py-1 text-ink"
                value={live.kHelpers}
                disabled={live.probing}
                onChange={(event) => live.actions.setK(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-mute">
              Delay
              <input
                type="range"
                min={0}
                max={400}
                value={live.delayMs}
                disabled={live.probing}
                onChange={(event) => live.actions.setDelay(Number(event.target.value))}
              />
              <span className="w-12 font-mono text-ink">{live.delayMs}ms</span>
            </label>
            <p className="text-xs text-mute">
              {live.autoRun
                ? 'Auto-run: click a node to inspect. Periods keep running on the ring.'
                : live.path === 'failure'
                  ? 'Failure path: ping will not get an ACK in time. You pick the helpers.'
                  : live.path === 'refute'
                    ? 'Refute path: ACK is dropped, then the alive target infects Alive with a higher incarnation.'
                    : 'Healthy path: ping should get an ACK before the ACK timeout.'}
            </p>
            <button type="button" className={`${btnClass} ml-auto inline-flex items-center gap-2`} onClick={() => void live.restart()}>
              <RotateCcw size={12} aria-hidden="true" />
              New cluster
            </button>
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">Counters</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Protocol period" value={String(live.snapshot?.protocol_period ?? 0)} accent />
            <Row label="Packets sent" value={String(live.snapshot?.packets_sent ?? 0)} />
            <Row label="Updates piggybacked" value={String(live.snapshot?.piggybacked_updates ?? 0)} />
            <Row label="Extra broadcasts" value={String(live.snapshot?.extra_broadcast_packets ?? 0)} />
            <Row
              label="Piggyback cap"
              value={`λ log₂ N = ${live.snapshot?.piggyback_limit ?? 0}`}
            />
            <Row
              label="Completeness"
              value={`≤ 2N = ${live.snapshot?.completeness_bound_periods ?? 2 * memberCount} periods`}
            />
            <Row
              label="UDP"
              value={
                live.snapshot?.udp_enabled
                  ? `bound · ${Object.keys(live.snapshot.udp_ports ?? {}).length} sockets`
                  : 'in-process datagrams'
              }
            />
          </dl>
        </section>

        {live.snapshot ? <MembershipMatrix snapshot={live.snapshot} viewId={live.viewId} onSelect={live.setViewId} /> : null}

        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">
            Membership view — as seen by {selected ? displayNodeId(selected.node_id) : '—'}
          </h2>
          {nextTarget ? (
            <p className="mt-1 text-[11px] text-mute">
              Next round-robin probe: {displayNodeId(selected?.node_id ?? '')} → {displayNodeId(nextTarget)}
            </p>
          ) : null}
          {selected && live.snapshot?.probe_deadlines?.[selected.node_id] != null ? (
            <p className="mt-1 text-[11px] text-accent">
              {displayNodeId(selected.node_id)} is pinged within ≤ {live.snapshot.completeness_bound_periods ?? 2 * memberCount}{' '}
              periods. Next: {displayNodeId(live.snapshot.probe_deadline_by?.[selected.node_id] ?? '—')} in{' '}
              {live.snapshot.probe_deadlines[selected.node_id]} period
              {live.snapshot.probe_deadlines[selected.node_id] === 1 ? '' : 's'}.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-mute">
              Round-robin completeness: a failed member is first probed within ≤ 2N periods.
            </p>
          )}
          {selected ? (
            <ul className="mt-3 space-y-1.5 font-mono text-xs">
              {selected.local_view.map((entry) => (
                <li key={entry.node_id} className="flex items-center justify-between gap-2">
                  <span>
                    {displayNodeId(entry.node_id)}
                    {entry.node_id === selected.node_id ? ' (me)' : ''}
                  </span>
                  <span className="rounded-full px-2 py-0.5" style={{ color: STATUS_COLOR[entry.status], background: `${STATUS_COLOR[entry.status]}22` }}>
                    {entry.status}
                  </span>
                  <span className="text-mute">#{entry.incarnation}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-mute">Click a node to inspect its local membership list.</p>
          )}
        </section>

        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">Latest update — who knows it</h2>
          <p className="mt-2 text-sm text-ink">{live.snapshot?.latest_update_label ?? 'none yet'}</p>
          <p className="mt-1 font-mono text-xs text-mute">
            {(live.snapshot?.latest_update_knowers ?? []).map(displayNodeId).join(', ') || 'Run the failure path to watch suspicion and failure infect the group.'}
          </p>
        </section>

        {live.snapshot ? <InfectionChart events={live.events} snapshot={live.snapshot} /> : null}

        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">Event log</h2>
          <ol className="mt-3 max-h-64 space-y-1 overflow-auto font-mono text-[11px]">
            {[...live.events].slice(-18).reverse().map((event) => (
              <li key={event.event_id} className="text-mute">
                <span className="text-accent">{event.sim_time.toFixed(1)}s</span>{' '}
                {event.source_node ? displayNodeId(event.source_node) : ''}
                {event.source_node && event.target_node ? ' → ' : ''}
                {event.target_node ? displayNodeId(event.target_node) : ''}{' '}
                <span className="uppercase text-ink">{event.event_type}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  )
}

const btnClass =
  'rounded-md border border-line bg-panel-alt px-3 py-1.5 text-xs text-ink hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'

const demoBtn =
  'rounded-md border border-accent/40 bg-accent-dim px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-dim/80 disabled:cursor-not-allowed disabled:opacity-40'

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-mute">{label}</dt>
      <dd className={`font-mono ${accent ? 'text-alive' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
