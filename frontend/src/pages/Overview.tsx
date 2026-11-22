import { useEffect, useState } from 'react'
import { ArrowRight, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type Appt, type Call, type Stats } from '../lib/api'
import { callDate, clockTime, dateKey, formatDate, recordLabel, tzAbbreviation } from '../lib/utils'
import { ActionLink, EmptyState, LoadError, LoadingRows, PageHeading, SectionHeading } from '../components/Desk'
import { useDesk } from '../components/Layout'
import { Badge } from '../components/ui/badge'

type OverviewData = { calls: Call[]; stats: Stats; appointments: Appt[] }

function countBy(calls: Call[], field: 'outcome' | 'sentiment') {
  const counts = new Map<string, number>()
  for (const call of calls) {
    const label = call[field] || (field === 'sentiment' ? 'neutral' : 'unknown')
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].sort(([a, first], [b, second]) => second - first || a.localeCompare(b))
}

function Distribution({ calls, field }: { calls: Call[]; field: 'outcome' | 'sentiment' }) {
  const counts = countBy(calls, field)
  if (!counts.length) return <p className="muted chart-empty">No calls to count yet.</p>
  return (
    <ul className="distribution">
      {counts.map(([label, count]) => {
        const color = label === 'negative' || label.startsWith('escalated') ? 'danger' : label === 'positive' ? 'success' : 'chart'
        return (
          <li key={label}>
            <div><span>{recordLabel(label)}</span><span className="data-text">{count}</span></div>
            <div className="chart-track" aria-hidden="true"><span style={{ width: `${(count / calls.length) * 100}%`, backgroundColor: `var(--${color})` }} /></div>
          </li>
        )
      })}
    </ul>
  )
}

export default function Overview() {
  const { health, now } = useDesk()
  const zone = health?.timezone
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    Promise.all([api.calls(), api.analytics(), api.appointments()])
      .then(([calls, stats, appointments]) => { if (current) setData({ calls, stats, appointments }) })
      .catch((failure: Error) => { if (current) setError(failure.message) })
    return () => { current = false }
  }, [attempt])

  const heading = (
    <PageHeading title="Front desk" description="Today’s schedule and the calls that came in.">
      <Link className="desk-button button-default" to="/live"><Phone size={16} aria-hidden="true" />Live call</Link>
    </PageHeading>
  )

  if (error) return <>{heading}<LoadError title="Could not load the front desk" message={error} retry={() => { setError(''); setAttempt(attempt + 1) }} /></>
  if (!data) return <>{heading}<LoadingRows label="Loading the front desk…" /></>

  const { calls, stats, appointments } = data
  const today = dateKey(now, zone)
  const todayAppointments = appointments
    .filter((booking) => booking.status === 'booked' && booking.slot.slice(0, 10) === today)
    .sort((a, b) => a.slot.localeCompare(b.slot))
  const time = clockTime(now, zone)
  const next = todayAppointments.find((booking) => booking.slot.slice(11, 16) >= time)
  const chartNote = calls.length ? `Latest ${calls.length} call${calls.length === 1 ? '' : 's'}` : undefined
  const figures = [
    { label: 'Appointments', value: stats.appointments_booked, note: 'Booked by the agent' },
    { label: 'Escalations', value: stats.escalations, note: 'Handed to a person' },
    { label: 'Messages waiting', value: stats.unhandled_messages, note: 'Need a callback' },
  ]

  return (
    <>
      {heading}
      <dl className="overview-figures" aria-label="Receptionist totals">
        <div className="lead-figure">
          <dt>Calls answered</dt><dd className="figure-value">{stats.calls_answered}</dd><dd className="muted">{stats.calls_today} today</dd>
        </div>
        {figures.map(({ label, value, note }) => (
          <div key={label} className="support-figure"><dt>{label}</dt><dd className="figure-value">{value}</dd><dd className="muted">{note}</dd></div>
        ))}
      </dl>

      <div className="overview-grid">
        <section className="ruled-section">
          <SectionHeading title="Today’s appointments" note={`${todayAppointments.length} booked${zone ? ` · ${tzAbbreviation(zone)}` : ''}`}>
            <ActionLink to="/appointments">All appointments</ActionLink>
          </SectionHeading>
          {todayAppointments.length ? (
            <ul className="register">
              {todayAppointments.map((booking) => (
                <li key={booking.id} className={`register-row appointment-line${booking.id === next?.id ? ' current-row' : ''}`}>
                  <div className="register-mark"><time className="data-text" dateTime={booking.slot.replace(' ', 'T')}>{booking.slot.slice(11, 16)}</time>{booking.id === next?.id && <span>Next</span>}</div>
                  <div><strong>{booking.patient_name}</strong><div className="muted">{booking.service}</div></div>
                  {booking.phone && <span className="appointment-phone muted">{booking.phone}</span>}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing booked today" description="New bookings for today will appear here." />}
        </section>

        <section className="ruled-section outcome-section">
          <SectionHeading title="Call outcomes" note={chartNote} />
          <Distribution calls={calls} field="outcome" />
        </section>

        <section className="ruled-section">
          <SectionHeading title="Recent calls">
            <ActionLink to="/calls">All calls</ActionLink>
          </SectionHeading>
          {calls.length ? (
            <ul className="register">
              {calls.slice(0, 5).map((call) => {
                const started = callDate(call.started_at)
                return (
                  <li key={call.id}>
                    <Link className="register-row recent-line" to={`/calls?call=${call.id}`}>
                      <span className="register-mark data-text muted">{started && <time dateTime={started.toISOString()}>{clockTime(started, zone)}<small>{formatDate(started, { day: 'numeric', month: 'short' }, zone)}</small></time>}</span>
                      <span className="recent-summary"><strong>{call.caller}</strong><span className="muted">{call.summary}</span></span>
                      <span className="recent-status">
                        {call.urgency && <Badge tone={call.urgency === 'high' ? 'danger' : call.urgency === 'medium' ? 'warning' : 'default'}>{recordLabel(call.urgency)} urgency</Badge>}
                        <span className={!call.escalated ? 'muted' : 'text-danger'}>{call.escalated ? 'Escalated' : recordLabel(call.outcome)}</span>
                      </span>
                      <ArrowRight size={16} className="row-arrow" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : <EmptyState title="No calls logged yet" description="Run a scenario to see a call and its transcript here."><ActionLink to="/live">Run a demo call</ActionLink></EmptyState>}
        </section>

        <section className="ruled-section sentiment-section">
          <SectionHeading title="Caller sentiment" note={chartNote} />
          <Distribution calls={calls} field="sentiment" />
        </section>
      </div>
    </>
  )
}
