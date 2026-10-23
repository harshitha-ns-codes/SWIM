import { describe, expect, it } from 'vitest'
import { isLivePath, liveHandoff } from './handoff'

describe('live handoff', () => {
  it('maps guided scenarios onto Live presets', () => {
    expect(liveHandoff('successful_probe')).toEqual({
      path: 'healthy',
      href: '/simulator?path=healthy',
      cue: 'Healthy ping',
    })
    expect(liveHandoff('suspicion_recovery').path).toBe('refute')
    expect(liveHandoff('crash_and_convergence').href).toContain('failure')
    expect(liveHandoff(undefined).href).toBe('/simulator')
  })

  it('accepts live path query values', () => {
    expect(isLivePath('refute')).toBe(true)
    expect(isLivePath('gossip')).toBe(false)
  })
})
