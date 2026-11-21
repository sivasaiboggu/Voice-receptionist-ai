// Backend base URL resolution — order matters:
// 1. VITE_API_URL when set (blank counts as unset; trailing slashes stripped).
// 2. Local dev: the backend on http://localhost:8001.
// 3. Production with no VITE_API_URL: deliberately NOT localhost — a
//    browser on another machine can never reach the developer's
//    localhost, and silently calling it would look like a backend
//    outage. Requests fail fast with a configuration error instead
//    (see request()), telling the deployer to set VITE_API_URL.
const rawApiUrl = import.meta.env.VITE_API_URL?.trim()
export const API: string = rawApiUrl
  ? rawApiUrl.replace(/\/+$/, '')
  : import.meta.env.DEV
    ? 'http://localhost:8001'
    : ''

/** True when the dashboard knows where the backend is (always in dev). */
export const isApiConfigured = import.meta.env.DEV || Boolean(rawApiUrl)

export type Health = { ok: boolean; service: string; version: string; demo_mode: boolean; database: string; timezone: string }
export type Call = { id: number; caller: string; summary: string; sentiment: string; urgency: string; outcome: string; escalated: number; started_at?: string; transcript?: string }
export type Appt = { id: number; patient_name: string; phone?: string; service: string; slot: string; status: string; created_at?: string }
export type Stats = { calls_answered: number; appointments_booked: number; escalations: number; unhandled_messages: number; answer_rate: number }
export type EndCallResult = { ok: boolean; message?: string; caller?: string; outcome?: string; escalated?: boolean; sentiment?: string; urgency?: string; summary?: string; transcript?: string; follow_up_sms?: string | null }

const TIMEOUT_MS = 10_000

function configError(): Error {
  return new Error(
    'API URL is not configured — set VITE_API_URL in the deployment environment to the backend URL, ' +
    'e.g. https://voice-receptionist-api.onrender.com (no trailing slash), then redeploy the frontend.',
  )
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isApiConfigured) throw configError()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal })
    // Read as text once: a misconfigured API base (e.g. pointing at the
    // frontend itself) returns the SPA's index.html with a 200, and
    // r.json() on HTML throws a bare SyntaxError that hides the cause.
    const text = await r.text()
    let body: unknown = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    if (!r.ok) {
      const detail = (body as { detail?: unknown; message?: unknown } | null)?.detail
        ?? (body as { detail?: unknown; message?: unknown } | null)?.message
      throw new Error(typeof detail === 'string' ? detail : `API ${r.status}`)
    }
    if (body === null) {
      throw new Error(
        `API at ${API || 'this site'} returned a non-JSON response — check VITE_API_URL points at the backend, not the frontend.`,
      )
    }
    return body as T
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`API at ${API} timed out — is the backend running?`)
    }
    if (e instanceof TypeError) {
      throw new Error(`Could not reach the API at ${API} — is the backend running and is CORS allowing this origin?`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path)
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
}

export const api = {
  health: () => get<Health>('/health'),
  calls: () => get<Call[]>('/calls'),
  appointments: () => get<Appt[]>('/appointments'),
  slots: (service?: string) => get<{ available: string[]; timezone: string }>(service ? `/slots?service=${encodeURIComponent(service)}` : '/slots'),
  analytics: () => get<Stats>('/analytics'),
  // Live turn-by-turn session: start greets, each turn returns the agent
  // reply with intent/state, end logs the call and returns its summary.
  startCall: (caller = '+919573719115') => post<{ reply: string }>(`/call/start?caller=${encodeURIComponent(caller)}`),
  callTurn: (caller: string, text: string) =>
    post<{ reply: string; intent: string; state: string }>('/call/turn', { caller, text }),
  endCall: (caller = '+919573719115') => post<EndCallResult>(`/call/end?caller=${encodeURIComponent(caller)}`),
  bookAppointment: (patient_name: string, service: string, slot: string, phone = '+919573719115') =>
    post<{ ok: boolean; message: string; follow_up_sms?: string }>('/call/book', { patient_name, service, slot, phone }),
  notifySms: (to: string, body: string) =>
    post<{ sent: boolean; mode: string; sid?: string; error?: string }>('/notify/sms', { to, body }),
  cancelAppointment: (slot: string, patient_name?: string) =>
    post<{ ok: boolean; message: string }>('/call/cancel', { slot, patient_name }),
}
