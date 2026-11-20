import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarCheck2 } from 'lucide-react'
import { api, Appt } from '../lib/api'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'

export default function Appointments() {
  const [appts, setAppts] = useState<Appt[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.appointments().then(setAppts).catch(() => {}).finally(() => setLoading(false)) }, [])
  if (loading) return <Skeleton className="h-64" />
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Appointments</h1><p className="text-sm text-muted-foreground">Booked by the voice agent — double-booking is prevented by the backend.</p></div>
      {appts.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No appointments yet — run a demo call from Live call.</CardContent></Card>}
      <div className="grid gap-4 sm:grid-cols-2">
        {appts.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card><CardHeader className="flex-row items-center gap-3 space-y-0"><CalendarCheck2 className="h-5 w-5 text-primary" /><CardTitle className="text-base">{a.patient_name}</CardTitle><Badge tone={a.status === 'booked' ? 'success' : 'default'}>{a.status}</Badge></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{a.service} · {a.slot}{a.phone ? ` · ${a.phone}` : ''}</CardContent></Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
