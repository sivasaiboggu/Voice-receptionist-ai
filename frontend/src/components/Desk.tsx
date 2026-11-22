import type { ReactNode } from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'

export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p className="reading">{description}</p>
      </div>
      {children && <div className="heading-action">{children}</div>}
    </header>
  )
}

export function SectionHeading({ title, note, children }: { title: string; note?: string; children?: ReactNode }) {
  return (
    <header className="section-heading">
      <div><h2>{title}</h2>{note && <p className="muted">{note}</p>}</div>
      {children}
    </header>
  )
}

export function ActionLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="action-link">{children}<ArrowUpRight size={16} aria-hidden="true" /></Link>
}

export function LoadingRows({ label }: { label: string }) {
  return (
    <div className="loading-rows" role="status">
      <p className="muted">{label}</p>
      <div aria-hidden="true"><span /><span /><span /></div>
    </div>
  )
}

export function LoadError({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return (
    <div className="load-error">
      <div role="alert"><h2>{title}</h2><p className="reading">{message}</p></div>
      <Button variant="outline" onClick={retry}><RefreshCw size={16} aria-hidden="true" />Try again</Button>
    </div>
  )
}

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state"><p><strong>{title}</strong></p><p className="reading muted">{description}</p>{children}</div>
}
