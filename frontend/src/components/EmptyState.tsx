import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from './ui/card'

/** Consistent empty state: icon, what is missing, what to do next. */
export default function EmptyState({ icon: Icon, title, desc, action }: { icon: LucideIcon; title: string; desc: string; action?: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 text-muted-foreground shadow-sm ring-1 ring-inset ring-border"><Icon className="h-6 w-6" /></div>
        <h3 className="mt-4 text-base font-semibold">{title}</h3>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{desc}</p>
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  )
}
