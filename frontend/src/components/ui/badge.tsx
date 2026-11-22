import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Badge({ tone = 'default', dot = false, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'success' | 'warning' | 'danger'
  dot?: boolean
}) {
  return (
    <span className={cn('status-tag', `tag-${tone}`, className)} {...props}>
      {dot && <span className="status-dot" aria-hidden="true" />}{children}
    </span>
  )
}
