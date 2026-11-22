import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ActionLink, EmptyState, LoadError, LoadingRows, PageHeading } from '../components/Desk'
import { useDesk } from '../components/Layout'
import { parseTranscript, Transcript } from '../components/Transcript'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { api, type Call } from '../lib/api'
import { callDate, clockTime, formatDate, recordLabel } from '../lib/utils'

function CallFlags({ call }: { call: Call }) {
  return (
    <div className="call-flags">
      {call.urgency && <Badge tone={call.urgency === 'high' ? 'danger' : call.urgency === 'medium' ? 'warning' : 'default'}>{recordLabel(call.urgency)} urgency</Badge>}
      {call.sentiment && <Badge tone={call.sentiment === 'negative' ? 'danger' : call.sentiment === 'positive' ? 'success' : 'default'}>{recordLabel(call.sentiment)}</Badge>}
      {call.escalated ? <Badge tone="danger">Escalated</Badge> : null}
    </div>
  )
}

export default function Calls() {
  const { health } = useDesk()
  const zone = health?.timezone
  const [calls, setCalls] = useState<Call[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [params, setParams] = useSearchParams()
  const callId = params.get('call')
  const detail = useRef<HTMLElement>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const lastSelection = useRef<HTMLAnchorElement | null>(null)
  const restoreLogFocus = useRef(false)
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState('all')
  const [urgency, setUrgency] = useState('all')
  const [escalatedOnly, setEscalatedOnly] = useState(false)
  const filtersActive = Boolean(query.trim() || outcome !== 'all' || urgency !== 'all' || escalatedOnly)
  const queryText = query.trim().toLowerCase()
  const outcomes = [...new Set(calls?.map((call) => call.outcome))].sort()
  const filtered = calls?.filter((call) => (
    (outcome === 'all' || call.outcome === outcome) && (urgency === 'all' || call.urgency === urgency) &&
    (!escalatedOnly || call.escalated) &&
    (!queryText || `${call.caller} ${call.summary} ${call.transcript ?? ''}`.toLowerCase().includes(queryText))
  )) ?? []
  const activeCall = callId === null
    ? filtered[0]
    : (filtersActive ? filtered : calls)?.find((call) => String(call.id) === callId)
  const started = callDate(activeCall?.started_at)
  const mobileDetail = callId !== null && Boolean(activeCall)

  useEffect(() => {
    let current = true
    api.calls()
      .then((value) => { if (current) setCalls(value) })
      .catch((failure: Error) => { if (current) setError(failure.message) })
    return () => { current = false }
  }, [attempt])

  useEffect(() => {
    detail.current?.scrollTo(0, 0)
    if (mobileDetail && window.matchMedia('(max-width: 63.99rem)').matches) {
      detailHeading.current?.focus()
    } else if (restoreLogFocus.current) {
      restoreLogFocus.current = false
      const row = lastSelection.current
      if (row?.isConnected) row.focus()
      else search.current?.focus()
    }
  }, [mobileDetail, activeCall?.id])

  function clearFilters() {
    setQuery('')
    setOutcome('all')
    setUrgency('all')
    setEscalatedOnly(false)
    search.current?.focus()
  }

  function returnToLog() {
    restoreLogFocus.current = true
    setParams({}, { replace: true })
  }

  const heading = <PageHeading title="Calls" description="Find a call and read what was said." />
  if (error) return <>{heading}<LoadError title="Could not load calls" message={error} retry={() => { setError(''); setAttempt(attempt + 1) }} /></>
  if (!calls) return <>{heading}<LoadingRows label="Loading calls…" /></>

  return (
    <div className={mobileDetail ? 'calls-page mobile-detail' : 'calls-page'}>
      {heading}
      <div className="call-filter-area">
        <div className="call-filters" role="search" aria-label="Filter calls">
          <label className="search-field">
            <span className="field-label">Search</span>
            <span><Search size={17} aria-hidden="true" /><input ref={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caller, summary or transcript" /></span>
          </label>
          <div className="filter-field"><label htmlFor="call-outcome" className="field-label">Outcome</label>
            <select id="call-outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
              <option value="all">All outcomes</option>
              {outcomes.map((value) => <option key={value} value={value}>{recordLabel(value)}</option>)}
            </select>
          </div>
          <div className="filter-field"><label htmlFor="call-urgency" className="field-label">Urgency</label>
            <select id="call-urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
              <option value="all">Any urgency</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={escalatedOnly} onChange={(event) => setEscalatedOnly(event.target.checked)} />Escalated only</label>
          {filtersActive && <Button variant="ghost" onClick={clearFilters}><X size={16} aria-hidden="true" />Clear filters</Button>}
        </div>
      </div>

      <div className="calls-grid">
        <section className="call-register" aria-labelledby="call-log">
          <div className="section-heading">
            <h2 id="call-log">Call log</h2><span className="muted" role="status">{filtered.length} of {calls.length}</span>
          </div>
          {!calls.length ? (
            <EmptyState title="No calls yet" description="A completed call will appear here with its transcript."><ActionLink to="/live">Run a demo call</ActionLink></EmptyState>
          ) : !filtered.length ? (
            <EmptyState title="No matching calls" description="Try a different search or clear the filters." />
          ) : (
            <ul className="register">
              {filtered.map((call) => {
                const time = callDate(call.started_at)
                const selected = activeCall?.id === call.id
                return (
                  <li key={call.id}>
                    <Link className={`register-row call-list-row${selected ? ' selected-row' : ''}${selected && callId === null ? ' auto-selected' : ''}`} to={`?call=${call.id}`}
                      onClick={(event) => { lastSelection.current = event.currentTarget }} aria-current={selected && callId !== null ? 'true' : undefined}>
                      <span className="register-mark data-text muted">{time && <time dateTime={time.toISOString()}>{clockTime(time, zone)}<small>{formatDate(time, { day: 'numeric', month: 'short' }, zone)}</small></time>}</span>
                      <div className="call-list-summary"><strong>{call.caller}</strong><p className="muted">{call.summary}</p><CallFlags call={call} /></div>
                      <ChevronRight size={16} className="row-arrow" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="call-detail desk-sheet" aria-label="Call transcript" ref={detail} tabIndex={0}>
          {mobileDetail && <Button variant="ghost" className="back-to-log" onClick={returnToLog}><ArrowLeft size={16} aria-hidden="true" />Back to calls</Button>}
          {activeCall ? (
            <>
              <header className="detail-heading">
                <h2 ref={detailHeading} tabIndex={-1}>{activeCall.caller}</h2>
                {started && <p className="data-text muted"><time dateTime={started.toISOString()}>{formatDate(started, { day: 'numeric', month: 'long', year: 'numeric' }, zone)} · {clockTime(started, zone)}</time></p>}
                {activeCall.summary && <p className="reading">{activeCall.summary}</p>}
                <CallFlags call={activeCall} />
              </header>
              <div className="detail-outcome"><strong>Outcome</strong><span>{recordLabel(activeCall.outcome)}</span></div>
              <h3 className="transcript-title">Transcript</h3>
              {activeCall.transcript ? <Transcript turns={parseTranscript(activeCall.transcript)} /> : <p className="muted">No transcript was stored for this call.</p>}
            </>
          ) : (
            <EmptyState title={callId && !filtersActive ? 'Call unavailable' : 'No transcript selected'} description={callId && !filtersActive ? 'Choose an entry from the call log.' : 'Select a call to read its transcript.'} />
          )}
        </section>
      </div>
      {callId !== null && !activeCall && !filtersActive && <p className="mobile-unavailable" role="status">This call is unavailable. Choose a call from the log.</p>}
    </div>
  )
}
