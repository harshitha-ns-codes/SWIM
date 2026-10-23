export type LivePath = 'healthy' | 'failure' | 'refute'

export interface LiveHandoff {
  path: LivePath
  href: string
  cue: string
}

const DEFAULT_HANDOFF: LiveHandoff = {
  path: 'healthy',
  href: '/simulator',
  cue: 'Live cluster',
}

export const LIVE_HANDOFF: Record<string, LiveHandoff> = {
  successful_probe: {
    path: 'healthy',
    href: '/simulator?path=healthy',
    cue: 'Healthy ping',
  },
  suspicion_recovery: {
    path: 'refute',
    href: '/simulator?path=refute',
    cue: 'Alive refute',
  },
  crash_and_convergence: {
    path: 'failure',
    href: '/simulator?path=failure',
    cue: 'Failure path',
  },
}

export function liveHandoff(scenarioId: string | null | undefined): LiveHandoff {
  if (!scenarioId) {
    return DEFAULT_HANDOFF
  }
  return LIVE_HANDOFF[scenarioId] ?? DEFAULT_HANDOFF
}

export function isLivePath(value: string | null): value is LivePath {
  return value === 'healthy' || value === 'failure' || value === 'refute'
}
