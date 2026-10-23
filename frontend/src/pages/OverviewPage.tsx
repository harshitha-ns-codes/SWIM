import { EventTimeline } from '../components/activity/EventTimeline'
import { MetricsRow } from '../components/metrics/MetricsRow'
import { OverviewNow } from '../components/playback/OverviewNow'
import { ScenarioGrid } from '../components/scenarios/ScenarioGrid'
import { TopologyPreview } from '../components/topology/TopologyPreview'
import { usePlayback } from '../hooks/usePlayback'
import { useSimulation } from '../hooks/useSimulation'

export function OverviewPage() {
  const {
    snapshot,
    events,
    emptyMessage,
    sessionError,
    loading,
    backendStatus,
    runScenario,
    startingScenarioId,
  } = useSimulation()
  const playback = usePlayback(snapshot, events)

  return (
    <div className="space-y-5">
      {sessionError ? (
        <div className="rounded-xl border border-failed/30 bg-failed/10 px-4 py-3 text-sm text-failed">
          {sessionError}
        </div>
      ) : null}

      {loading && backendStatus === 'checking' ? (
        <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-mute">
          Checking backend…
        </div>
      ) : null}

      <MetricsRow metrics={playback.frame?.metrics ?? null} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_300px]">
        <TopologyPreview snapshot={snapshot} frame={playback.frame} packetProgress={playback.packetProgress} />
        <OverviewNow
          snapshot={snapshot}
          frame={playback.frame}
          index={Math.max(0, playback.index)}
          total={events.length}
          playing={playback.playing}
          speed={playback.speed}
          canReset={Boolean(snapshot?.scenario_id) && backendStatus === 'connected'}
          resetting={startingScenarioId !== null}
          disabled={backendStatus !== 'connected'}
          onPlay={playback.play}
          onPause={playback.pause}
          onStep={playback.stepForward}
          onReset={() => {
            if (snapshot?.scenario_id) {
              void runScenario(snapshot.scenario_id)
            }
          }}
          onCycleSpeed={playback.cycleSpeed}
        />
      </div>

      <ScenarioGrid />
      <EventTimeline
        events={events}
        selectedIndex={playback.index}
        emptyMessage={emptyMessage}
        loading={false}
        error={sessionError}
        completed={playback.completed}
        onSelect={playback.selectIndex}
      />
    </div>
  )
}
