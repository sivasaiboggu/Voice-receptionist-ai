import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type Toast = { id: number; title: string; desc?: string; kind: 'success' | 'error' | 'info' }

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="desk-toasts">
      {toasts.map(({ id, title, desc, kind }) => {
        const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? XCircle : Info
        return (
          <div key={id} className="desk-toast turn-enter">
            <Icon size={20} className={`toast-${kind}`} aria-hidden="true" />
            <div role={kind === 'error' ? 'alert' : 'status'}><strong>{title}</strong>{desc && <p className="muted">{desc}</p>}</div>
            <button type="button" onClick={() => onDismiss(id)} aria-label="Dismiss notification"><X size={16} aria-hidden="true" /></button>
          </div>
        )
      })}
    </div>
  )
}
