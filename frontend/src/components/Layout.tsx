import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { CalendarDays, Headphones, LayoutDashboard, Moon, Phone, Settings, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { api, type Health } from '../lib/api'
import { formatDate, tzAbbreviation } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/live', label: 'Live call', icon: Headphones },
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
  const [hasNavigated, setHasNavigated] = useState(false)

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

  useLayoutEffect(() => {
    if (pathname === previousPath.current) return
    previousPath.current = pathname
    setHasNavigated(true)
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
      <aside className="desk-rail">
        <div className="desk-brand">
          <Link to="/">
            <img className="brand-mark" width="36" height="36" src={`${import.meta.env.BASE_URL}reception.svg`} alt="" />
            <span><strong>Reception</strong><small>Sunrise Dental Clinic</small></span>
          </Link>
          <Button className="mobile-theme" variant="outline" size="sm" onClick={() => setTheme(themeTarget)} aria-label={`Switch to ${themeTarget} theme`}>
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </Button>
        </div>
        <nav aria-label="Primary" className="desk-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end>
              <Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="desk-rail-foot" role="status">
          <ConnectionStatus health={connectionError ? null : health} checking={checking} />
          {health?.demo_mode && <p>Demo mode</p>}
        </div>
      </aside>

      <div className="desk-body">
        <header className="desk-top">
          <div className="desk-date"><CalendarDays size={16} aria-hidden="true" /><span>{date}</span>{zone && <span className="desk-zone data-text" title={zone}>{tzAbbreviation(zone)}</span>}</div>
          {health?.demo_mode && <span className="mobile-demo muted">Demo</span>}
          <Button className="desktop-theme" variant="outline" size="sm" onClick={() => setTheme(themeTarget)} aria-label={`Switch to ${themeTarget} theme`}>
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            <span>{themeTarget === 'dark' ? 'Dark' : 'Light'}</span>
          </Button>
        </header>
        <main className="desk-main" id="main-content" ref={main} tabIndex={-1}>
          <div key={pathname} className={hasNavigated ? 'desk-view view-arriving' : 'desk-view'}><Outlet context={desk} /></div>
        </main>
      </div>
    </div>
  )
}
