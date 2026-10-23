import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PlaceholderPage({
  title,
  summary,
  planned,
}: {
  title: string
  summary: string
  planned: string[]
}) {
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-line bg-panel p-6">
      <p className="text-xs uppercase tracking-wide text-suspect">Not yet implemented</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-mute">{summary}</p>
      <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-ink/90">
        {planned.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm text-accent">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to Overview
      </Link>
    </section>
  )
}
