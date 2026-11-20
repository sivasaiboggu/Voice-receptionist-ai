import { useCallback, useState } from 'react'
import type { Toast } from '../components/ui/toast'

/** Shared toast state so every page shows the same notifications. */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
  }, [])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { ...t, id }])
    setTimeout(() => dismiss(id), 6000)
  }, [dismiss])
  return { toasts, push, dismiss }
}
