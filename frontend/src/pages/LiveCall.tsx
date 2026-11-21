import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock3, Copy, Loader2, MessageSquareText, Phone, PhoneOff, Play, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../lib/useToast'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Toasts } from '../components/ui/toast'

const CALLER = '+919573719115'
const STEPS = ['Greet', 'Understand', 'Answer / book', 'Confirm', 'Log call']
const STATE_STEP: Record<string, number> = { greet: 0, understand: 1, book: 2, cancel: 2, message: 2, faq: 2, confirm: 3, escalate: 3 }

const SCENARIOS: { label: string; desc: string; turns: string[]; service?: string }[] = [
  {
    label: 'Booking',
    desc: 'Books a teeth cleaning, asks hours & price — then the agent books the first free slot.',
    turns: ["Hi, I'd like to book a teeth cleaning appointment", 'What are your opening hours?', 'How much does cleaning cost?'],
    service: 'Teeth cleaning',
  },
  {
    label: 'Emergency',
    desc: 'Severe pain — the agent escalates to a human and never auto-books.',
    turns: ['I am in terrible pain and bleeding'],
  },
  {
    label: 'Price question',
    desc: 'Asks what a root canal costs — answered from the knowledge base, with a citation.',
    turns: ['How much does a root canal cost?'],
  },
]

