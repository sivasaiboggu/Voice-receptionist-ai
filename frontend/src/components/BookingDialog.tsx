import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarPlus, X } from 'lucide-react'
import * as z from 'zod/mini'
import { api, type Service } from '../lib/api'
import { formatDate, tzAbbreviation } from '../lib/utils'
import { Button } from './ui/button'

const bookingFields = z.object({
  name: z.string().check(z.trim(), z.minLength(1, 'Enter the patient’s name.'), z.maxLength(100, 'Use 100 characters or fewer.')),
  phone: z.string().check(z.trim(), z.regex(/^\+?[0-9][0-9\s-]{6,18}$/, 'Enter a valid phone number.')),
})

type Field = 'name' | 'phone' | 'slot'

export default function BookingDialog({ today, onClose, onBooked }: {
  today: string
  onClose: () => void
  onBooked: (day: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const saving = useRef(false)
  const [services, setServices] = useState<Service[] | null>(null)
  const [service, setService] = useState('')
  const [day, setDay] = useState(today)
  const [slot, setSlot] = useState('')
  const [availability, setAvailability] = useState<{ available: string[]; timezone: string } | null>(null)
  const [serviceError, setServiceError] = useState('')
  const [availabilityError, setAvailabilityError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [serviceAttempt, setServiceAttempt] = useState(0)
  const [slotAttempt, setSlotAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const selectedService = services?.find((item) => item.name === service)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return { value: date.toISOString().slice(0, 10), label: formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' }, 'UTC') }
  })

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])

  useEffect(() => {
    let current = true
    api.services()
      .then((items) => { if (current) setServices(items) })
      .catch((failure: Error) => { if (current) setServiceError(failure.message) })
    return () => { current = false }
  }, [serviceAttempt])

  useEffect(() => {
    if (!service) return
    let current = true
    api.slots(service, day)
      .then((value) => { if (current) setAvailability(value) })
      .catch((failure: Error) => { if (current) setAvailabilityError(failure.message) })
    return () => { current = false }
  }, [service, day, slotAttempt])

  function resetSlots() {
    setSlot('')
    setAvailability(null)
    setAvailabilityError('')
    setErrors((current) => ({ ...current, slot: undefined }))
  }

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    const fields = new FormData(event.currentTarget)
    const parsed = bookingFields.safeParse({ name: fields.get('name'), phone: fields.get('phone') })
    const issues: Partial<Record<Field, string>> = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'name' || key === 'phone') issues[key] ??= issue.message
      }
    }
    if (!slot || !availability?.available.includes(slot)) issues.slot = 'Choose an available time.'
    setErrors(issues)
    const first = Object.keys(issues)[0]
    if (!parsed.success || first) {
      const field = form.current?.querySelector<HTMLElement>(`[name="${first}"]`)
      field?.focus()
      return
    }
    saving.current = true
    setBusy(true)
    setSaveError('')
    try {
      await api.bookAppointment(parsed.data.name, service, slot, parsed.data.phone)
      onBooked(day)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The appointment could not be saved.')
      resetSlots()
      setSlotAttempt((value) => value + 1)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="booking-dialog" aria-labelledby="booking-title" onCancel={(event) => { event.preventDefault(); if (!saving.current) onClose() }}>
      <header className="dialog-heading">
        <div><h2 id="booking-title">Book an appointment</h2><p>Choose a service and an open time at the clinic.</p></div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose} aria-label="Close booking"><X size={20} aria-hidden="true" /></Button>
      </header>
      <form ref={form} className="booking-form" onSubmit={(event) => void book(event)} noValidate>
        <div className="booking-fields">
          <label><span className="field-label">Service</span>
            <select value={service} onChange={(event) => { resetSlots(); setService(event.target.value) }} disabled={!services || busy}>
              <option value="">{services ? 'Choose a service' : serviceError ? 'Services unavailable' : 'Loading services…'}</option>
              {services?.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.minutes} min</option>)}
            </select>
          </label>
          <label><span className="field-label">Day</span>
            <select value={day} onChange={(event) => { resetSlots(); setDay(event.target.value) }} disabled={busy}>
              {days.map(({ value, label }) => <option key={value} value={value}>{value === today ? 'Today · ' : ''}{label}</option>)}
            </select>
          </label>
        </div>
        {serviceError && <div><p className="field-error" role="alert">{serviceError}</p><Button size="sm" variant="outline" onClick={() => { setServiceError(''); setServiceAttempt((value) => value + 1) }}>Reload services</Button></div>}
        {selectedService && <p className="muted">{selectedService.minutes} minutes · {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(selectedService.price)}</p>}
        {service && <fieldset className="booking-time-options" disabled={busy}>
          <legend className="field-label">Available times {availability && <span className="muted">· {tzAbbreviation(availability.timezone)}</span>}</legend>
          {availability ? (
            availability.available.length ? <div className="slot-grid">{availability.available.map((time) => (
              <label key={time}><input type="radio" name="slot" checked={slot === time} onChange={() => { setSlot(time); setErrors((value) => ({ ...value, slot: undefined })) }} aria-describedby={errors.slot ? 'booking-slot-error' : undefined} /><span className="data-text">{time.slice(11, 16)}</span></label>
            ))}</div> : <p className="muted" role="status">No open times. Try another day.</p>
          ) : availabilityError ? <div><p className="field-error" role="alert">{availabilityError}</p><Button size="sm" variant="outline" onClick={() => { resetSlots(); setSlotAttempt((value) => value + 1) }}>Reload times</Button></div> : <p className="muted" role="status">Checking open times…</p>}
          {errors.slot && <p className="field-error" id="booking-slot-error" role="alert">{errors.slot}</p>}
        </fieldset>}
        <div className="booking-fields">
          <label><span className="field-label">Patient name</span><input name="name" autoComplete="off" maxLength={100} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'booking-name-error' : undefined} disabled={busy} />
            {errors.name && <span className="field-error" id="booking-name-error">{errors.name}</span>}
          </label>
          <label><span className="field-label">Phone number</span><input type="tel" name="phone" autoComplete="off" maxLength={20} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'booking-phone-error' : undefined} disabled={busy} />
            {errors.phone && <span className="field-error" id="booking-phone-error">{errors.phone}</span>}
          </label>
        </div>
        {saveError && <p className="field-error" role="alert">{saveError}</p>}
        <footer className="dialog-actions">
          <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
          <Button type="submit" disabled={!availability?.available.length || busy}><CalendarPlus size={17} aria-hidden="true" />{busy ? 'Booking…' : 'Confirm booking'}</Button>
        </footer>
      </form>
    </dialog>
  )
}
