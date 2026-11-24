/** Pure state, parsing and date maths for the focus timer. No React, no DOM. */

export type Mode = 'focus' | 'break'
export type Session = { date: string; minutes: number }
/** The session that just ended. The banner offering the next step stays until it is dismissed. */
export type Done = { mode: Mode; minutes: number }
export type Timer = {
  mode: Mode
  /** Full length in minutes of the session on screen. */
  minutes: number
  /** Wall-clock end time while running. The time left is always derived from it. */
  endAt: number | null
  /** Seconds left while idle or paused. */
  left: number
  done: Done | null
}
/** One day of the chart: its local date key, Monday-first weekday and totals. */
export type DayStat = { key: string; weekday: number; minutes: number; sessions: number }

/** Focus lengths in minutes; the default is the second one. */
export const PRESETS = [15, 25, 45, 60] as const
export const DEFAULT_PRESET = PRESETS[1]
export const BREAK_MINUTES = 5
/** How long the Reset button stays armed after the first tap. */
export const CONFIRM_MS = 4000

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isMode = (value: unknown): value is Mode => value === 'focus' || value === 'break'

/** A fresh idle timer for `mode`: a focus session uses `preset` minutes, a break a fixed length. */
export function idleFor(mode: Mode, preset: number, done: Done | null = null): Timer {
  const minutes = mode === 'focus' ? preset : BREAK_MINUTES
  return { mode, minutes, endAt: null, left: minutes * 60, done }
}

// Stored values are untrusted: every field that gets used is checked, and anything missing or
// malformed falls back to the defaults.

export function parseSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return []
  return value.filter((item: unknown): item is Session => {
    const saved = item as Partial<Session> | null
    return !!saved && typeof saved.date === 'string' && DATE_KEY.test(saved.date) && isNum(saved.minutes) && saved.minutes > 0
  })
}

export function parsePreset(value: unknown): number {
  return PRESETS.find((preset) => preset === value) ?? DEFAULT_PRESET
}

export function parseTimer(value: unknown, preset: number): Timer {
  const saved = value as Partial<Timer> | null | undefined
  if (!saved || !isMode(saved.mode) || !isNum(saved.minutes) || saved.minutes <= 0) return idleFor('focus', preset)
  const { mode, minutes } = saved
  if (isNum(saved.endAt)) return { mode, minutes, endAt: saved.endAt, left: minutes * 60, done: null }
  const ended = saved.done as Partial<Done> | null | undefined
  const done = ended && isMode(ended.mode) && isNum(ended.minutes) ? { mode: ended.mode, minutes: ended.minutes } : null
  const left = isNum(saved.left) ? Math.min(Math.max(saved.left, 0), minutes * 60) : minutes * 60
  // An idle timer always shows the length its mode has now, so a stale stored length cannot linger.
  return left < minutes * 60 ? { mode, minutes, endAt: null, left, done: null } : idleFor(mode, preset, done)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD. */
export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/**
 * `days` calendar days after `date`, at local midnight. Built from calendar parts, so a
 * daylight-saving shift cannot skip a day; `addDays(d, 0)` is the midnight that starts `d`.
 */
export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/** The seven days ending today, oldest first, each with its totals. */
export function lastSevenDays(sessions: Session[], now: number): DayStat[] {
  const byKey = new Map<string, DayStat>()
  for (let back = 6; back >= 0; back -= 1) {
    const date = addDays(new Date(now), -back)
    const key = dateKey(date)
    // Monday first, to match the weekday labels.
    byKey.set(key, { key, weekday: (date.getDay() + 6) % 7, minutes: 0, sessions: 0 })
  }
  for (const session of sessions) {
    const day = byKey.get(session.date)
    if (day) {
      day.minutes += session.minutes
      day.sessions += 1
    }
  }
  return [...byKey.values()]
}

/** Consecutive days with a session, counted back from today. */
export function streak(sessions: Session[], now: number): number {
  const active = new Set(sessions.map((session) => session.date))
  const today = new Date(now)
  // A today without a session yet does not break the streak; it ends only once that day is over.
  let cursor = active.has(dateKey(today)) ? today : addDays(today, -1)
  let length = 0
  while (active.has(dateKey(cursor))) {
    length += 1
    cursor = addDays(cursor, -1)
  }
  return length
}

/** m:ss, rounded up so a fresh 25:00 stays 25:00 for a whole second. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** Minutes without trailing zeros: 25, 0.5. */
export const minutesText = (minutes: number) => String(Number(minutes.toFixed(2)))
