import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, Call } from '../lib/api'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'

export default function Calls() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { api.calls().then(setCalls).catch(() => {}).finally(() => setLoading(false)) }, [])
  if (loading) return <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-20" />)}</div>
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Calls</h1><p className="text-sm text-muted-foreground">Every call, with transcript, summary, sentiment and urgency.</p></div>
      {calls.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No calls yet — run a demo call from Live call.</CardContent></Card>}
      {calls.map((c, i) => (
        <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{c.caller} <span className="font-normal text-muted-foreground">— {c.summary}</span></CardTitle>
              <div className="flex gap-2"><Badge tone={c.urgency === 'high' ? 'danger' : 'default'}>{c.urgency}</Badge><Badge tone={c.sentiment === 'negative' ? 'danger' : c.sentiment === 'positive' ? 'success' : 'default'}>{c.sentiment}</Badge></div>
            </CardHeader>
            {open === c.id && <CardContent><pre className="whitespace-pre-wrap text-sm text-muted-foreground">{'Transcript not stored in this view — see the demo call panel for a full transcript.'}</pre><p className="mt-2 text-sm">Outcome: <b>{c.outcome}</b>{c.escalated ? ' · Escalated to a human' : ''}</p></CardContent>}
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
