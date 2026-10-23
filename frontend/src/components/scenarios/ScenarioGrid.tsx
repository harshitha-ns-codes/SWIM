import { ArrowRight, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSimulation } from '../../hooks/useSimulation'
import { LIVE_HANDOFF } from '../../live/handoff'
import type { Difficulty, ScenarioDefinition } from '../../types/simulation'

const difficultyClass: Record<Difficulty, string> = {
  beginner: 'border-accent/30 text-accent',
  intermediate: 'border-suspect/30 text-suspect',
  advanced: 'border-failed/30 text-failed',
}

export function ScenarioGrid() {
  const {
    scenarios,
    scenariosError,
    backendStatus,
    runScenario,
    startingScenarioId,
    snapshot,
  } = useSimulation()

  if (scenariosError) {
    return (
      <section className="rounded-xl border border-failed/30 bg-panel p-5 text-sm text-failed">
        Could not load scenarios. {scenariosError}
      </section>
    )
  }

  if (scenarios.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
        Waiting for scenarios…
      </section>
    )
  }

  return (
    <section aria-label="Guided scenarios" className="grid gap-4 lg:grid-cols-3">
      {scenarios.map((scenario) => (
        <ScenarioCard
          key={scenario.id}
          scenario={scenario}
          disabled={backendStatus !== 'connected' || startingScenarioId !== null}
          running={startingScenarioId === scenario.id}
          active={snapshot?.scenario_id === scenario.id}
          onRun={() => void runScenario(scenario.id)}
        />
      ))}
    </section>
  )
}

function ScenarioCard({
  scenario,
  disabled,
  running,
  active,
  onRun,
}: {
  scenario: ScenarioDefinition
  disabled: boolean
  running: boolean
  active: boolean
  onRun: () => void
}) {
  const handoff = LIVE_HANDOFF[scenario.id]

  return (
    <article className={`flex h-full flex-col rounded-xl border bg-panel p-4 ${active ? 'border-accent/40' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{scenario.title}</h3>
        <span className={`rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${difficultyClass[scenario.difficulty]}`}>
          {scenario.difficulty}
        </span>
      </div>
      <p className="mt-3 flex-1 text-sm text-mute">{scenario.objective}</p>
      <div className="mt-4 flex flex-col gap-2">
        {handoff ? (
          <Link
            to={handoff.href}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent-dim px-3 py-2 text-sm font-medium text-accent hover:bg-accent-dim/80"
          >
            Try on Live
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onRun}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-mute hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={12} aria-hidden="true" />
          {running ? 'Starting…' : active ? 'Replay tape' : 'Play tape'}
        </button>
      </div>
    </article>
  )
}
