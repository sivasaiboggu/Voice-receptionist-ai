import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { CalendarDays, CalendarPlus, List } from 'lucide-react'
import { ActionLink, EmptyState, LoadError, LoadingRows, PageHeading, SectionHeading } from '../components/Desk'
import { useDesk } from '../components/Layout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Toasts } from '../components/ui/toast'
import { api, type Appt } from '../lib/api'
import { useToast } from '../lib/useToast'
import { dateKey, formatDate, recordLabel, tzAbbreviation } from '../lib/utils'

type StatusFilter = 'all' | 'booked' | 'cancelled'
const BookingDialog = lazy(() => import('../components/BookingDialog'))

function dateLabel(key: string, options: Intl.DateTimeFormatOptions) {
  return formatDate(new Date(`${key}T12:00:00Z`), options, 'UTC')
}

function groupByDay(appointments: Appt[]) {
  const groups = new Map<string, Appt[]>()
  for (const appointment of [...appointments].sort((a, b) => a.slot.localeCompare(b.slot))) {
    const key = appointment.slot.slice(0, 10)
    const day = groups.get(key) ?? []
    day.push(appointment)
    groups.set(key, day)
  }
  return groups
}

export default function Appointments() {
  const { health, now } = useDesk()
  const zone = health?.timezone
  const today = dateKey(now, zone)
  const { toasts, push, dismiss } = useToast()
  const [appointments, setAppointments] = useState<Appt[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const keepButton = useRef<HTMLButtonElement>(null)
  const statusFilter = useRef<HTMLSelectElement>(null)
  const calendar = useRef<HTMLDivElement>(null)
  const focusAfterConfirmation = useRef<HTMLElement | null>(null)
  const bookingButton = useRef<HTMLButtonElement>(null)
  const [booking, setBooking] = useState(false)
  const [view, setView] = useState<'list' | 'calendar'>('calendar')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusFilter>('all')

  useEffect(() => {
    let current = true
    api.appointments()
      .then((value) => { if (current) setAppointments(value) })
      .catch((failure: Error) => { if (current) setError(failure.message) })
    return () => { current = false }
  }, [attempt])

  useEffect(() => {
    if (confirming !== null) {
      keepButton.current?.focus()
    } else if (focusAfterConfirmation.current) {
      const row = focusAfterConfirmation.current
      if (row.isConnected) row.focus()
      else (statusFilter.current ?? calendar.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]'))?.focus()
      focusAfterConfirmation.current = null
    }
  }, [confirming])

  async function cancel(appointment: Appt) {
    setBusy(true)
    try {
      const response = await api.cancelAppointment(appointment.slot, appointment.patient_name)
      if (!response.ok) throw new Error(response.message)
      setAppointments((current) => current?.map((item) => item.id === appointment.id ? { ...item, status: 'cancelled' } : item) ?? null)
      push({ title: 'Appointment cancelled', desc: response.message, kind: 'success' })
    } catch (failure) {
      push({ title: 'Could not cancel the appointment', desc: failure instanceof Error ? failure.message : 'Try again in a moment.', kind: 'error' })
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  function appointmentRows(rows: Appt[]) {
    return (
      <ul className="register">
        {rows.map((appointment) => (
          <li key={appointment.id} className="register-row booking-row" tabIndex={-1}>
            <time className="register-mark data-text" dateTime={appointment.slot.replace(' ', 'T')}>{appointment.slot.slice(11, 16)}</time>
            <div><strong>{appointment.patient_name}</strong><p className="muted">{appointment.service}{appointment.phone ? ` · ${appointment.phone}` : ''}</p></div>
            <div className="booking-actions">
              <Badge tone={appointment.status === 'booked' ? 'success' : 'default'}>{recordLabel(appointment.status)}</Badge>
              {appointment.status === 'booked' && (confirming === appointment.id ? (
                <div className="cancel-confirmation" role="group" aria-label={`Cancel ${appointment.patient_name}’s appointment?`}>
                  <span>Cancel this appointment?</span>
                  <Button size="sm" variant="destructive" onClick={() => void cancel(appointment)} disabled={busy}>Yes, cancel</Button>
                  <Button ref={keepButton} size="sm" variant="outline" onClick={() => setConfirming(null)} disabled={busy}>Keep it</Button>
                </div>
              ) : <Button size="sm" variant="outline" disabled={busy} onClick={(event) => {
                focusAfterConfirmation.current = event.currentTarget.closest('li')
                setConfirming(appointment.id)
              }}>Cancel appointment</Button>)}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  function closeBooking() {
    setBooking(false)
    requestAnimationFrame(() => bookingButton.current?.focus())
  }

  const heading = (
    <PageHeading title="Appointments" description="See what’s booked and find an open time at the clinic.">
      <Button ref={bookingButton} disabled={!appointments} onClick={() => setBooking(true)}><CalendarPlus size={17} aria-hidden="true" />Book appointment</Button>
    </PageHeading>
  )
  if (error) return <>{heading}<LoadError title="Could not load appointments" message={error} retry={() => { setError(''); setAttempt(attempt + 1) }} /></>
  if (!appointments) return <>{heading}<LoadingRows label="Loading appointments…" /></>

  const visible = status === 'all' ? appointments : appointments.filter((appointment) => appointment.status === status)
  const calendarGroups = groupByDay(appointments)
  const listGroups = groupByDay(visible)
  const base = new Date(`${today}T12:00:00Z`).getTime()
  const days = Array.from({ length: 14 }, (_, index) => new Date(base + index * 86_400_000).toISOString().slice(0, 10))
  const openDay = selectedDay && days.includes(selectedDay) ? selectedDay : today
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }

  return (
    <>
      <Toasts toasts={toasts} onDismiss={dismiss} />
      {heading}
      {booking && <Suspense fallback={<p className="muted" role="status">Opening booking…</p>}><BookingDialog today={today} onClose={closeBooking} onBooked={(day) => {
        closeBooking()
        setStatus('all')
        setSelectedDay(day)
        setView('calendar')
        setAttempt((value) => value + 1)
        push({ title: 'Appointment booked', kind: 'success' })
      }} /></Suspense>}
      <div className="appointment-toolbar">
        <div className="appointment-views" role="group" aria-label="Appointments view">
          <Button variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')} aria-pressed={view === 'list'}><List size={16} aria-hidden="true" />List</Button>
          <Button variant={view === 'calendar' ? 'default' : 'outline'} onClick={() => setView('calendar')} aria-pressed={view === 'calendar'}><CalendarDays size={16} aria-hidden="true" />Calendar</Button>
        </div>
        {view === 'list' && <div><label htmlFor="appointment-status" className="field-label">Status</label>
          <select id="appointment-status" ref={statusFilter} value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">All statuses</option><option value="booked">Booked</option><option value="cancelled">Cancelled</option>
          </select>
        </div>}
      </div>

      <p className="appointments-zone muted">{zone ? `Times in ${tzAbbreviation(zone)}` : 'Clinic local time'}</p>

      {!appointments.length && view === 'list' ? (
        <EmptyState title="No appointments yet" description="Book an appointment here or run a practice call."><ActionLink to="/live">Run a demo call</ActionLink></EmptyState>
      ) : view === 'list' ? (
        <div className="booking-groups">
          {listGroups.size ? [...listGroups.entries()].map(([key, rows]) => (
            <section key={key} className="ruled-section"><SectionHeading title={key === today ? 'Today' : dateLabel(key, dateOptions)} note={key === today ? dateLabel(key, dateOptions) : undefined} />{appointmentRows(rows)}</section>
          )) : <EmptyState title={`No ${status} appointments`} description="Choose a different status to see more bookings."><Button variant="outline" onClick={() => setStatus('all')}>Show all</Button></EmptyState>}
        </div>
      ) : (
        <section className="ruled-section">
          <SectionHeading title="Next 14 days" note={`${dateLabel(days[0], { day: 'numeric', month: 'short' })} – ${dateLabel(days[13], { day: 'numeric', month: 'short', year: 'numeric' })}`} />
          <div className="appointment-calendar" ref={calendar}>
            {days.map((day) => {
              const rows = calendarGroups.get(day) ?? []
              return (
                <button key={day} type="button" aria-pressed={openDay === day} onClick={() => setSelectedDay(day)}>
                  <span className="muted">{day === today ? 'Today' : dateLabel(day, { weekday: 'short' })}</span>
                  <time dateTime={day}>{dateLabel(day, { day: 'numeric', month: 'short' })}</time>
                  <span className="calendar-count">{rows.filter((appointment) => appointment.status === 'booked').length} booked</span>
                </button>
              )
            })}
          </div>
          <section className="selected-day" key={openDay}>
            <SectionHeading title={dateLabel(openDay, dateOptions)} />
            {calendarGroups.has(openDay) ? appointmentRows(calendarGroups.get(openDay)!) : <EmptyState title="Nothing booked" description="There are no appointments on this day." />}
          </section>
        </section>
      )}
    </>
  )
}
