export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'

export type Call = { id: number; caller: string; summary: string; sentiment: string; urgency: string; outcome: string; escalated: number; started_at?: string; transcript?: string }
export type Appt = { id: number; patient_name: string; phone?: string; service: string; slot: string; status: string; created_at?: string }
export type Stats = { calls_answered: number; appointments_booked: number; escalations: number; unhandled_messages: number; answer_rate: number }
export type Message = { id: number; caller: string; message: string; created_at?: string; handled: number }

const TIMEOUT_MS = 10_000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal })
    if (!r.ok) {
      // Surface the backend's own message when it has one (e.g. 422 detail).
      let detail = `API ${r.status}`
      try { const body = await r.json(); detail = body?.detail ?? body?.message ?? detail } catch { /* keep default */ }
      throw new Error(typeof detail === 'string' ? detail : `API ${r.status}`)
    }
    return r.json() as Promise<T>
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`API at ${API} timed out — is the backend running?`)
    }
    if (e instanceof TypeError) {
      throw new Error(`Could not reach the API at ${API} — start it with: uvicorn backend.app.api:app --port 8001`)
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
  calls: () => get<Call[]>('/calls'),
  appointments: () => get<Appt[]>('/appointments'),
  messages: () => get<Message[]>('/messages'),
  slots: () => get<{ available: string[] }>('/slots'),
  analytics: () => get<Stats>('/analytics'),
  demoCall: (turns?: string[]) => post<any>('/call/demo', turns ? { turns } : {}),
  cancelAppointment: (slot: string, patient_name?: string) =>
    post<{ ok: boolean; message: string }>('/call/cancel', { slot, patient_name }),
}
