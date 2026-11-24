/** Pure water-tracker state: local dates, stored-data parsing, totals, chart and streak maths. */

import type { Lang } from './strings'

export type Entry = { id: string; ml: number; at: string }
export type Saved = { goalMl: number; entries: Entry[] }
/** One column of the seven-day chart. */
export type DayStat = { key: string; weekday: number; total: number; isToday: boolean }

/** Goal choices in ml; the second one is the default. */
export const GOALS = [1500, 2000, 2500, 3000] as const
export const MAX_GOAL = GOALS[GOALS.length - 1]
export const DEFAULT_GOAL = GOALS[1]
export const HALF_ML = 125
export const CUP_ML = 250
export const BOTTLE_ML = 500
/** Versioned storage key: a future format can ship alongside this one. */
export const STORAGE_KEY = 'water.v1'

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD. */
export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Local date + time as YYYY-MM-DDTHH:mm:ss, with no timezone suffix so it reads back as local time. */
export const stamp = (date: Date) =>
  `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/** Thousands separators, independent of the UI language. */
export const fmt = (ml: number) => Math.round(ml).toLocaleString('en-US')

// Stored values are untrusted: every field is checked and anything malformed is dropped, so a
// corrupt or partial value can only ever yield an empty log with a sane goal.
export function parseSaved(value: unknown): Saved {
  const saved = value as Partial<Saved> | null | undefined
  if (!saved || typeof saved !== 'object') return { goalMl: DEFAULT_GOAL, entries: [] }
  const goalMl =
    isNum(saved.goalMl) && saved.goalMl >= 100 && saved.goalMl <= 20000 ? Math.round(saved.goalMl) : DEFAULT_GOAL
  const entries: Entry[] = []
  const ids = new Set<string>()
  if (Array.isArray(saved.entries)) {
    for (const item of saved.entries as unknown[]) {
      const entry = item as Partial<Entry> | null | undefined
      if (!entry || typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) continue
      if (!isNum(entry.ml) || entry.ml <= 0 || entry.ml > 10000) continue
      if (typeof entry.at !== 'string' || !STAMP.test(entry.at)) continue
      const when = new Date(entry.at)
      if (Number.isNaN(when.getTime()) || stamp(when) !== entry.at) continue
      ids.add(entry.id)
      entries.push({ id: entry.id, ml: Math.round(entry.ml), at: entry.at })
    }
  }
  return { goalMl, entries }
}

/** Today's entries, newest first. */
export function todayEntries(entries: Entry[], now: Date): Entry[] {
  const key = dateKey(now)
  return entries.filter((entry) => entry.at.slice(0, 10) === key).sort((a, b) => b.at.localeCompare(a.at))
}

export function dayTotal(entries: Entry[], key: string): number {
  return entries.reduce((sum, entry) => (entry.at.slice(0, 10) === key ? sum + entry.ml : sum), 0)
}

/** The seven days ending today, oldest first. */
export function lastSevenDays(entries: Entry[], now: Date): DayStat[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(now, index - 6)
    const key = dateKey(date)
    return { key, weekday: date.getDay(), total: dayTotal(entries, key), isToday: index === 6 }
  })
}

/** Consecutive days that reached the goal. An unfinished today looks back to yesterday first. */
export function streak(entries: Entry[], goalMl: number, now: Date): number {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    const key = entry.at.slice(0, 10)
    totals.set(key, (totals.get(key) ?? 0) + entry.ml)
  }
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if ((totals.get(dateKey(cursor)) ?? 0) < goalMl) cursor = addDays(cursor, -1)
  let count = 0
  while ((totals.get(dateKey(cursor)) ?? 0) >= goalMl && count < 3650) {
    count += 1
    cursor = addDays(cursor, -1)
  }
  return count
}

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Header date: 11月25日 · 周三 / Wed, Nov 25. */
export function formatToday(date: Date, lang: Lang): string {
  const weekday = date.getDay()
  return lang === 'zh'
    ? `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAY_ZH[weekday]}`
    : `${WEEKDAY_EN[weekday]}, ${MONTH_EN[date.getMonth()]} ${date.getDate()}`
}

export const WEEKDAY_INITIALS: Record<Lang, string[]> = {
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
}
