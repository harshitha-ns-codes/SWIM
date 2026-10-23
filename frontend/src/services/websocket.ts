import { websocketUrl } from './config'
import type { ProtocolEvent, Snapshot } from '../types/simulation'

export type SimulationSocketMessage =
  | {
      type: 'init'
      session_id: string
      snapshot: Snapshot
      events: ProtocolEvent[]
    }
  | {
      type: 'event'
      event: ProtocolEvent
      snapshot: Snapshot
    }
  | {
      type: 'error'
      code: string
      detail: string
    }
  | {
      type: 'ping'
    }

export interface SimulationSocketHandlers {
  onInit: (message: Extract<SimulationSocketMessage, { type: 'init' }>) => void
  onEvent?: (message: Extract<SimulationSocketMessage, { type: 'event' }>) => void
  onError?: (message: Extract<SimulationSocketMessage, { type: 'error' }>) => void
  onClose?: () => void
}

export function connectSimulationSocket(
  sessionId: string,
  handlers: SimulationSocketHandlers,
): () => void {
  const url = websocketUrl(`/ws/simulation/${sessionId}`)
  const socket = new WebSocket(url)
  let closedByUs = false

  socket.onmessage = (event) => {
    if (closedByUs) {
      return
    }
    const message = JSON.parse(event.data as string) as SimulationSocketMessage
    if (message.type === 'init') {
      handlers.onInit(message)
      return
    }
    if (message.type === 'event') {
      handlers.onEvent?.(message)
      return
    }
    if (message.type === 'error') {
      handlers.onError?.(message)
    }
  }

  socket.onerror = () => {
    if (closedByUs) {
      return
    }
    handlers.onError?.({
      type: 'error',
      code: 'websocket_error',
      detail: `WebSocket connection failed for session ${sessionId} at ${url}.`,
    })
  }

  socket.onclose = () => {
    if (closedByUs) {
      return
    }
    handlers.onClose?.()
  }

  return () => {
    closedByUs = true
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.onopen = () => {
        socket.close()
      }
      return
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.close()
    }
  }
}
