/** Habits, their local-day checks, and the date maths behind streaks and the 7-day strip. */

export type Habit = { id: string; name: string; createdAt: number }
/** Done dates per habit id, each a local `YYYY-MM-DD` key. */
export type Checks = Record<string, string[]>
/** One cell of the trailing week: done, missed (before today), or still open (today). */
export type DayCell = { key: string; weekday: number; state: 'done' | 'missed' | 'open' }

export const MAX_NAME = 20
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Local calendar day as `YYYY-MM-DD`; built from local parts, so midnight UTC never shifts it. */
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** `days` calendar days after `date`, at local midnight (DST-safe because it counts calendar parts). */
export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

export const newId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

// Stored values are untrusted: anything missing or malformed is dropped instead of trusted.

export function parseHabits(value: unknown): Habit[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const habits: Habit[] = []
  for (const item of value) {
    const saved = item as Partial<Habit> | null
    if (!saved || typeof saved.id !== 'string' || !saved.id || seen.has(saved.id)) continue
    if (typeof saved.name !== 'string') continue
    const name = saved.name.trim().slice(0, MAX_NAME)
    if (!name) continue
    seen.add(saved.id)
    const createdAt = typeof saved.createdAt === 'number' && Number.isFinite(saved.createdAt) ? saved.createdAt : Date.now()
    habits.push({ id: saved.id, name, createdAt })
  }
  return habits
}

/** Only known habits keep their checks; every entry is deduplicated and validated as a date key. */
export function parseChecks(value: unknown, habits: Habit[]): Checks {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const known = new Set(habits.map((habit) => habit.id))
  const checks: Checks = {}
  for (const [id, days] of Object.entries(saved)) {
    if (!known.has(id) || !Array.isArray(days)) continue
    checks[id] = [...new Set(days.filter((day): day is string => typeof day === 'string' && DATE_KEY.test(day)))].sort()
  }
  return checks
}

export const isDone = (checks: Checks, id: string, key: string) => (checks[id] ?? []).includes(key)

export function toggleCheck(checks: Checks, id: string, key: string): Checks {
  const days = checks[id] ?? []
  const next = days.includes(key) ? days.filter((day) => day !== key) : [...days, key].sort()
  return { ...checks, [id]: next }
}

/**
 * Consecutive done days ending today — or ending yesterday while today is still open, so an
 * unfinished today never breaks a streak that is alive.
 */
export function streak(checks: Checks, id: string, now: Date): number {
  const days = new Set(checks[id] ?? [])
  let cursor = days.has(dateKey(now)) ? now : addDays(now, -1)
  let count = 0
  while (days.has(dateKey(cursor))) {
    count += 1
    cursor = addDays(cursor, -1)
  }
  return count
}

/** The seven days ending today, oldest first. Only `today` can still be open. */
export function trail(checks: Checks, id: string, now: Date): DayCell[] {
  const days = new Set(checks[id] ?? [])
  const today = dateKey(now)
  const cells: DayCell[] = []
  for (let back = 6; back >= 0; back -= 1) {
    const date = addDays(now, -back)
    const key = dateKey(date)
    // Undone days before today are missed; today itself is the hollow, still-open cell.
    const state: DayCell['state'] = days.has(key) ? 'done' : key < today ? 'missed' : 'open'
    cells.push({ key, weekday: (date.getDay() + 6) % 7, state })
  }
  return cells
}
