/* Shared date/time formatting helpers (Thai Buddhist calendar). */

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO timestamp → "dd/mm/พ.ศ. HH:MM" (e.g. 26/06/2569 14:30). */
export function fmtThaiDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ISO timestamp → "dd/mm/พ.ศ. HH:MM:SS" (with seconds). */
export function fmtThaiDateTimeSec(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Current Thai Buddhist year (พ.ศ.) from today's date — for period pickers. */
export function currentBuddhistYear(): number {
  return new Date().getFullYear() + 543
}

/** Current month number (1–12) from today's date — for period pickers. */
export function currentMonth(): number {
  return new Date().getMonth() + 1
}
