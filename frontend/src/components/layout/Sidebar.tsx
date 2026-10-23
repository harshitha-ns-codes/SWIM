import { Activity, BookOpen, FlaskConical, LayoutDashboard, Network } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, exact: true, ready: true },
  { to: '/simulator', label: 'Live Simulator', icon: Activity, exact: false, ready: true },
  { to: '/experiments', label: 'Results', icon: FlaskConical, exact: false, ready: false },
  { to: '/paper', label: 'Paper', icon: BookOpen, exact: false, ready: false },
]

export function Sidebar() {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-line bg-panel md:h-screen md:w-60 md:border-r md:border-b-0">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-10 items-center justify-center rounded-lg border border-line bg-panel-alt text-accent">
          <Network size={20} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide text-ink">SWIM</p>
          <p className="text-xs text-mute">Membership protocol lab</p>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible" aria-label="Primary">
        {links.map((link) => {
          const Icon = link.icon
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.exact}
              className={({ isActive }) =>
                [
                  'flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-accent-dim/60 text-accent'
                    : 'text-mute hover:bg-panel-alt hover:text-ink',
                ].join(' ')
              }
            >
              <Icon size={16} aria-hidden="true" />
              <span>{link.label}</span>
              {!link.ready ? (
                <span className="ml-auto hidden rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-mute md:inline">
                  Later
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <div className="hidden border-t border-line px-5 py-4 text-xs text-mute md:block">
        <p className="font-medium text-ink/80">Guided + Live</p>
        <p className="mt-1 leading-relaxed">In-memory sessions. Restart clears the cluster.</p>
      </div>
    </aside>
  )
}
