import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'default'
}>(({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn('desk-button', `button-${variant}`, size === 'sm' && 'button-small', className)} {...props} />
))
Button.displayName = 'Button'
