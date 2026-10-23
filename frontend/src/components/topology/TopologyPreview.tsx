import { useMemo, useState } from 'react'
import type { PlaybackFrame } from '../../playback/replay'
import type { MemberStatus, NodeSnapshot, Snapshot } from '../../types/simulation'

const STATUS_COLOR: Record<MemberStatus, string> = {
  alive: '#22c55e',
  suspected: '#f59e0b',
  failed: '#ef4444',
}

export function TopologyPreview({
  snapshot,
  frame,
  packetProgress,
}: {
  snapshot: Snapshot | null
  frame: PlaybackFrame | null
  packetProgress: number
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const nodes = frame?.nodes ?? snapshot?.nodes ?? []
  const selected = nodes.find((node) => node.node_id === (selectedId ?? hoveredId)) ?? null
  const viewBox = useMemo(() => computeViewBox(snapshot?.nodes ?? []), [snapshot])

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Cluster</h2>
          <p className="text-xs text-mute">Dot = process · ring = observed</p>
        </div>
      </div>

      {!snapshot || !frame ? (
        <div className="flex min-h-[360px] items-center justify-center px-6 text-center text-sm text-mute">
          Play a tape to load the cluster.
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative min-h-[400px] bg-[#0d1424]">
            <svg role="img" aria-label="Cluster topology" viewBox={viewBox} className="h-[400px] w-full">
              {frame.overlayEdges.map((edge) => {
                const source = nodePoint(frame, edge.source)
                const target = nodePoint(frame, edge.target)
                if (!source || !target) {
                  return null
                }
                const active =
                  frame.highlightEdge &&
                  ((frame.highlightEdge.source === edge.source && frame.highlightEdge.target === edge.target) ||
                    (frame.highlightEdge.source === edge.target && frame.highlightEdge.target === edge.source))
                return (
                  <line
                    key={`${edge.source}-${edge.target}-overlay`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={active ? '#2dd4bf' : '#2a3550'}
                    strokeWidth={active ? 3 : 2}
                  />
                )
              })}
              {frame.highlightEdge ? (
                <ProbeEdge frame={frame} />
              ) : null}
              {frame.packet ? <PacketMarker frame={frame} progress={packetProgress} /> : null}
              {frame.nodes.map((node) => {
                const isActive = frame.highlightNodeIds.includes(node.node_id)
                const isSelected = selected?.node_id === node.node_id
                const crashed = node.process_state === 'crashed'
                return (
                  <g
                    key={node.node_id}
                    transform={`translate(${node.position.x} ${node.position.y})`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredId(node.node_id)}
                    onMouseLeave={() => setHoveredId((current) => (current === node.node_id ? null : current))}
                    onClick={() => setSelectedId(node.node_id)}
                  >
                    <title>{`${node.node_id}: observed ${node.display_status}, process ${node.process_state}`}</title>
                    {isActive || crashed ? (
                      <circle
                        r={30}
                        fill="none"
                        stroke={crashed ? STATUS_COLOR.failed : '#2dd4bf'}
                        strokeOpacity={crashed ? 0.45 : 0.35}
                        strokeWidth="6"
                      />
                    ) : null}
                    <circle
                      r={isSelected || isActive || crashed ? 22 : 18}
                      fill={crashed ? '#7f1d1d' : '#12182b'}
                      stroke={STATUS_COLOR[node.display_status]}
                      strokeWidth={isSelected || isActive || crashed ? 3.5 : 2.5}
                      strokeDasharray={crashed && node.display_status === 'alive' ? '4 3' : undefined}
                    />
                    <circle
                      r={4.5}
                      cy={-8}
                      fill={crashed ? STATUS_COLOR.failed : STATUS_COLOR.alive}
                    />
                    <text
                      textAnchor="middle"
                      dy={crashed ? 4 : 8}
                      fill="#e8eef9"
                      fontSize="11"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {node.node_id}
                    </text>
                    {crashed ? (
                      <text
                        textAnchor="middle"
                        dy="16"
                        fill={STATUS_COLOR.failed}
                        fontSize="8"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        down
                      </text>
                    ) : null}
                  </g>
                )
              })}
            </svg>
            <StatusLegend />
          </div>
          <aside className="space-y-4 border-t border-line bg-panel-alt/60 p-4 lg:border-t-0 lg:border-l">
            <p className="text-xs uppercase tracking-wide text-mute">Selection</p>
            {selected ? <NodeDetails node={selected} /> : (
              <p className="text-sm text-mute">Click a node.</p>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}

function ProbeEdge({ frame }: { frame: PlaybackFrame }) {
  if (!frame.highlightEdge) {
    return null
  }
  const source = nodePoint(frame, frame.highlightEdge.source)
  const target = nodePoint(frame, frame.highlightEdge.target)
  if (!source || !target) {
    return null
  }
  return (
    <line
      x1={source.x}
      y1={source.y}
      x2={target.x}
      y2={target.y}
      stroke="#2dd4bf"
      strokeWidth="2.5"
      strokeDasharray={frame.packet ? undefined : '6 4'}
    />
  )
}

function PacketMarker({ frame, progress }: { frame: PlaybackFrame; progress: number }) {
  if (!frame.packet) {
    return null
  }
  const source = nodePoint(frame, frame.packet.source)
  const target = nodePoint(frame, frame.packet.target)
  if (!source || !target) {
    return null
  }
  const x = source.x + (target.x - source.x) * progress
  const y = source.y + (target.y - source.y) * progress
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={7} fill="#2dd4bf" />
      <text
        y={-12}
        textAnchor="middle"
        fill="#e8eef9"
        fontSize="10"
        fontFamily="IBM Plex Mono, monospace"
      >
        {frame.packet.label}
      </text>
    </g>
  )
}

function NodeDetails({ node }: { node: NodeSnapshot }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-mono text-ink">{node.node_id}</p>
      <dl className="space-y-1 text-xs">
        <Row label="Observed status" value={node.display_status} />
        <Row label="Process ground truth" value={node.process_state} />
        <Row label="Incarnation" value={String(node.incarnation)} />
      </dl>
      <div>
        <p className="text-xs uppercase tracking-wide text-mute">This node&apos;s local view</p>
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {node.local_view.map((entry) => (
            <li key={entry.node_id} className="flex justify-between gap-2">
              <span>{entry.node_id}</span>
              <span style={{ color: STATUS_COLOR[entry.status] }}>{entry.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-mute">{label}</dt>
      <dd className="font-mono capitalize">{value}</dd>
    </div>
  )
}

function StatusLegend() {
  return (
    <ul className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border border-line bg-panel/90 px-3 py-2 text-xs text-mute">
      {(['alive', 'suspected', 'failed'] as MemberStatus[]).map((status) => (
        <li key={status} className="flex items-center gap-1.5 capitalize">
          <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
          {status}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-alive" />
        running
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-failed" />
        down
      </li>
    </ul>
  )
}

function nodePoint(frame: PlaybackFrame, nodeId: string): { x: number; y: number } | null {
  const node = frame.nodes.find((item) => item.node_id === nodeId)
  return node ? node.position : null
}

function computeViewBox(nodes: NodeSnapshot[]): string {
  if (nodes.length === 0) {
    return '-200 -200 400 400'
  }
  const xs = nodes.map((node) => node.position.x)
  const ys = nodes.map((node) => node.position.y)
  const pad = 64
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const width = Math.max(...xs) - minX + pad
  const height = Math.max(...ys) - minY + pad
  return `${minX} ${minY} ${width} ${height}`
}
