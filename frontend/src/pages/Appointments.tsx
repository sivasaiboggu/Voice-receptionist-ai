import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CalendarCheck2, CalendarDays, CalendarX2, List, RefreshCw } from 'lucide-react'
import { api, Appt } from '../lib/api'
import { useToast } from '../lib/useToast'
import { tzAbbreviation } from '../lib/utils'
import EmptyState from '../components/EmptyState'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { Toasts } from '../components/ui/toast'

export default function Appointments() {
  const navigate = useNavigate()
  const { toasts, push, dismiss } = useToast()
  const [appts, setAppts] = useState<Appt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // List vs calendar view; calendar groups bookings by clinic-local day.
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  // List-view status filter — cancelled appointments used to sit mixed
  // in with booked ones and there was no way to separate them.
  const [statusFilter, setStatusFilter] = useState<'all' | 'booked' | 'cancelled'>('all')
  const visibleAppts = statusFilter === 'all' ? appts : appts.filter((a) => a.status === statusFilter)
  // Clinic timezone from /health — every slot time on this page is in it.
  const [clinicTz, setClinicTz] = useState('')

  // Today in the CLINIC timezone, not the browser's: a viewer abroad
  // would otherwise see "today" on the wrong clinic day, and the
  // calendar groups bookings by clinic-local date. Falls back to the
  // browser date until /health answers with the clinic zone.
  const clinicTodayKey = useMemo(() => {
    if (!clinicTz) return null
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: clinicTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    } catch { return null }
  }, [clinicTz])

  // Next 14 days as YYYY-MM-DD keys, starting on clinic today.
  const days = useMemo(() => {
    const out: { key: string; label: string; weekday: string; isToday: boolean }[] = []
    const base = clinicTodayKey ? new Date(`${clinicTodayKey}T12:00:00`) : new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({
        key,
        label: String(d.getDate()),
        weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        isToday: i === 0,
      })
    }
    return out
  }, [clinicTodayKey])

  const monthLabel = useMemo(() => {
    if (days.length === 0) return ''
    const first = new Date(`${days[0].key}T12:00:00`)
    const last = new Date(`${days[days.length - 1].key}T12:00:00`)
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    const f = fmt(first)
    return f === fmt(last) ? f : `${first.toLocaleDateString('en-IN', { month: 'short' })} – ${fmt(last)}`
  }, [days])

  const byDay = (key: string) => appts.filter((a) => a.slot.slice(0, 10) === key)
  const selectedAppts = selectedDay ? byDay(selectedDay) : []
  const tzNote = clinicTz ? ` All times are clinic time (${tzAbbreviation(clinicTz)}, ${clinicTz}).` : ''

  // Human day label for a clinic-local slot date: "Today", "Tomorrow",
  // a weekday, or a short date — a bare "2026-11-24" makes the reader
  // do calendar maths. Judged against clinic today, not the browser's.
  const dayLabel = (slot: string) => {
    const key = slot.slice(0, 10)
    if (!clinicTodayKey) return key
    const today = new Date(`${clinicTodayKey}T12:00:00`)
    const d = new Date(`${key}T12:00:00`)
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff === -1) return 'Yesterday'
    if (diff > 1 && diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' })
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const load = () => {
    setLoading(true); setError('')
    api.health().then((h) => setClinicTz(h.timezone || '')).catch(() => {})
    api.appointments().then(setAppts).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const cancel = async (a: Appt) => {
    setBusy(true)
    try {
      const r = await api.cancelAppointment(a.slot, a.patient_name)
      if (r.ok) {
        push({ title: 'Appointment cancelled', desc: r.message, kind: 'success' })
        setAppts((xs) => xs.map((x) => (x.id === a.id ? { ...x, status: 'cancelled' } : x)))
      } else {
        push({ title: 'Could not cancel', desc: r.message, kind: 'error' })
      }
    } catch (e) {
      push({ title: 'Could not cancel', desc: e instanceof Error ? e.message : 'Unknown error', kind: 'error' })
    } finally {
      setBusy(false); setConfirming(null)
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div><Skeleton className="h-8 w-48" /><Skeleton className="mt-2 h-4 w-96" /></div>
      <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
    </div>
  )
  if (error) return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Appointments</h1><p className="text-sm text-muted-foreground">Booked by the voice agent — double-booking is prevented by the backend.{tzNote}</p></div>
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400"><AlertTriangle className="h-4 w-4" />Could not load appointments</div>
          <p className="text-sm leading-relaxed text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" />Try again</Button>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="space-y-4">
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold tracking-tight">Appointments</h1><p className="text-sm text-muted-foreground">Booked by the voice agent — double-booking is prevented by the backend. Cancelled slots become available again. Demo data — bookings made by simulated demo calls.{tzNote}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'list' && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'booked' | 'cancelled')} aria-label="Filter by status" className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="all">All statuses</option>
              <option value="booked">Booked</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}
          <div className="flex gap-1 rounded-md border p-1" role="group" aria-label="Appointments view">
            <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')} aria-pressed={view === 'list'}><List className="h-4 w-4" />List</Button>
            <Button variant={view === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setView('calendar')} aria-pressed={view === 'calendar'}><CalendarDays className="h-4 w-4" />Calendar</Button>
          </div>
        </div>
      </div>
      {appts.length === 0 && (
        <EmptyState icon={CalendarCheck2} title="No appointments yet" desc="Appointments booked by the agent show up here with the service, time and caller." action={<Button size="sm" onClick={() => navigate('/live')}>Run a demo call</Button>} />
      )}
      {view === 'list' && visibleAppts.length === 0 && appts.length > 0 && (
        <EmptyState icon={CalendarCheck2} title={`No ${statusFilter} appointments`} desc="Try the other status filter — the appointments are still there." action={<Button size="sm" variant="outline" onClick={() => setStatusFilter('all')}>Show all</Button>} />
      )}
      {view === 'calendar' && appts.length > 0 && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{monthLabel} <span className="font-normal text-muted-foreground">· next 14 days, clinic time</span></h2>
            <span className="text-xs text-muted-foreground">Tap a day to see its appointments</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {days.map((d) => {
              const dayAppts = byDay(d.key)
              const booked = dayAppts.filter((a) => a.status === 'booked').length
              return (
                <button
                  key={d.key}
                  onClick={() => setSelectedDay(selectedDay === d.key ? null : d.key)}
                  aria-pressed={selectedDay === d.key}
                  className={`min-h-24 rounded-xl border p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lift ${selectedDay === d.key ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/25' : ''} ${d.isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : 'bg-card shadow-soft'}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold leading-none">{d.label}</span>
                    <span className="text-[11px] uppercase text-muted-foreground">{d.weekday}{d.isToday ? ' · Today' : ''}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {dayAppts.length === 0 && <span className="text-xs text-muted-foreground">No bookings</span>}
                    {dayAppts.slice(0, 3).map((a) => (
                      <div key={a.id} className={`flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${a.status === 'booked' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 line-through dark:text-red-400'}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.status === 'booked' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                        {a.slot.slice(11)} {a.patient_name}
                      </div>
                    ))}
                    {dayAppts.length > 3 && <span className="text-[11px] text-muted-foreground">+{dayAppts.length - 3} more</span>}
                  </div>
                  {booked > 0 && <div className="mt-1 text-[11px] text-muted-foreground">{booked} booked</div>}
                </button>
              )
            })}
          </div>
          {selectedDay && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {' '}· {selectedAppts.length} appointment{selectedAppts.length === 1 ? '' : 's'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedAppts.length === 0 && <p className="text-sm text-muted-foreground">Nothing booked on this day yet.</p>}
                {selectedAppts.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-soft transition-colors hover:bg-accent/40">
                    <div>
                      <p className="text-sm font-medium">{a.patient_name} · {a.service}</p>
                      <p className="text-xs text-muted-foreground">{dayLabel(a.slot)} {a.slot.slice(11)}{a.phone ? ` · ${a.phone}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={a.status === 'booked' ? 'success' : 'danger'}>{a.status}</Badge>
                      {a.status === 'booked' && (
                        confirming === a.id ? (
                          <>
                            <span className="text-sm font-medium">Cancel?</span>
                            <Button variant="destructive" size="sm" disabled={busy} onClick={() => cancel(a)}>Yes, cancel</Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(null)}>Keep it</Button>
                          </>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setConfirming(a.id)}><CalendarX2 className="h-4 w-4" />Cancel</Button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
      {view === 'list' && (
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleAppts.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="hover:-translate-y-0.5 hover:shadow-lift">
              <CardHeader>
                {/* See Overview: the row flex must be an inner div, not on
                    the CardHeader — its base `flex-col` beats `flex-row`. */}
                <div className="flex flex-wrap items-center gap-3">
                  <CalendarCheck2 className="h-5 w-5 shrink-0 text-primary" />
                  <CardTitle className="min-w-0 flex-1 text-base">{a.patient_name}</CardTitle>
                  <Badge tone={a.status === 'booked' ? 'success' : a.status === 'cancelled' ? 'danger' : 'default'}>{a.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{a.service} · {dayLabel(a.slot)} {a.slot.slice(11)}{a.phone ? ` · ${a.phone}` : ''}</p>
                {a.status === 'booked' && (
                  confirming === a.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Cancel this appointment?</span>
                      <Button variant="destructive" size="sm" disabled={busy} onClick={() => cancel(a)}>Yes, cancel</Button>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(null)}>Keep it</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setConfirming(a.id)}><CalendarX2 className="h-4 w-4" />Cancel appointment</Button>
                  )
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      )}
    </div>
  )
}
