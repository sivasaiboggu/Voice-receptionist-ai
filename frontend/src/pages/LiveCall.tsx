import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Phone, PhoneOff, Play } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../lib/useToast'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Toasts } from '../components/ui/toast'

const STEPS = ['Greet', 'Understand', 'Answer / book', 'Confirm', 'Log call']

const SCENARIOS: { label: string; desc: string; turns?: string[] }[] = [
  { label: 'Booking', desc: 'Books a teeth cleaning, asks hours & price', turns: undefined },
  { label: 'Emergency', desc: 'Severe pain — agent escalates to a human', turns: ['I am in terrible pain and bleeding'] },
  { label: 'Price question', desc: 'Asks what a root canal costs (cited)', turns: ['How much does a root canal cost?'] },
]

export default function LiveCall() {
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const [demo, setDemo] = useState<any>(null)
  const [scenario, setScenario] = useState(0)
  const { toasts, push, dismiss } = useToast()

  const runDemo = async () => {
    const sc = SCENARIOS[scenario]
    setRunning(true); setDemo(null); setStep(0)
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 700)
    try {
      const r = await api.demoCall(sc.turns)
      clearInterval(timer); setStep(STEPS.length - 1); setDemo(r)
      if (r.escalated) {
        push({ title: 'Demo call complete — escalated', desc: `Outcome: ${r.outcome}. The agent handed the call to a human.`, kind: 'info' })
      } else {
        push({ title: 'Demo call complete', desc: `Outcome: ${r.outcome}${r.follow_up_sms ? ' — appointment booked.' : '.'}`, kind: 'success' })
      }
    } catch (e) {
      clearInterval(timer)
      push({ title: 'API not reachable', desc: e instanceof Error ? e.message : 'Start the backend: uvicorn backend.app.api:app --port 8001', kind: 'error' })
    } finally { setRunning(false) }
  }

  const endCall = () => {
    setDemo(null); setStep(0)
    push({ title: 'Call ended', desc: 'The logged call stays in the Calls page.', kind: 'info' })
  }

  return (
    <div className="space-y-6">
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <div><h1 className="text-2xl font-bold tracking-tight">Live call</h1><p className="text-sm text-muted-foreground">Simulate a real incoming call — no phone or API keys needed, and nothing is really dialled or texted.</p></div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><CardTitle>Incoming call</CardTitle><CardDescription>Sunrise Dental Clinic · +91 95737 19115</CardDescription></div>
            {running ? (
              <Badge tone="success"><span className="mr-1.5 flex h-2 w-2"><span className="absolute h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>Live</Badge>
            ) : <Badge>Idle</Badge>}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <Button onClick={runDemo} disabled={running} size="lg">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Call in progress…' : 'Answer & run demo call'}
            </Button>
            <Button variant="outline" size="lg" disabled={running || !demo} onClick={endCall}><PhoneOff className="h-4 w-4" />End call</Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Booking flow: “I’d like to book a teeth cleaning” → hours → price → the agent books the first free slot and drafts the SMS confirmation. Demo only — no real call is placed and no SMS is sent.</p>
        </CardContent>
      </Card>

      <AnimatePresence>
        {demo && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Call transcript & summary</CardTitle>
                  <Badge tone={demo.escalated ? 'danger' : 'success'}>{demo.outcome}</Badge>
                  <Badge tone={demo.urgency === 'high' ? 'danger' : 'default'}>{demo.urgency} urgency</Badge>
                  <Badge>{demo.sentiment} sentiment</Badge>
                </div>
                <CardDescription>{demo.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">{demo.transcript}</pre>
                {demo.follow_up_sms && (
                  <div className="mt-4 rounded-lg border bg-emerald-500/5 p-4 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-semibold"><Phone className="h-4 w-4" />Follow-up SMS draft</div>
                    {demo.follow_up_sms}
                    <p className="mt-1 text-xs text-muted-foreground">Draft only — nothing is sent in demo mode.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
