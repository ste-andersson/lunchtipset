const TIME_ZONE = 'Europe/Stockholm'

/** YYYY-MM-DD for the given instant, in Stockholm time. */
export function isoDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Days from a to b (b - a), both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
}

/** Monday–Friday of the week containing `date`. */
export function workWeek(date: string): string[] {
  const monday = addDays(date, -weekdayIndex(date))
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
}

/** The lunch day that matters now: today on weekdays, next Monday on weekends. */
export function menuDay(date: string): string {
  const i = weekdayIndex(date)
  return i < 5 ? date : addDays(date, 7 - i)
}

/** The work week whose menus matter now; on weekends that's the coming week. */
export function menuWeek(date: string): string[] {
  return workWeek(menuDay(date))
}

/** The closest earlier weekday. */
export function previousWorkday(date: string): string {
  let d = addDays(date, -1)
  while (weekdayIndex(d) > 4) d = addDays(d, -1)
  return d
}
