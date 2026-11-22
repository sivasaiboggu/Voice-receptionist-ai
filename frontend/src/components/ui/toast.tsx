import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type Toast = { id: number; title: string; desc?: string; kind: 'success' | 'error' | 'info' }
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss?: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} role="status" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-lift">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : t.kind === 'info' ? <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{t.title}</div>{t.desc && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.desc}</div>}</div>
            {onDismiss && <button onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
