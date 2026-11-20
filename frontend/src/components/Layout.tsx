import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, LayoutDashboard, Moon, PhoneCall, Phone, Sun, Stethoscope } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/live', label: 'Live call', icon: Phone },
]

export default function Layout() {
  const { theme, toggle } = useTheme()
  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/50 px-4 py-6 md:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Stethoscope className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-bold leading-tight">Voice Receptionist</div>
              <div className="text-xs text-muted-foreground">Sunrise Dental Clinic</div>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 rounded-lg border bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
            Agent online — answering calls
          </div>
          <nav className="mt-6 space-y-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                <n.icon className="h-4 w-4" />{n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto rounded-xl border bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
            <b className="text-foreground">Demo mode</b><br />No phone or API keys needed — run a simulated call from Live call.
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-8">
            <div className="flex items-center gap-2 md:hidden"><Stethoscope className="h-5 w-5 text-primary" /><span className="font-bold">Voice Receptionist</span></div>
            <div className="hidden text-sm text-muted-foreground md:block">Today · <span className="font-medium text-foreground">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{theme === 'dark' ? 'Light' : 'Dark'}</Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:px-8 md:pb-8">{/* pb-24 clears the mobile bottom nav */}<Outlet /></main>
        </div>
      </div>
      <nav aria-label="Primary" className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t bg-background/95 py-2 backdrop-blur md:hidden">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex flex-col items-center gap-1 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
            <n.icon className="h-5 w-5" />{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
