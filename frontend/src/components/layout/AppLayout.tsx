import { Outlet } from 'react-router-dom'
import { SimulationProvider } from '../../hooks/useSimulation'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <SimulationProvider>
      <div className="min-h-screen bg-canvas text-ink md:flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SimulationProvider>
  )
}
