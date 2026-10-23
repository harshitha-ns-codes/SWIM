import { displayNodeId, matrixCell, STATUS_COLOR } from '../../live/format'
import type { Snapshot } from '../../types/simulation'

export function MembershipMatrix({
  snapshot,
  viewId,
  onSelect,
}: {
  snapshot: Snapshot
  viewId: string | null
  onSelect: (nodeId: string) => void
}) {
  const ids = snapshot.nodes.map((node) => node.node_id)

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">Every node&apos;s membership list</h2>
      <p className="mt-1 text-[11px] text-mute">
        Row is who is looking, column is who they look at. Click a row to open that view.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr>
              <th className="p-1" />
              {ids.map((id) => (
                <th key={id} className="p-1 font-medium text-mute">
                  {displayNodeId(id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((observerId) => (
              <tr
                key={observerId}
                className={observerId === viewId ? 'bg-accent-dim/40' : 'hover:bg-panel-alt'}
                onClick={() => onSelect(observerId)}
              >
                <th className="cursor-pointer p-1 text-left font-semibold text-accent">
                  {displayNodeId(observerId)}
                </th>
                {ids.map((subjectId) => {
                  const cell = matrixCell(snapshot, observerId, subjectId)
                  if (cell === 'self') {
                    return (
                      <td key={subjectId} className="p-1 text-center text-mute">
                        ·
                      </td>
                    )
                  }
                  if (cell === 'unknown') {
                    return (
                      <td key={subjectId} className="p-1 text-center text-mute" title={`${observerId} has not learned ${subjectId} yet`}>
                        –
                      </td>
                    )
                  }
                  const mark = cell === 'failed' ? '×' : cell === 'suspected' ? '?' : '•'
                  return (
                    <td key={subjectId} className="p-1 text-center" title={`${observerId} sees ${subjectId} as ${cell}`}>
                      <span
                        className="inline-flex min-w-7 items-center justify-center rounded px-1.5 py-0.5 font-bold"
                        style={{
                          background: cell === 'alive' ? `${STATUS_COLOR[cell]}22` : `${STATUS_COLOR[cell]}55`,
                          color: STATUS_COLOR[cell],
                        }}
                      >
                        {mark}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
