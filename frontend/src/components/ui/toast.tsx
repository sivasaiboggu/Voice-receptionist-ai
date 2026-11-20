import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle } from 'lucide-react'

export type Toast = { id: number; title: string; desc?: string; kind: 'success' | 'error' }
export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" /> : <XCircle className="mt-0.5 h-5 w-5 text-red-500" />}
            <div><div className="text-sm font-semibold">{t.title}</div>{t.desc && <div className="text-xs text-muted-foreground">{t.desc}</div>}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
