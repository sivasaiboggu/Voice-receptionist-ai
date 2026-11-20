import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, PhoneCall, RefreshCw } from 'lucide-react'
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
      <div><h1 className="text-2xl font-bold tracking-tight">Calls</h1><p className="text-sm text-muted-foreground">Every call, with transcript, summary, sentiment and urgency. Select a call to read the full transcript.</p></div>
      {calls.length === 0 && (
        <EmptyState icon={PhoneCall} title="No calls yet" desc="Calls appear here as soon as the agent handles one. Try a demo call — it books an appointment and logs the whole conversation." action={<Button size="sm" onClick={() => navigate('/live')}>Run a demo call</Button>} />
      )}
      {calls.map((c, i) => (
        <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{c.caller} <span className="font-normal text-muted-foreground">— {c.summary}</span></CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge tone={c.urgency === 'high' ? 'danger' : c.urgency === 'medium' ? 'warning' : 'default'}>{c.urgency}</Badge>
                <Badge tone={c.sentiment === 'negative' ? 'danger' : c.sentiment === 'positive' ? 'success' : 'default'}>{c.sentiment}</Badge>
                {c.escalated ? <Badge tone="danger">Escalated</Badge> : null}
              </div>
            </CardHeader>
            {open === c.id && (
              <CardContent>
                {c.transcript ? (
                  <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">{c.transcript}</pre>
                ) : (
                  <p className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">No transcript was stored for this call.</p>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  Outcome: <b className="text-foreground">{c.outcome}</b>
                  {c.escalated ? ' · Escalated to a human' : ''}
                  {c.started_at ? ` · ${new Date(c.started_at).toLocaleString('en-IN')}` : ''}
                </p>
              </CardContent>
            )}
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
