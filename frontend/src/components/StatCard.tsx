import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from './ui/card'

export default function StatCard({ label, value, sub, icon: Icon, delay = 0, tone = 'bg-primary/10 text-primary' }: { label: string; value: string | number; sub?: string; icon: LucideIcon; delay?: number; tone?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-start justify-between p-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
            {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
