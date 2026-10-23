import { describe, expect, it } from 'vitest'
import { API_BASE_URL, websocketUrl } from './config'

describe('API and WebSocket origin', () => {
  it('builds WebSocket URLs from the same configured API origin', () => {
    const socket = websocketUrl('/ws/simulation/session-1')
    const api = new URL(API_BASE_URL)
    const ws = new URL(socket)
    expect(ws.hostname).toBe(api.hostname)
    expect(ws.port).toBe(api.port)
    expect(ws.pathname).toBe('/ws/simulation/session-1')
    expect(ws.protocol === 'ws:' || ws.protocol === 'wss:').toBe(true)
    expect(api.protocol === 'http:' || api.protocol === 'https:').toBe(true)
  })
})
