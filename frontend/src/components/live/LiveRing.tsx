import { useEffect, useMemo, useState } from 'react'
import type { FlyingPacket } from '../../hooks/useLiveSimulator'
import { displayNodeId, STATUS_COLOR } from '../../live/format'
import type { NodeSnapshot, Snapshot } from '../../types/simulation'

export function LiveRing({
  snapshot,
  sourceId,
  targetId,
  viewId,
  helperIds,
  packets,
  onSelect,
}: {
  snapshot: Snapshot
  sourceId: string | null
  targetId: string | null
  viewId: string | null
  helperIds: string[]
  packets: FlyingPacket[]
  onSelect: (nodeId: string) => void
}) {
  const nodes = snapshot.nodes
  const [now, setNow] = useState(() => performance.now())
  const viewBox = useMemo(() => computeViewBox(nodes), [nodes])

  useEffect(() => {
    if (packets.length === 0) {
      return
    }
    let frame = 0
    const loop = (time: number) => {
      setNow(time)
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(frame)
  }, [packets.length])

  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-2xl bg-[#0c1322]">
      <svg role="img" aria-label="SWIM cluster ring" viewBox={viewBox} className="h-[460px] w-full">
        <circle cx="0" cy="0" r="168" fill="none" stroke="#223049" strokeWidth="1.5" />
        {nodes.map((node) => {
          const source = node
          const target = nodes[(nodes.indexOf(node) + 1) % nodes.length]
          return (
            <line
              key={`ring-${node.node_id}`}
              x1={source.position.x}
              y1={source.position.y}
              x2={target.position.x}
              y2={target.position.y}
              stroke="#223049"
              strokeWidth="1.5"
            />
          )
        })}
        {packets.map((packet) => {
          const from = nodes.find((node) => node.node_id === packet.source)
          const to = nodes.find((node) => node.node_id === packet.target)
          if (!from || !to) {
            return null
          }
          const progress = Math.min(1, (now - packet.born) / 720)
          const x = from.position.x + (to.position.x - from.position.x) * progress
          const y = from.position.y + (to.position.y - from.position.y) * progress
          const color = packet.label === 'ACK' ? '#34d399' : packet.label === 'PING-REQ' ? '#a78bfa' : '#38bdf8'
          return (
            <g key={packet.id}>
              <line
                x1={from.position.x}
                y1={from.position.y}
                x2={to.position.x}
                y2={to.position.y}
                stroke={color}
                strokeOpacity="0.35"
                strokeWidth="2.5"
              />
              <g transform={`translate(${x} ${y})`}>
                <circle r={packet.piggybacked ? 9 : 7} fill={color} />
                {packet.piggybacked ? <circle r={3} fill="#f8fafc" /> : null}
                <text y={-12} textAnchor="middle" fill="#e8eef9" fontSize="10" fontFamily="IBM Plex Mono, monospace">
                  {packet.label}
                </text>
              </g>
            </g>
          )
        })}
        {nodes.map((node) => {
          const observed = node.display_status
          const failed = observed === 'failed'
          const isSource = node.node_id === sourceId
          const isTarget = node.node_id === targetId
          const isHelper = helperIds.includes(node.node_id)
          const isView = node.node_id === viewId
          return (
            <g
              key={node.node_id}
              transform={`translate(${node.position.x} ${node.position.y})`}
              className="cursor-pointer"
              onClick={() => onSelect(node.node_id)}
            >
              <title>{`${displayNodeId(node.node_id)} · ${observed} · ${node.process_state}`}</title>
              <circle r={30} fill="transparent" />
              {isSource || isTarget || isHelper ? (
                <circle
                  r={32}
                  fill="none"
                  stroke={isSource ? '#2dd4bf' : isTarget ? '#f59e0b' : isHelper ? '#a78bfa' : '#2dd4bf'}
                  strokeOpacity="0.45"
                  strokeWidth="7"
                />
              ) : null}
              <circle
                r={isView || isSource || isTarget || isHelper ? 24 : 20}
                fill={failed ? '#7f1d1d' : '#122033'}
                stroke={STATUS_COLOR[observed]}
                strokeWidth={isView || isHelper ? 4 : 3}
              />
              <text textAnchor="middle" dy="4" fill="#e8eef9" fontSize="12" fontFamily="IBM Plex Mono, monospace">
                {displayNodeId(node.node_id)}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border border-line bg-panel/90 px-3 py-2 text-[11px] text-mute">
        <Legend color="#22c55e" label="Alive" />
        <Legend color="#f59e0b" label="Suspect" />
        <Legend color="#ef4444" label="Failed" />
        <Legend color="#38bdf8" label="PING" />
        <Legend color="#34d399" label="ACK" />
        <Legend color="#a78bfa" label="PING-REQ" />
        <li>small dots = piggybacked gossip</li>
      </ul>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </li>
  )
}

function computeViewBox(nodes: NodeSnapshot[]): string {
  if (nodes.length === 0) {
    return '-220 -220 440 440'
  }
  const xs = nodes.map((node) => node.position.x)
  const ys = nodes.map((node) => node.position.y)
  const pad = 72
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  return `${minX} ${minY} ${Math.max(...xs) - minX + pad} ${Math.max(...ys) - minY + pad}`
}
