import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Copy, MessageSquare, PhoneOff, Play, Send } from 'lucide-react'
import * as z from 'zod/mini'
import { EmptyState, PageHeading, SectionHeading } from '../components/Desk'
import { Transcript, type Turn } from '../components/Transcript'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Toasts } from '../components/ui/toast'
import { api, type EndCallResult } from '../lib/api'
import { useToast } from '../lib/useToast'
import { recordLabel } from '../lib/utils'

const CALLER = '+919573719115'
const STEPS = ['Greet', 'Understand', 'Answer or book', 'Confirm', 'Log call']
const STATE_STEP: Record<string, number> = { greet: 0, understand: 1, book: 2, cancel: 2, message: 2, faq: 2, confirm: 3, escalate: 3 }
const callerLine = z.string().check(
  z.trim(),
  z.minLength(1, 'Enter what the caller says.'),
  z.refine((text) => [...text].length <= 2000, 'Use 2,000 characters or fewer.'),
)

const scenarios: { label: string; description: string; turns: string[]; service?: string }[] = [
  {
    label: 'Booking',
    description: 'Book a cleaning, check the clinic hours and ask about the price.',
    turns: ["Hi, I'd like to book a teeth cleaning appointment", 'What are your opening hours?', 'How much does cleaning cost?'],
    service: 'Teeth cleaning',
  },
  {
    label: 'Emergency',
    description: 'Hear how the receptionist hands off a caller in severe pain.',
    turns: ['I am in terrible pain and bleeding'],
  },
  {
    label: 'Price question',
    description: 'Ask what a root canal costs.',
    turns: ['How much does a root canal cost?'],
  },
]

type Mode = 'scripted' | 'interactive'
type Session = {
  mode: Mode
  started: boolean
  stopping: boolean
  busy: boolean
  task: Promise<void>
  closing?: Promise<EndCallResult | null>
}

// The API identifies the simulator by a shared caller number. A session
// opened on this page must finish before the same tab can reuse the caller.
let pendingSession: Session | null = null

function closeSession(session: Session) {
  session.stopping = true
  session.closing ??= (async () => {
    try {
      await session.task
      return session.started ? await api.endCall(CALLER) : null
    } finally {
      if (pendingSession === session) pendingSession = null
    }
  })()
  return session.closing
}

const waitForTurn = () => new Promise<void>((resolve) => window.setTimeout(resolve, 350))
const elapsedLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

const gsmBasic = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const gsmExtended = '^{}\\[~]|€\f'

function smsSegments(text: string) {
  const gsm = [...text].every((character) => gsmBasic.includes(character) || gsmExtended.includes(character))
  const size = gsm ? [...text].reduce((total, character) => total + (gsmExtended.includes(character) ? 2 : 1), 0) : text.length
  return size <= (gsm ? 160 : 70) ? 1 : Math.ceil(size / (gsm ? 153 : 67))
}

