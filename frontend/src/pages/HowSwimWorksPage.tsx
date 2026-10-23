import { PlaceholderPage } from './PlaceholderPage'

export function HowSwimWorksPage() {
  return (
    <PlaceholderPage
      title="Paper"
      summary="Cornell 2002 walkthrough (Figure 1, incarnation rules, 2N bound). The live protocol is already on Live Simulator; this page is the story, not a second engine."
      planned={[
        'Why heartbeats do not scale (quadratic load)',
        'Figure 1: one period — PING, k PING-REQ, ACK',
        'Infection piggyback vs multicast',
        'Suspect / Alive / Confirm + incarnation override',
        'Round-robin completeness ≤ ~2N periods',
      ]}
    />
  )
}
