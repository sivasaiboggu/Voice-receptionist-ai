export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
export function timeAgo(iso?: string) {
  if (!iso) return '—'
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
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
