import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ExperimentsPage } from './pages/ExperimentsPage'
import { HowSwimWorksPage } from './pages/HowSwimWorksPage'
import { OverviewPage } from './pages/OverviewPage'
import { SimulatorPage } from './pages/SimulatorPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/paper" element={<HowSwimWorksPage />} />
          <Route path="/how-it-works" element={<Navigate to="/paper" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
