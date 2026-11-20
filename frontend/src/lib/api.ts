export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'

export type Call = { id: number; caller: string; summary: string; sentiment: string; urgency: string; outcome: string; escalated: number; started_at?: string }
export type Appt = { id: number; patient_name: string; phone?: string; service: string; slot: string; status: string }
export type Stats = { calls_answered: number; appointments_booked: number; escalations: number; unhandled_messages: number; answer_rate: number }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`)
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json() as Promise<T>
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json() as Promise<T>
}

export const api = {
  calls: () => get<Call[]>('/calls'),
  appointments: () => get<Appt[]>('/appointments'),
  slots: () => get<{ available: string[] }>('/slots'),
  analytics: () => get<Stats>('/analytics'),
  demoCall: () => post<any>('/call/demo'),
}
