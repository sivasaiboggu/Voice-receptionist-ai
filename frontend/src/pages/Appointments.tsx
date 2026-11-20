import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CalendarCheck2, CalendarX2, RefreshCw } from 'lucide-react'
import { api, Appt } from '../lib/api'
import { useToast } from '../lib/useToast'
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

  const load = () => {
    setLoading(true); setError('')
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
      <div><h1 className="text-2xl font-bold tracking-tight">Appointments</h1><p className="text-sm text-muted-foreground">Booked by the voice agent — double-booking is prevented by the backend.</p></div>
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
      <div><h1 className="text-2xl font-bold tracking-tight">Appointments</h1><p className="text-sm text-muted-foreground">Booked by the voice agent — double-booking is prevented by the backend. Cancelled slots become available again. Demo data — bookings made by simulated demo calls.</p></div>
      {appts.length === 0 && (
        <EmptyState icon={CalendarCheck2} title="No appointments yet" desc="Appointments booked by the agent show up here with the service, time and caller." action={<Button size="sm" onClick={() => navigate('/live')}>Run a demo call</Button>} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {appts.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardHeader className="flex-row flex-wrap items-center gap-3 space-y-0">
                <CalendarCheck2 className="h-5 w-5 shrink-0 text-primary" />
                <CardTitle className="min-w-0 flex-1 text-base">{a.patient_name}</CardTitle>
                <Badge tone={a.status === 'booked' ? 'success' : a.status === 'cancelled' ? 'danger' : 'default'}>{a.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{a.service} · {a.slot}{a.phone ? ` · ${a.phone}` : ''}</p>
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
    </div>
  )
}
