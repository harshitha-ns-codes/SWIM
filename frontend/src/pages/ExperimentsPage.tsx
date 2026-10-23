import { PlaceholderPage } from './PlaceholderPage'

export function ExperimentsPage() {
  return (
    <PlaceholderPage
      title="Results"
      summary="Paper §5 plots. Live Simulator is the protocol; this page is N, loss, detection time, and false positives. Persistence can wait."
      planned={[
        'Figure 2 — messages per member vs group size (should stay ~constant)',
        'Figure 3 — time to first detection, infection latency, suspicion timeout',
        'Figure 4 — 10% loss, join sequence, Basic vs Inf vs Inf+Susp',
        'False positives vs suspicion timeout',
      ]}
    />
  )
}
