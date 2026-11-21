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
