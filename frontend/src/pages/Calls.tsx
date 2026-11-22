import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, PhoneCall, RefreshCw, Search, X } from 'lucide-react'
import { api, Call } from '../lib/api'
import EmptyState from '../components/EmptyState'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'

export default function Calls() {
  const navigate = useNavigate()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  // Search + filters — all client-side, over the real call log.
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState('all')
  const [urgency, setUrgency] = useState('all')
  const [escalatedOnly, setEscalatedOnly] = useState(false)

  const outcomes = useMemo(() => [...new Set(calls.map((c) => c.outcome))].sort(), [calls])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return calls.filter((c) => {
      if (outcome !== 'all' && c.outcome !== outcome) return false
      if (urgency !== 'all' && c.urgency !== urgency) return false
      if (escalatedOnly && !c.escalated) return false
      if (q && !`${c.caller} ${c.summary} ${c.transcript ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [calls, query, outcome, urgency, escalatedOnly])

  const filtersActive = query.trim() !== '' || outcome !== 'all' || urgency !== 'all' || escalatedOnly
  const clearFilters = () => { setQuery(''); setOutcome('all'); setUrgency('all'); setEscalatedOnly(false) }

  const load = () => {
    setLoading(true); setError('')
    api.calls().then(setCalls).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) return (
    <div className="space-y-4">
      <div><Skeleton className="h-8 w-40" /><Skeleton className="mt-2 h-4 w-80" /></div>
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
    </div>
  )
  if (error) return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Calls</h1><p className="text-sm text-muted-foreground">Every call, with transcript, summary, sentiment and urgency.</p></div>
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400"><AlertTriangle className="h-4 w-4" />Could not load calls</div>
          <p className="text-sm leading-relaxed text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" />Try again</Button>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Calls</h1><p className="text-sm text-muted-foreground">Every call, with transcript, summary, sentiment and urgency. Select a call to read the full transcript. Demo data — every entry is a simulated call, not a real patient.</p></div>

      {/* Search + filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search calls…"
              aria-label="Search calls"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Filter by outcome" className="h-10 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">All outcomes</option>
            {outcomes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} aria-label="Filter by urgency" className="h-10 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">Any urgency</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={escalatedOnly} onChange={(e) => setEscalatedOnly(e.target.checked)} className="h-4 w-4 accent-primary" />
            Escalated only
          </label>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4" />Clear</Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">Showing {filtered.length} of {calls.length} calls</span>
        </CardContent>
      </Card>

      {calls.length === 0 && (
        <EmptyState icon={PhoneCall} title="No calls yet" desc="Calls appear here as soon as the agent handles one. Try a demo call — it books an appointment and logs the whole conversation." action={<Button size="sm" onClick={() => navigate('/live')}>Run a demo call</Button>} />
      )}
      {calls.length > 0 && filtered.length === 0 && (
        <EmptyState icon={Search} title="No calls match" desc="Try a different search term or clear the filters — the calls are still there." action={<Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>} />
      )}
      {filtered.map((c) => (
        <div key={c.id}>
          <Card className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <CardHeader>
              {/* See Overview: the row flex must be an inner div, not on
                  the CardHeader — its base `flex-col` beats `flex-row`. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{c.caller} <span className="font-normal text-muted-foreground">— {c.summary}</span></CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={c.urgency === 'high' ? 'danger' : c.urgency === 'medium' ? 'warning' : 'default'}>{c.urgency}</Badge>
                  <Badge tone={c.sentiment === 'negative' ? 'danger' : c.sentiment === 'positive' ? 'success' : 'default'}>{c.sentiment}</Badge>
                  {c.escalated ? <Badge tone="danger">Escalated</Badge> : null}
                </div>
              </div>
            </CardHeader>
            {open === c.id && (
              <CardContent>
                {c.transcript ? (
                  <div className="space-y-2 rounded-xl border bg-muted/50 p-4 shadow-inner">
                    {c.transcript.split('\n').filter(Boolean).map((line, i) => {
                      const isCaller = line.startsWith('Caller:')
                      const text = line.replace(/^(Agent|Caller):\s?/, '')
                      return (
                        <div key={i} className={`flex gap-2 text-sm leading-relaxed ${isCaller ? 'border-l-2 border-primary/60 pl-3' : 'pl-3'}`}>
                          <span className={`w-12 shrink-0 text-xs font-semibold uppercase tracking-wide ${isCaller ? 'text-primary' : 'text-muted-foreground'}`}>{isCaller ? 'Caller' : 'Agent'}</span>
                          <span className="min-w-0">{text}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">No transcript was stored for this call.</p>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  Outcome: <b className="text-foreground">{c.outcome}</b>
                  {c.escalated ? ' · Escalated to a human' : ''}
                  {c.started_at ? <> · <span className="font-mono text-[13px]">{new Date(c.started_at).toLocaleString('en-IN')}</span></> : ''}
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      ))}
    </div>
  )
}
