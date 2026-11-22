import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { CalendarDays, LayoutDashboard, Moon, Phone, PhoneCall, Settings, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { api, type Health } from '../lib/api'
import { formatDate, tzAbbreviation } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/live', label: 'Live call', icon: Phone },
  { to: '/settings', label: 'Settings', icon: Settings },
]

type DeskContext = {
  health: Health | null
  checking: boolean
  connectionError: string
  checkConnection: () => void
  now: Date
}
export function useDesk() {
  return useOutletContext<DeskContext>()
}

export function ConnectionStatus({ health, checking }: Pick<DeskContext, 'health' | 'checking'>) {
  const online = health?.ok && health.database === 'ok'
  return <Badge tone={checking ? 'default' : online ? 'success' : 'danger'} dot>{checking ? 'Checking connection' : online ? 'API connected' : 'API unavailable'}</Badge>
}

export default function Layout() {
  const { theme, setTheme } = useTheme()
  const [health, setHealth] = useState<Health | null>(null)
  const [checking, setChecking] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const request = useRef(0)
  const main = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)

  const checkConnection = useCallback(() => {
    const id = ++request.current
    setChecking(true)
    setConnectionError('')
    api.health()
      .then((value) => {
        if (request.current !== id) return
        setHealth(value)
        if (!value.ok || value.database !== 'ok') setConnectionError('The API returned an unhealthy database status.')
      })
      .catch((error: Error) => {
        if (request.current !== id) return
        setConnectionError(error.message)
      })
      .finally(() => {
        if (request.current === id) setChecking(false)
      })
  }, [])

  useEffect(() => {
    checkConnection()
    return () => { request.current += 1 }
  }, [checkConnection])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (pathname === previousPath.current) return
    previousPath.current = pathname
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [pathname])

  const zone = health?.timezone
  const date = formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' }, zone)
  const themeTarget = theme === 'dark' ? 'light' : 'dark'
  const desk: DeskContext = { health, checking, connectionError, checkConnection, now }

  return (
    <div className="desk-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="desk-header">
        <div className="desk-brand">
          <Link to="/">
            <svg className="brand-mark" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
              <rect x=".5" y=".5" width="35" height="35" rx="4" fill="none" stroke="currentColor" />
              <path d="M10 14h16M10 18h16M10 22h16" fill="none" stroke="currentColor" />
              <path d="M15 9v18" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span><strong>Voice Receptionist</strong><small>Sunrise Dental Clinic</small></span>
          </Link>
        </div>
        <div className="desk-top">
          <div className="desk-date"><span>{date}</span>{zone && <span className="desk-zone data-text" title={zone}>{tzAbbreviation(zone)}</span>}</div>
          {health?.demo_mode && <span className="mobile-demo muted">Demo</span>}
          <Button variant="outline" size="sm" onClick={() => setTheme(themeTarget)} aria-label={`Switch to ${themeTarget} theme`}>
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            <span>{themeTarget === 'dark' ? 'Dark' : 'Light'}</span>
          </Button>
        </div>
      </header>

      <aside className="desk-rail">
        <nav aria-label="Primary" className="desk-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end>
              <Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="desk-rail-foot">
          <div role="status"><ConnectionStatus health={connectionError ? null : health} checking={checking} /></div>
          {health?.demo_mode && <p>Demo mode</p>}
        </div>
      </aside>

      <main className="desk-main" id="main-content" ref={main} tabIndex={-1}>
        <Outlet context={desk} />
      </main>
    </div>
  )
}
