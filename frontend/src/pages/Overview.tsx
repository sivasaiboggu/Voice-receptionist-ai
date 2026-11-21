import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CalendarCheck2, PhoneCall, PhoneIncoming, PhoneOff, RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, Call, Stats } from '../lib/api'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1']

// Recharts' default tooltip is a fixed white box — jarring in dark mode.
// This one uses the theme tokens, so it matches light and dark.
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== '' && <div className="mb-1 font-semibold">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="text-muted-foreground">
          {p.name === 'value' ? 'Calls' : p.name}: <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 12 } as const

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Overview() {
  const navigate = useNavigate()
  const [calls, setCalls] = useState<Call[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true); setError('')
    Promise.all([api.calls(), api.analytics()])
      .then(([c, s]) => { setCalls(c); setStats(s) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

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

  if (loading) return (
    <div className="space-y-6">
      <div><Skeleton className="h-8 w-72" /><Skeleton className="mt-2 h-4 w-96" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>
      <Skeleton className="h-48" />
    </div>
  )
  if (error) return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400"><AlertTriangle className="h-4 w-4" />Could not load the dashboard</div>
        <p className="text-sm leading-relaxed text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" />Try again</Button>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold tracking-tight">{greeting()}, Sunrise Dental</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your receptionist answered {stats?.calls_answered ?? 0} calls and booked {stats?.appointments_booked ?? 0} appointments.</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge tone="warning">Demo data</Badge>These counts come from simulated demo calls stored by the backend — no real patient data.</p>
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
              {outcomeData.length === 0 ? (
                <EmptyState icon={PhoneCall} title="No calls yet" desc="Run a demo call from Live call and the outcome chart will appear here." action={<Button size="sm" onClick={() => navigate('/live')}>Run a demo call</Button>} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outcomeData} margin={{ bottom: 8 }}>
                    <defs>
                      <linearGradient id="outcomeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="name" tick={AXIS_TICK} interval={0} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} /><YAxis allowDecimals={false} tick={AXIS_TICK} /><Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} /><Bar dataKey="value" radius={[8, 8, 0, 0]} fill="url(#outcomeFill)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader><CardTitle>Caller sentiment</CardTitle><CardDescription>How callers felt</CardDescription></CardHeader>
            <CardContent className="h-72">
              {sentimentData.length === 0 ? (
                <EmptyState icon={PhoneOff} title="No calls yet" desc="Sentiment is measured from each caller's words once calls are logged." />
              ) : (
                <div className="relative h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{sentimentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /><Legend verticalAlign="bottom" height={24} formatter={(v: string) => <span style={{ color: 'hsl(var(--foreground))' }}>{v}</span>} /></PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8" aria-hidden>
                    <span className="text-2xl font-bold tracking-tight tabular-nums">{sentimentData.reduce((n, d) => n + d.value, 0)}</span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">calls</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent calls</CardTitle><CardDescription>Latest transcripts, summaries and flags</CardDescription></CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <EmptyState icon={PhoneCall} title="No calls logged yet" desc="Every call the agent handles is logged here with its summary, sentiment and urgency." action={<Button size="sm" onClick={() => navigate('/live')}>Run a demo call</Button>} />
          ) : (
            <div className="divide-y">
              {calls.slice(0, 5).map((c) => (
                <div key={c.id} className="-mx-2 flex flex-wrap items-center gap-2 rounded-lg px-2 py-3 text-sm transition-colors hover:bg-accent/50">
                  <span className="font-medium">{c.caller}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">{c.summary}</span>
                  <Badge tone={c.urgency === 'high' ? 'danger' : c.urgency === 'medium' ? 'warning' : 'default'}>{c.urgency}</Badge>
                  <Badge tone={c.escalated ? 'danger' : 'success'}>{c.escalated ? 'Escalated' : c.outcome}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
