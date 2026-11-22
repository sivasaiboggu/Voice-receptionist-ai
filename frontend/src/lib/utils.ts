export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

/** Short label for an IANA timezone, e.g. "IST" for Asia/Kolkata, "GMT" for UTC.
 *  Falls back to the zone name itself when the browser can't resolve it. */
export function tzAbbreviation(tz?: string | null) {
  if (!tz) return ''
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')
    return part?.value || tz
  } catch {
    return tz
  }
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions, timeZone?: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', { ...options, timeZone }).format(date)
  } catch (error) {
    if (Number.isNaN(date.getTime())) return ''
    if (error instanceof RangeError && timeZone) return formatDate(date, options)
    throw error
  }
}

export function dateKey(date: Date, timeZone?: string) {
  try {
    return date.toLocaleDateString('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch (error) {
    if (error instanceof RangeError && timeZone) return dateKey(date)
    throw error
  }
}

export function clockTime(date: Date, timeZone?: string) {
  return formatDate(date, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }, timeZone)
}

export function callDate(timestamp?: string) {
  if (!timestamp) return null
  const normalized = timestamp.replace(' ', 'T')
  const date = new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized) || normalized.length === 10 ? normalized : `${normalized}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const recordLabels: Record<string, string> = {
  'escalated-emergency': 'Emergency handoff',
  'escalated-human': 'Human handoff',
  'faq-answered': 'Question answered',
  'message-taken': 'Message taken',
}

export function recordLabel(value: string) {
  const words = recordLabels[value] ?? value.replace(/[-_]+/g, ' ')
  return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown'
}
