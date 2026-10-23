import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../types/simulation'
import { displayNodeId, matrixCell } from './format'

const snapshot = {
  nodes: [
    {
      node_id: 'n0',
      process_state: 'running',
      display_status: 'alive',
      incarnation: 0,
      position: { x: 0, y: 0 },
      local_view: [
        { node_id: 'n0', status: 'alive', incarnation: 0 },
        { node_id: 'n7', status: 'suspected', incarnation: 0 },
      ],
    },
    {
      node_id: 'n7',
      process_state: 'crashed',
      display_status: 'suspected',
      incarnation: 0,
      position: { x: 1, y: 1 },
      local_view: [
        { node_id: 'n0', status: 'alive', incarnation: 0 },
        { node_id: 'n7', status: 'alive', incarnation: 0 },
      ],
    },
  ],
} as Snapshot

describe('live membership matrix', () => {
  it('marks self cells and exposes observer-local suspicion', () => {
    expect(displayNodeId('n7')).toBe('N7')
    expect(matrixCell(snapshot, 'n0', 'n0')).toBe('self')
    expect(matrixCell(snapshot, 'n0', 'n7')).toBe('suspected')
    expect(matrixCell(snapshot, 'n7', 'n0')).toBe('alive')
  })

  it('marks members the observer has not learned yet as unknown', () => {
    const joining = {
      ...snapshot,
      nodes: [
        ...snapshot.nodes,
        {
          node_id: 'n8',
          process_state: 'running',
          display_status: 'alive',
          incarnation: 0,
          position: { x: 2, y: 2 },
          local_view: [{ node_id: 'n0', status: 'alive', incarnation: 0 }],
        },
      ],
    } as Snapshot
    expect(matrixCell(joining, 'n0', 'n8')).toBe('unknown')
    expect(matrixCell(joining, 'n8', 'n0')).toBe('alive')
  })
})
