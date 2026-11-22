import { Moon, RefreshCw, Sun } from 'lucide-react'
import { PageHeading, SectionHeading } from '../components/Desk'
import { ConnectionStatus, useDesk } from '../components/Layout'
import { useTheme } from '../components/ThemeProvider'
import { Button } from '../components/ui/button'
import { tzAbbreviation } from '../lib/utils'

const appearances = [{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }] as const

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const { health, checking, connectionError, checkConnection } = useDesk()
  const zone = health?.timezone
  return (
    <>
      <PageHeading title="Settings" description="Set your display preference and check the clinic connection." />

      <div className="settings-rows">
        <section className="settings-row">
          <SectionHeading title="Appearance" note="Saved in this browser." />
          <fieldset className="appearance-options">
            <legend className="sr-only">Color theme</legend>
            {appearances.map(({ value, label, icon: Icon }) => (
              <label key={value}>
                <input type="radio" name="appearance" value={value} checked={theme === value} onChange={() => setTheme(value)} />
                <Icon size={18} aria-hidden="true" />{label}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="settings-row">
          <SectionHeading title="Clinic" note="Appointments use the clinic’s time." />
          <dl className="settings-detail">
            <div><dt>Clinic</dt><dd>Sunrise Dental Clinic</dd></div>
            <div><dt>Time zone</dt><dd>{zone ? <>{zone} <span className="data-text muted">({tzAbbreviation(zone)})</span></> : 'Unavailable'}</dd></div>
          </dl>
        </section>

        <section className="settings-row">
          <SectionHeading title="Connection" note="Status reported by the receptionist API." />
          <div>
            <dl className="settings-detail">
              <div><dt>API status</dt><dd><span role="status"><ConnectionStatus health={connectionError ? null : health} checking={checking} /></span></dd></div>
              <div><dt>API version</dt><dd className="data-text">{health?.version || 'Unavailable'}</dd></div>
              <div><dt>Mode</dt><dd>{health ? (health.demo_mode ? 'Demo' : 'Production') : 'Unavailable'}</dd></div>
            </dl>
            <Button variant="outline" onClick={checkConnection} disabled={checking}><RefreshCw size={16} aria-hidden="true" />{checking ? 'Checking…' : 'Check connection'}</Button>
            {connectionError && <p role="alert" className="field-error">{connectionError}</p>}
          </div>
        </section>
      </div>
    </>
  )
}
