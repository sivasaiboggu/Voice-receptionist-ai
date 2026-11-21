import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn('rounded-xl border bg-card text-card-foreground shadow-soft transition-all duration-200', className)} {...p} />
))
Card.displayName = 'Card'
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...p} />
))
CardHeader.displayName = 'CardHeader'
export const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...p} />
))
CardTitle.displayName = 'CardTitle'
export const CardDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...p} />
))
CardDescription.displayName = 'CardDescription'
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...p} />
))
CardContent.displayName = 'CardContent'
