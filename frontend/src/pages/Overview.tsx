import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarCheck2, PhoneCall, PhoneIncoming, PhoneOff, RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, Appt, Call, Stats } from '../lib/api'
import { tzAbbreviation } from '../lib/utils'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'

const AXIS_TICK = { fill: 'oklch(var(--muted-foreground))', fontSize: 12 } as const

// Sentiment has exactly three values, so the chart maps by name, not
// by position: positive emerald, negative red, neutral slate. The old
// four-colour list (green/amber/red/indigo) coloured "neutral" indigo
// or amber depending on call order — a second accent hue with no
// meaning. These fills are chart graphics, never small text.
const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#10b981',
  negative: '#ef4444',
  neutral: '#64748b',
}

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
  const [appts, setAppts] = useState<Appt[]>([])
  const [clinicTz, setClinicTz] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true); setError('')
    Promise.all([api.calls(), api.analytics(), api.appointments(), api.health()])
      .then(([c, s, a, h]) => { setCalls(c); setStats(s); setAppts(a); setClinicTz(h.timezone || '') })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  // Today in the CLINIC timezone — the appointments below are the
  // clinic's today, not the viewer's.
  const clinicTodayKey = useMemo(() => {
    if (!clinicTz) return null
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: clinicTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    } catch { return null }
  }, [clinicTz])

  const todaysAppts = useMemo(() => {
    if (!clinicTodayKey) return []
    return appts
      .filter((a) => a.status === 'booked' && a.slot.slice(0, 10) === clinicTodayKey)
      .sort((a, b) => a.slot.localeCompare(b.slot))
  }, [appts, clinicTodayKey])

  // "Now" in clinic time, HH:MM — the next appointment today is the
  // first one at or after now. It carries the day-book's one accent
  // rule (a 2px primary bar + primary time); every other row is plain.
  const clinicNowHHMM = useMemo(() => {
    if (!clinicTz) return null
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: clinicTz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
    } catch { return null }
  }, [clinicTz])
  const nextApptSlot = useMemo(() => {
    if (!clinicNowHHMM) return null
    return todaysAppts.find((a) => a.slot.slice(11) >= clinicNowHHMM)?.slot ?? null
  }, [todaysAppts, clinicNowHHMM])

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting()}, <span className="text-primary">Sunrise Dental</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">Your receptionist answered {stats?.calls_answered ?? 0} calls and booked {stats?.appointments_booked ?? 0} appointments.</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge tone="warning">Demo data</Badge>These counts come from simulated demo calls stored by the backend — no real patient data.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Calls answered" value={stats?.calls_answered ?? 0} sub={`${stats?.calls_today ?? 0} logged today`} icon={PhoneCall} />
        <StatCard label="Appointments" value={stats?.appointments_booked ?? 0} sub="Booked by the agent" icon={CalendarCheck2} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Escalations" value={stats?.escalations ?? 0} sub="Handed to a human" icon={AlertTriangle} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
        <StatCard label="Messages waiting" value={stats?.unhandled_messages ?? 0} sub="Need a callback" icon={PhoneIncoming} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
      </div>

      {/* Today's schedule — the first thing a receptionist needs. */}
      <Card>
        <CardHeader>
          {/* Row layout lives on an inner div: CardHeader's own base is
              `flex flex-col`, and Tailwind orders flex-col after flex-row
              in the stylesheet, so `flex-row` on the CardHeader itself
              silently loses and the header renders stacked and centred. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Today&apos;s appointments</CardTitle>
              <CardDescription>{todaysAppts.length === 0 ? 'Nothing booked for today yet' : `${todaysAppts.length} booked today${clinicTz ? ` · all times ${tzAbbreviation(clinicTz)}` : ''}`}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/appointments')}>All appointments</Button>
          </div>
        </CardHeader>
        <CardContent>
          {todaysAppts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments on the book for today. Run a demo call from Live call and one will appear here.</p>
          ) : (
            <div className="divide-y">
              {/* The day book: one ruled row pattern — mono time gutter,
                  hairline separators. The next appointment today carries
                  the 2px primary rule and a Next label; nothing else on
                  the row is coloured. */}
              {todaysAppts.map((a) => {
                const isNext = a.slot === nextApptSlot
                return (
                  <div key={a.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 pl-3 text-sm first:pt-0 last:pb-0">
                    {isNext && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" />}
                    <span className={`w-14 shrink-0 font-mono text-[13px] ${isNext ? 'font-semibold text-primary' : 'font-medium'}`}>{a.slot.slice(11)}</span>
                    {isNext && <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Next</span>}
                    <span className="font-medium">{a.patient_name}</span>
                    <span className="text-muted-foreground">{a.service}</span>
                    {a.phone && <span className="ml-auto font-mono text-xs text-muted-foreground">{a.phone}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Call outcomes</CardTitle><CardDescription>What happened on each logged call</CardDescription></CardHeader>
            <CardContent className="h-72">
              {outcomeData.length === 0 ? (
                <EmptyState icon={PhoneCall} title="No calls yet" desc="Run a demo call from Live call and the outcome chart will appear here." action={<Button size="sm" onClick={() => navigate('/live')}>Run a demo call</Button>} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {/* Solid bar fill, drawn at once: the old vertical
                      gradient is decoration, and Recharts entrance
                      animations can stick mid-flight in headless
                      renders and leave the chart blank. */}
                  <BarChart data={outcomeData} margin={{ bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(var(--border))" /><XAxis dataKey="name" tick={AXIS_TICK} interval={0} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} /><YAxis allowDecimals={false} tick={AXIS_TICK} /><Tooltip content={<ChartTooltip />} cursor={{ fill: 'oklch(var(--muted))', opacity: 0.4 }} /><Bar dataKey="value" radius={[8, 8, 0, 0]} fill="oklch(var(--primary))" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader><CardTitle>Caller sentiment</CardTitle><CardDescription>How callers felt</CardDescription></CardHeader>
            <CardContent className="h-72">
              {sentimentData.length === 0 ? (
                <EmptyState icon={PhoneOff} title="No calls yet" desc="Sentiment is measured from each caller's words once calls are logged." />
              ) : (
                <div className="relative h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} isAnimationActive={false}>{sentimentData.map((d) => <Cell key={d.name} fill={SENTIMENT_COLORS[d.name] ?? SENTIMENT_COLORS.neutral} />)}</Pie><Tooltip content={<ChartTooltip />} /><Legend verticalAlign="bottom" height={24} formatter={(v: string) => <span style={{ color: 'oklch(var(--foreground))' }}>{v}</span>} /></PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8" aria-hidden>
                    <span className="text-2xl font-bold tracking-tight tabular-nums">{sentimentData.reduce((n, d) => n + d.value, 0)}</span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">calls</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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
                  <span className="font-mono text-[13px] font-medium">{c.caller}</span>
                  <span className="min-w-0 w-full text-muted-foreground sm:w-auto sm:flex-1">{c.summary}</span>
                  {c.started_at && <span className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(c.started_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
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