export default function LiveCall() {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'running' | 'ending'>('idle')
  const [mode, setMode] = useState<Mode>('scripted')
  const [typing, setTyping] = useState(false)
  const [messages, setMessages] = useState<Turn[]>([])
  const [step, setStep] = useState(0)
  const [scenario, setScenario] = useState(0)
  const [customText, setCustomText] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<EndCallResult | null>(null)
  const [smsState, setSmsState] = useState<'idle' | 'sending' | 'sent' | 'recorded' | 'error'>('idle')
  const [smsNote, setSmsNote] = useState('')
  const [copied, setCopied] = useState(false)
  const { toasts, push, dismiss } = useToast()
  const transcript = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<Session | null>(null)
  const active = phase !== 'idle'

  useEffect(() => () => {
    const session = sessionRef.current
    sessionRef.current = null
    if (session) void closeSession(session).catch(() => {})
  }, [])

  useEffect(() => {
    if (!active) return
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight
  }, [messages, typing])

  useEffect(() => {
    if (phase === 'running' && mode === 'interactive') composer.current?.focus()
  }, [phase, mode])

  function fail(title: string, error: unknown) {
    push({ title, desc: error instanceof Error ? error.message : 'Try again in a moment.', kind: 'error' })
  }

  function clear() {
    setResult(null)
    setMessages([])
    setStep(0)
    setElapsed(0)
    setCustomText('')
    setFieldError('')
    setSmsState('idle')
    setSmsNote('')
    setCopied(false)
  }

  async function sendTurn(session: Session, text: string) {
    setMessages((turns) => [...turns, { speaker: 'Caller', text }])
    setTyping(true)
    try {
      const turn = await api.callTurn(CALLER, text)
      if (sessionRef.current === session) {
        setMessages((turns) => [...turns, { speaker: 'Agent', text: turn.reply, intent: turn.intent }])
        setStep(STATE_STEP[turn.state] ?? 2)
      }
      return turn
    } finally {
      if (sessionRef.current === session) setTyping(false)
    }
  }

  async function finish(session: Session) {
    if (session.closing || sessionRef.current !== session) return
    setPhase('ending')
    try {
      const logged = await closeSession(session)
      if (!logged || sessionRef.current !== session) return
      if (!logged.ok) throw new Error(logged.message || 'The API could not find the active call.')
      setStep(STEPS.length)
      setResult(logged)
      push({
        title: logged.escalated ? 'Call logged and escalated' : 'Call logged',
        desc: logged.follow_up_sms ? 'The confirmation text is ready to review.' : undefined,
        kind: logged.escalated ? 'info' : 'success',
      })
    } catch (error) {
      if (sessionRef.current === session) fail('Could not end the call', error)
    } finally {
      if (sessionRef.current === session) {
        sessionRef.current = null
        setPhase('idle')
        setTyping(false)
      }
    }
  }

  function start(nextMode: Mode) {
    if (pendingSession) {
      push({ title: 'A call is still closing', desc: 'Try again in a moment.', kind: 'info' })
      return
    }

    clear()
    setMode(nextMode)
    setPhase('starting')
    const session: Session = { mode: nextMode, started: false, stopping: false, busy: false, task: Promise.resolve() }
    const selected = scenarios[scenario]
    pendingSession = session
    sessionRef.current = session

    session.task = (async () => {
      try {
        const greeting = await api.startCall(CALLER)
        session.started = true
        if (session.stopping) return
        setMessages([{ speaker: 'Agent', text: greeting.reply }])
        setStep(1)
        setPhase('running')
        if (session.mode === 'interactive') return

        for (const text of selected.turns) {
          await waitForTurn()
          if (session.stopping) return
          const turn = await sendTurn(session, text)
          if (turn.state === 'escalate') return
        }

        if (!session.stopping && selected.service) {
          const slots = await api.slots(selected.service)
          if (!session.stopping && slots.available.length) {
            const booking = await api.bookAppointment('Demo Patient', selected.service, slots.available[0], CALLER)
            if (sessionRef.current === session) {
              setMessages((turns) => [...turns, { speaker: 'Agent', text: booking.message }])
            }
          }
        }
      } catch (error) {
        if (sessionRef.current === session) fail(session.started ? 'The call was interrupted' : 'Could not start the call', error)
        session.stopping = true
      }
    })()
    void session.task.then(() => {
      if (session.mode === 'scripted' || session.stopping) void finish(session)
    })
  }

  function submitCallerLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const session = sessionRef.current
    if (!session || session.mode !== 'interactive' || !session.started || session.stopping || session.busy) return
    const line = callerLine.safeParse(customText)
    if (!line.success) {
      setFieldError(line.error.issues[0].message)
      return
    }
    session.busy = true
    setCustomText('')
    setFieldError('')
    session.task = sendTurn(session, line.data)
      .then((turn) => {
        if (turn.state === 'escalate' && sessionRef.current === session) {
          push({ title: 'Call escalated', desc: 'The receptionist handed the call to a person.', kind: 'info' })
        }
      })
      .catch((error: unknown) => { if (sessionRef.current === session) fail('Could not send the caller’s line', error) })
      .finally(() => { session.busy = false })
  }

  async function copySms(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      push({ title: 'Could not copy the text', desc: 'Select the draft to copy it manually.', kind: 'error' })
    }
  }

  async function sendSms(text: string) {
    setSmsState('sending')
    setSmsNote('')
    try {
      const response = await api.notifySms(result?.caller || CALLER, text)
      if (!response.sent && response.error) throw new Error(response.error)
      setSmsState(response.sent ? 'sent' : 'recorded')
      setSmsNote(response.sent ? 'Confirmation text sent.' : 'Preview only. No text was sent.')
    } catch (error) {
      setSmsState('error')
      setSmsNote(error instanceof Error ? error.message : 'Could not send the text.')
    }
  }

  const sms = result?.follow_up_sms
  const smsBusy = smsState === 'sending'
  const smsLabel = { idle: 'Send SMS', sending: 'Sending…', sent: 'Sent', recorded: 'Preview only', error: 'Retry SMS' }[smsState]

  return (
    <>
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <PageHeading title="Live call" description="Simulate a call with the receptionist. No phone call is placed." />
      <div className="live-grid">
        <div className="live-controls">
          <section className="ruled-section">
            <SectionHeading title="Scenario" />
            <fieldset className="scenario-list" disabled={active}>
              <legend className="sr-only">Choose a scenario</legend>
              {scenarios.map(({ label }, index) => (
                <label key={label}><input type="radio" name="scenario" checked={scenario === index} onChange={() => setScenario(index)} />{label}</label>
              ))}
            </fieldset>
            <p className="muted scenario-description">{scenarios[scenario].description}</p>
            <div className="live-actions">
              <Button onClick={() => start('scripted')} disabled={active || smsBusy}><Play size={16} aria-hidden="true" />Run scenario</Button>
              <Button variant="outline" onClick={() => start('interactive')} disabled={active || smsBusy}><MessageSquare size={16} aria-hidden="true" />Talk to the agent</Button>
            </div>
          </section>
          <section className="ruled-section progress-section">
            <SectionHeading title="Call progress" />
            <ol className="progress-list">
              {STEPS.map((label, index) => (
                <li key={label} aria-current={active && step === index ? 'step' : undefined}>
                  <span aria-hidden="true">{index < step && <Check size={15} />}</span>{label}
                  {index < step && <span className="sr-only"> complete</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="live-conversation">
          <section className="desk-sheet" aria-labelledby="conversation">
            <header className="live-heading">
              <div><h2 id="conversation">Conversation</h2><p className="muted">{CALLER}</p></div>
              <div className="live-state">
                <Badge dot tone={phase === 'running' ? 'success' : 'default'}>{phase === 'starting' ? 'Connecting' : phase === 'ending' ? 'Ending call' : active ? 'On the line' : result ? 'Call ended' : 'Ready'}</Badge>
                {(active || result) && <span className="data-text muted" aria-label="Elapsed time">{elapsedLabel(elapsed)}</span>}
              </div>
            </header>

            <div ref={transcript} className="live-transcript" role="log" aria-label="Conversation turns" tabIndex={messages.length ? 0 : undefined}>
              {messages.length ? <Transcript turns={messages} animate /> : (
                <EmptyState title={phase === 'starting' ? 'Connecting to the receptionist…' : phase === 'ending' ? 'Closing the call…' : 'No call in progress'} description={active ? 'The conversation will appear here.' : 'Run a scenario or type your own caller lines.'} />
              )}
              {typing && <p className="reply-pending muted" role="status">Waiting for the receptionist…</p>}
            </div>

            {active && mode === 'interactive' && (
              <form className="caller-form" onSubmit={submitCallerLine} noValidate>
                <label htmlFor="caller-line" className="field-label">Caller message</label>
                <div>
                  <input id="caller-line" ref={composer} value={customText} onChange={(event) => { setCustomText(event.target.value); setFieldError('') }}
                    placeholder="Type what the caller says" aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'caller-error' : undefined} disabled={phase !== 'running'} />
                  <Button type="submit" disabled={phase !== 'running' || typing}><Send size={16} aria-hidden="true" />Send</Button>
                </div>
                {fieldError && <p className="field-error" id="caller-error" role="alert">{fieldError}</p>}
              </form>
            )}
            {(active || messages.length > 0 || result) && (
              <footer className="conversation-footer">
                {active ? (
                  <Button variant="outline" disabled={phase === 'ending'} onClick={() => { if (sessionRef.current) void finish(sessionRef.current) }}><PhoneOff size={16} aria-hidden="true" />End call</Button>
                ) : <Button variant="outline" disabled={smsBusy} onClick={clear}>Clear conversation</Button>}
              </footer>
            )}
          </section>

          {result && (
            <section className="ruled-section result-section turn-enter">
              <SectionHeading title="Call summary" />
              <div className="call-flags">
                {result.outcome && <Badge tone={result.escalated ? 'danger' : 'default'}>{recordLabel(result.outcome)}</Badge>}
                {result.urgency && <Badge tone={result.urgency === 'high' ? 'danger' : result.urgency === 'medium' ? 'warning' : 'default'}>{recordLabel(result.urgency)} urgency</Badge>}
                {result.sentiment && <Badge tone={result.sentiment === 'negative' ? 'danger' : result.sentiment === 'positive' ? 'success' : 'default'}>{recordLabel(result.sentiment)} sentiment</Badge>}
              </div>
              {result.summary && <p className="reading">{result.summary}</p>}
              {result.transcript && <details><summary>Full stored transcript</summary><pre className="reading stored-transcript">{result.transcript}</pre></details>}

              {sms && (
                <section className="sms-preview" aria-label="SMS preview">
                  <header><h3>SMS preview</h3><span className="muted">To {result.caller || CALLER}</span></header>
                  <p className="reading">{sms}</p>
                  <p className="muted">{[...sms].length} characters · {smsSegments(sms)} estimated segment{smsSegments(sms) === 1 ? '' : 's'}</p>
                  <div className="sms-actions">
                    <Button variant="outline" onClick={() => void copySms(sms)}><Copy size={16} aria-hidden="true" />{copied ? 'Copied' : 'Copy text'}</Button>
                    <Button disabled={smsBusy || smsState === 'sent' || smsState === 'recorded'} onClick={() => void sendSms(sms)}><Send size={16} aria-hidden="true" />{smsLabel}</Button>
                  </div>
                  <p className="muted">This sends the text when SMS delivery is configured. Otherwise, it returns a preview.</p>
                  {smsNote && <p className={smsState === 'error' ? 'field-error' : 'muted'} role={smsState === 'error' ? 'alert' : 'status'}>{smsNote}</p>}
                </section>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
