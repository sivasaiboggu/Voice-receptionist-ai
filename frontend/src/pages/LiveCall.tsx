import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AudioLines, Check, Copy, MessageSquare, PhoneOff, Play, Send } from 'lucide-react'
import * as z from 'zod/mini'
import { ActionLink, EmptyState, PageHeading, SectionHeading } from '../components/Desk'
import { useDesk } from '../components/Layout'
import { Transcript, type Turn } from '../components/Transcript'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Toasts } from '../components/ui/toast'
import { api, ApiError, type EndCallResult } from '../lib/api'
import { useToast } from '../lib/useToast'
import { recordLabel } from '../lib/utils'

const CALLER = '+12025550101'
const STEPS = ['Greet', 'Understand', 'Answer or book', 'Confirm', 'Log call']
const STATE_STEP: Record<string, number> = { greet: 0, understand: 1, book: 2, cancel: 2, message: 2, faq: 2, confirm: 3, escalate: 3 }
const callerLine = z.string().check(
  z.trim(),
  z.minLength(1, 'Enter what the caller says.'),
  z.refine((text) => [...text].length <= 2000, 'Use 2,000 characters or fewer.'),
)

const scenarios: { label: string; description: string; turns: string[]; booking?: boolean }[] = [
  {
    label: 'Booking',
    description: 'Ask for a cleaning, choose an offered time and give the patient’s name.',
    turns: ["Hi, I'd like to book a teeth cleaning appointment"],
    booking: true,
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
  id: string
  mode: Mode
  started: boolean
  stopping: boolean
  busy: boolean
  task: Promise<void>
  closing?: Promise<EndCallResult | null>
}

function closeSession(session: Session) {
  session.stopping = true
  session.closing ??= (async () => {
    try {
      await session.task
      return session.started ? await api.endSimulation(session.id) : null
    } catch (error) {
      session.closing = undefined
      throw error
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
  const { health } = useDesk()
  const practiceUnavailable = health?.demo_mode === false
  const [phase, setPhase] = useState<'idle' | 'starting' | 'running' | 'ending' | 'close-error'>('idle')
  const [mode, setMode] = useState<Mode>('scripted')
  const [typing, setTyping] = useState(false)
  const [messages, setMessages] = useState<Turn[]>([])
  const [step, setStep] = useState(0)
  const [slots, setSlots] = useState<string[]>([])
  const [scenario, setScenario] = useState(0)
  const [customText, setCustomText] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<EndCallResult | null>(null)
  const [copied, setCopied] = useState(false)
  const { toasts, push, dismiss } = useToast()
  const transcript = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<Session | null>(null)
  const active = phase !== 'idle'
  const counting = active && phase !== 'close-error'

  useEffect(() => () => {
    const session = sessionRef.current
    sessionRef.current = null
    if (session) void closeSession(session).catch(() => {})
  }, [])

  useEffect(() => {
    if (!counting) return
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [counting])

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
    setSlots([])
    setElapsed(0)
    setCustomText('')
    setFieldError('')
    setCopied(false)
  }

  async function sendTurn(session: Session, text: string) {
    setMessages((turns) => [...turns, { speaker: 'Caller', text }])
    setTyping(true)
    try {
      const turn = await api.simulationTurn(session.id, text)
      if (sessionRef.current === session) {
        setMessages((turns) => [...turns, { speaker: 'Agent', text: turn.reply, intent: turn.intent }])
        setStep(STATE_STEP[turn.state] ?? 2)
        setSlots(turn.slots)
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
      if (sessionRef.current !== session) return
      setStep(logged ? STEPS.length : 0)
      setSlots([])
      setResult(logged)
      sessionRef.current = null
      setPhase('idle')
      if (logged) push({
        title: logged.escalated ? 'Call logged and escalated' : 'Call logged',
        desc: logged.follow_up_sms ? 'The confirmation text is ready to review.' : undefined,
        kind: logged.escalated ? 'info' : 'success',
      })
    } catch (error) {
      if (sessionRef.current === session) {
        fail('Could not end the call', error)
        if (error instanceof ApiError && error.status === 404) {
          sessionRef.current = null
          setPhase('idle')
        } else {
          setPhase('close-error')
        }
      }
    } finally {
      if (sessionRef.current === session || sessionRef.current === null) setTyping(false)
    }
  }

  function start(nextMode: Mode) {
    if (sessionRef.current || practiceUnavailable) return

    clear()
    setMode(nextMode)
    setPhase('starting')
    const session: Session = { id: crypto.randomUUID(), mode: nextMode, started: false, stopping: false, busy: false, task: Promise.resolve() }
    const selected = scenarios[scenario]
    sessionRef.current = session

    session.task = (async () => {
      try {
        const greeting = await api.startSimulation(session.id)
        session.started = true
        if (session.stopping) return
        setMessages([{ speaker: 'Agent', text: greeting.reply }])
        setStep(1)
        setPhase('running')
        if (session.mode === 'interactive') return

        let offered: string[] = []
        for (const text of selected.turns) {
          await waitForTurn()
          if (session.stopping) return
          const turn = await sendTurn(session, text)
          offered = turn.slots
          if (turn.state === 'escalate') return
        }

        if (selected.booking && offered.length) {
          await waitForTurn()
          if (session.stopping) return
          const choice = await sendTurn(session, offered[0])
          if (choice.slots.length) return
          await waitForTurn()
          if (session.stopping) return
          await sendTurn(session, 'My name is Demo Patient')
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
    submitTurn(session, line.data)
  }

  function submitTurn(session: Session, text: string) {
    if (session.stopping || session.busy) return
    session.busy = true
    setCustomText('')
    setFieldError('')
    session.task = sendTurn(session, text)
      .then((turn) => {
        if (turn.state === 'escalate' && sessionRef.current === session) session.stopping = true
      })
      .catch((error: unknown) => {
        if (sessionRef.current === session) {
          setCustomText(text)
          fail('Could not send the caller’s line', error)
        }
      })
      .finally(() => { session.busy = false })
    void session.task.then(() => { if (session.stopping) void finish(session) })
  }

  async function copySms(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      push({ title: 'Could not copy the text', desc: 'Select the draft to copy it manually.', kind: 'error' })
    }
  }

  const sms = result?.follow_up_sms
  const status = { idle: result ? 'Call ended' : 'Ready', starting: 'Connecting', running: 'On the line', ending: 'Ending call', 'close-error': 'Call log pending' }[phase]

  return (
    <>
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <PageHeading title="Live call" description="Run a practice call or type your own caller messages." />
      <div className="live-grid">
        <div className="live-controls desk-sheet">
          <section className="ruled-section">
            <SectionHeading title="Scenario" />
            <fieldset className="scenario-list" disabled={active || practiceUnavailable}>
              <legend className="sr-only">Choose a scenario</legend>
              {scenarios.map(({ label }, index) => (
                <label key={label}><input type="radio" name="scenario" checked={scenario === index} onChange={() => setScenario(index)} />{label}</label>
              ))}
            </fieldset>
            <p className="muted scenario-description">{practiceUnavailable ? 'Practice calls are available in demo mode.' : scenarios[scenario].description}</p>
            <div className="live-actions">
              <Button onClick={() => start('scripted')} disabled={active || practiceUnavailable}><Play size={16} aria-hidden="true" />Run scenario</Button>
              <Button variant="outline" onClick={() => start('interactive')} disabled={active || practiceUnavailable}><MessageSquare size={16} aria-hidden="true" />Talk to the agent</Button>
            </div>
          </section>
          <section className="ruled-section progress-section">
            <SectionHeading title="Call progress" />
            <div className="call-progress-track" role="progressbar" aria-label="Call progress" aria-valuenow={step} aria-valuemin={0} aria-valuemax={STEPS.length}>
              <span style={{ '--chart-value': step / STEPS.length } as React.CSSProperties} />
            </div>
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
              <div className="line-identity"><div className={`line-signal${typing ? ' signal-active' : ''}`} aria-hidden="true"><AudioLines size={22} /></div><div><h2 id="conversation">Conversation</h2><p>Practice line · {CALLER}</p></div></div>
              <div className="live-state" role="status">
                <Badge dot tone={phase === 'running' ? 'success' : 'default'}>{status}</Badge>
                {(active || result) && <span className="data-text" aria-label="Elapsed time" aria-live="off">{elapsedLabel(elapsed)}</span>}
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
                {slots.length > 0 && <fieldset className="offered-slots" disabled={phase !== 'running' || typing}>
                  <legend>Offered times</legend>
                  {slots.map((slot) => <Button key={slot} variant="outline" size="sm" onClick={() => { if (sessionRef.current) submitTurn(sessionRef.current, slot) }}>{slot}</Button>)}
                </fieldset>}
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
                  <Button variant="outline" disabled={phase === 'ending'} onClick={() => { if (sessionRef.current) void finish(sessionRef.current) }}><PhoneOff size={16} aria-hidden="true" />{phase === 'close-error' ? 'Retry call log' : 'End call'}</Button>
                ) : <Button variant="outline" onClick={clear}>Clear conversation</Button>}
              </footer>
            )}
          </section>

          {result && (
            <section className="ruled-section result-section turn-enter">
              <SectionHeading title="Call summary"><ActionLink to={`/calls?call=${result.call_id}`}>Open in call log</ActionLink></SectionHeading>
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
                  </div>
                  <p className="muted">Practice calls generate a draft only.</p>
                </section>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