type Msg = { speaker: 'Agent' | 'Caller'; text: string; intent?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function LiveCall() {
  const [running, setRunning] = useState(false)
  const [typing, setTyping] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [step, setStep] = useState(0)
  const [scenario, setScenario] = useState(0)
  const [customText, setCustomText] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [smsState, setSmsState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [smsNote, setSmsNote] = useState('')
  const [copied, setCopied] = useState(false)
  const { toasts, push, dismiss } = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stopRef = useRef(false)

  // Call timer — ticks only while a call is live.
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [running])

  // Keep the newest bubble in view as the conversation flows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  const fmtElapsed = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // SMS segments at the standard 160 GSM characters — the draft is one
  // segment for today's demo data, but a long name or service can push
  // it over, so count it honestly instead of hardcoding "1 segment".
  const smsSegments = (s: string) => Math.max(1, Math.ceil(s.length / 160))

  const fail = (e: unknown) => {
    stopRef.current = true
    push({ title: 'API not reachable', desc: e instanceof Error ? e.message : 'Start the backend: uvicorn backend.app.api:app --port 8001', kind: 'error' })
  }

  /** One real caller turn against the live session API. */
  const sendTurn = async (text: string): Promise<{ reply: string; intent: string; state: string } | null> => {
    setMessages((m) => [...m, { speaker: 'Caller', text }])
    setTyping(true)
    try {
      const r = await api.callTurn(CALLER, text)
      setTyping(false)
      setMessages((m) => [...m, { speaker: 'Agent', text: r.reply, intent: r.intent }])
      setStep(STATE_STEP[r.state] ?? 2)
      return r
    } catch (e) {
      setTyping(false)
      fail(e)
      return null
    }
  }

  const finishCall = async () => {
    try {
      const r = await api.endCall(CALLER)
      setStep(STEPS.length - 1)
      setResult(r)
      if (r.escalated) {
        push({ title: 'Call ended — escalated', desc: `Outcome: ${r.outcome}. The agent handed the call to a human.`, kind: 'info' })
      } else {
        push({ title: 'Call ended', desc: `Outcome: ${r.outcome}${r.follow_up_sms ? ' — appointment booked, SMS draft ready below.' : '.'}`, kind: 'success' })
      }
    } catch (e) {
      fail(e)
    } finally {
      setRunning(false)
      setTyping(false)
    }
  }

  const runScripted = async () => {
    const sc = SCENARIOS[scenario]
    stopRef.current = false
    setRunning(true); setResult(null); setMessages([]); setStep(0); setElapsed(0); setSmsState('idle'); setSmsNote('')
    try {
      const start = await api.startCall(CALLER)
      setMessages([{ speaker: 'Agent', text: start.reply }])
      setStep(1)
      let escalated = false
      for (const line of sc.turns) {
        if (stopRef.current) return
        await sleep(500)
        const r = await sendTurn(line)
        if (!r) return
        if (r.state === 'escalate') { escalated = true; break }
      }
      if (stopRef.current) return
      // Mirror the demo flow: a non-escalated scripted call books the first
      // free slot for the scenario's service before the call is logged.
      if (!escalated && sc.service) {
        const slots = await api.slots()
        if (slots.available.length > 0) {
          const b = await api.bookAppointment('Demo Patient', sc.service, slots.available[0])
          setMessages((m) => [...m, { speaker: 'Agent', text: b.message }])
        }
      }
      await finishCall()
    } catch (e) {
      fail(e)
      setRunning(false)
    }
  }

  const startInteractive = async () => {
    stopRef.current = false
    setRunning(true); setResult(null); setMessages([]); setStep(0); setElapsed(0); setSmsState('idle'); setSmsNote('')
    try {
      const start = await api.startCall(CALLER)
      setMessages([{ speaker: 'Agent', text: start.reply }])
      setStep(1)
    } catch (e) {
      fail(e)
      setRunning(false)
    }
  }

  const sendCustom = async () => {
    const text = customText.trim()
    if (!text || !running || typing) return
    setCustomText('')
    const r = await sendTurn(text)
    if (r?.state === 'escalate') {
      push({ title: 'Escalated', desc: 'The agent handed the call to a human.', kind: 'info' })
    }
  }

  const endNow = async () => {
    if (!running) return
    stopRef.current = true
    await finishCall()
  }

  const reset = () => {
    stopRef.current = true
    setRunning(false); setTyping(false); setMessages([]); setResult(null); setStep(0); setElapsed(0); setSmsState('idle'); setSmsNote('')
  }

  const copySms = async () => {
    if (!result?.follow_up_sms) return
    try {
      await navigator.clipboard.writeText(result.follow_up_sms)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — the text is still visible */ }
  }

  const sendSms = async () => {
    if (!result?.follow_up_sms) return
    setSmsState('sending')
    try {
      const r = await api.notifySms(CALLER, result.follow_up_sms)
      setSmsState('done')
      setSmsNote(r.sent
        ? `Sent via Twilio${r.sid ? ` (SID ${r.sid})` : ''}.`
        : 'Draft recorded — nothing was sent. The backend is in demo mode (no Twilio keys configured), so this stays a preview.')
      push({ title: r.sent ? 'SMS sent' : 'SMS preview only', desc: r.sent ? 'The confirmation text was sent.' : 'Demo mode — no text was actually sent.', kind: r.sent ? 'success' : 'info' })
    } catch (e) {
      setSmsState('error')
      setSmsNote(e instanceof Error ? e.message : 'Could not reach the API.')
    }
  }

  return (
    <div className="space-y-6">
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live call</h1>
          <p className="text-sm text-muted-foreground">Talk to the agent turn by turn — every reply comes from the live backend, and nothing is really dialled or texted.</p>
        </div>
        {running && (
          <Badge tone="success">
            <span className="relative mr-1.5 flex h-2 w-2"><span className="absolute h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>
            Live · <Clock3 className="ml-1 mr-0.5 h-3 w-3" />{fmtElapsed(elapsed)}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><CardTitle>Incoming call</CardTitle><CardDescription>Sunrise Dental Clinic · +91 95737 19115</CardDescription></div>
            {running ? <Badge tone="success">On the line</Badge> : <Badge>Idle</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenario</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Demo scenario">
              {SCENARIOS.map((s, i) => (
                <Button key={s.label} variant={scenario === i ? 'default' : 'outline'} size="sm" disabled={running} onClick={() => setScenario(i)} aria-pressed={scenario === i}>
                  {s.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{SCENARIOS[scenario].desc}</p>
          </div>

          {/* Step indicator — driven by the agent's real state each turn. */}
          <div className="flex flex-wrap items-center gap-2" aria-label="Call progress">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${i < step ? 'bg-emerald-500 text-white' : i === step && running ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${i <= step ? 'text-foreground' : 'text-muted-foreground'}`}>{s}</span>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={runScripted} disabled={running} size="lg">
              <Play className="h-4 w-4" />{running ? 'Call in progress…' : 'Answer & run scenario'}
            </Button>
            <Button variant="outline" size="lg" disabled={running} onClick={startInteractive}>
              <MessageSquareText className="h-4 w-4" />Talk to the agent yourself
            </Button>
            <Button variant="outline" size="lg" disabled={!running} onClick={endNow}><PhoneOff className="h-4 w-4" />End call</Button>
            {(messages.length > 0 || result) && !running && (
              <Button variant="ghost" size="lg" onClick={reset}>Clear</Button>
            )}
          </div>

          {/* Live transcript — chat bubbles appear as each turn lands. */}
          <div ref={scrollRef} className="max-h-[480px] space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-4" aria-live="polite">
            {messages.length === 0 && !typing && (
              <p className="text-sm text-muted-foreground">No call yet. Run a scenario to watch the agent work, or talk to it yourself and type the caller&apos;s lines.</p>
            )}
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.speaker === 'Caller' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${m.speaker === 'Caller' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-background border'}`}>
                  <div className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    {m.speaker === 'Caller' ? 'Caller' : 'Agent'}
                    {m.intent && <span className="rounded-full bg-black/10 px-1.5 py-0.5 normal-case dark:bg-white/10">{m.intent}</span>}
                  </div>
                  {m.text}
                </div>
              </motion.div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border bg-background px-4 py-3 shadow-sm" aria-label="Agent is typing">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 150}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Free-text caller line — only while a call is live. */}
          {running && (
            <div className="flex gap-2">
              <input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void sendCustom() }}
                disabled={typing}
                placeholder="Type what the caller says… e.g. I'd like to cancel my appointment"
                aria-label="Caller message"
                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <Button onClick={() => void sendCustom()} disabled={typing || !customText.trim()}><Send className="h-4 w-4" />Send</Button>
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">Booking flow: “I’d like to book a teeth cleaning” → hours → price → the agent books the first free slot and drafts the SMS confirmation. Demo only — no real call is placed and no SMS is sent unless you press Send below.</p>
        </CardContent>
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Call summary</CardTitle>
                  <Badge tone={result.escalated ? 'danger' : 'success'}>{result.outcome}</Badge>
                  <Badge tone={result.urgency === 'high' ? 'danger' : 'default'}>{result.urgency} urgency</Badge>
                  <Badge>{result.sentiment} sentiment</Badge>
                </div>
                <CardDescription>{result.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.follow_up_sms && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">SMS preview — check before sending</div>
                    {/* Phone-style preview of the exact draft text. */}
                    <div className="mx-auto max-w-sm rounded-[2rem] border bg-background p-3 shadow-sm">
                      <div className="rounded-[1.6rem] bg-muted/60 p-4">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Phone className="h-3.5 w-3.5" />Sunrise Dental Clinic</div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.follow_up_sms}</p>
                        <p className="mt-2 text-right text-[11px] text-muted-foreground">{result.follow_up_sms.length} characters · {smsSegments(result.follow_up_sms)} SMS segment{smsSegments(result.follow_up_sms) > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void copySms()}>
                        <Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy text'}
                      </Button>
                      <Button size="sm" disabled={smsState === 'sending' || smsState === 'done'} onClick={() => void sendSms()}>
                        {smsState === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {smsState === 'done' ? 'Sent / recorded' : 'Send SMS'}
                      </Button>
                      {smsNote && <span className="text-xs text-muted-foreground">{smsNote}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">The backend sends only when Twilio keys are configured; in demo mode this records the draft and sends nothing.</p>
                  </div>
                )}
                {result.transcript && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">Full stored transcript</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">{result.transcript}</pre>
                  </details>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
