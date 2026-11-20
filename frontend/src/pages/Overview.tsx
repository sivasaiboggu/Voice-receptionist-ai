import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CalendarCheck2, PhoneCall, PhoneIncoming } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, Call, Stats } from '../lib/api'
import StatCard from '../components/StatCard'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1']

export default function Overview() {
  const [calls, setCalls] = useState<Call[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.calls(), api.analytics()])
      .then(([c, s]) => { setCalls(c); setStats(s) })
      .catch(() => setError('Could not reach the API at localhost:8001 — start it with: uvicorn backend.app.api:app --port 8001'))
      .finally(() => setLoading(false))
  }, [])

  const outcomeData = useMemo(() => {
    const m = new Map<string, number>()
    calls.forEach((c) => m.set(c.outcome, (m.get(c.outcome) ?? 0) + 1))
    return [...m.entries()].map(([name, value]) => ({ name, value }))
  }, [calls])

  const sentimentData = useMemo(() => {
    const m = new Map<string, number>()
    calls.forEach((c) => m.set(c.sentiment || 'neutral', (m.get(c.sentiment || 'neutral') ?? 0) + 1))
    return [...m.entries()].map(([name, value]) => ({ name, value }))
  }, [calls])

  const trend = useMemo(() => {
    // Calls per index as a simple activity trend (no fake dates — real logged calls only)
    return calls.slice(0, 12).map((c, i) => ({ call: `#${c.id}`, n: 1, escalated: c.escalated ? 1 : 0, i }))
  }, [calls])

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map(i => <Skeleton key={i} className="h-28" />)}<Skeleton className="h-72 sm:col-span-2 lg:col-span-4" /></div>
  if (error) return <Card><CardContent className="p-6 text-sm text-red-600">{error}</CardContent></Card>

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold tracking-tight">Good morning, Sunrise Dental</h1>
        <p className="text-sm text-muted-foreground">Your receptionist answered {stats?.calls_answered ?? 0} calls and booked {stats?.appointments_booked ?? 0} appointments.</p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Calls answered" value={stats?.calls_answered ?? 0} sub={`${Math.round((stats?.answer_rate ?? 0) * 100)}% answer rate`} icon={PhoneCall} delay={0} />
        <StatCard label="Appointments" value={stats?.appointments_booked ?? 0} sub="Booked by the agent" icon={CalendarCheck2} delay={0.05} tone="bg-emerald-500/10 text-emerald-600" />
        <StatCard label="Escalations" value={stats?.escalations ?? 0} sub="Handed to a human" icon={AlertTriangle} delay={0.1} tone="bg-amber-500/10 text-amber-600" />
        <StatCard label="Messages waiting" value={stats?.unhandled_messages ?? 0} sub="Need a callback" icon={PhoneIncoming} delay={0.15} tone="bg-violet-500/10 text-violet-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Call outcomes</CardTitle><CardDescription>What happened on each logged call</CardDescription></CardHeader>
            <CardContent className="h-72">
              {outcomeData.length === 0 ? <p className="text-sm text-muted-foreground">No calls yet — run a demo call from Live call.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outcomeData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#2563eb" /></BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader><CardTitle>Caller sentiment</CardTitle><CardDescription>How callers felt</CardDescription></CardHeader>
            <CardContent className="h-72">
              {sentimentData.length === 0 ? <p className="text-sm text-muted-foreground">No calls yet.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{sentimentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent calls</CardTitle><CardDescription>Latest transcripts, summaries and flags</CardDescription></CardHeader>
        <CardContent>
          {calls.length === 0 ? <p className="text-sm text-muted-foreground">No calls yet.</p> : (
            <div className="divide-y">
              {calls.slice(0, 5).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                  <span className="font-medium">{c.caller}</span>
                  <span className="flex-1 text-muted-foreground">{c.summary}</span>
                  <Badge tone={c.urgency === 'high' ? 'danger' : c.urgency === 'medium' ? 'warning' : 'default'}>{c.urgency}</Badge>
                  <Badge tone={c.escalated ? 'danger' : 'success'}>{c.escalated ? 'Escalated' : c.outcome}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="hidden">{trend.length}</div>
    </div>
  )
}
