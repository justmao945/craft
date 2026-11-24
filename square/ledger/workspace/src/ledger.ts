import { storage } from '@craft/sdk'
import { CATEGORY_IDS } from './categories'
import { locale } from './i18n'

export type EntryType = 'expense' | 'income'

/** One booked line; money is an integer number of cents. */
export interface Entry {
  id: string
  type: EntryType
  amountCents: number
  category: string
  note: string
  date: string // local date, YYYY-MM-DD
}

/** `month` is 1–12. */
export interface Month {
  year: number
  month: number
}

export interface DayGroup {
  date: string
  entries: Entry[]
}

export interface Slice {
  category: string
  cents: number
  share: number // 0–1 of the month's expenses
}

const KEY = 'ledger-entries-v1'
const pad = (n: number) => String(n).padStart(2, '0')
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Drops every malformed record instead of throwing, so bad stored data never crashes the app. */
export function parseEntries(value: unknown): Entry[] {
  const entries: Entry[] = []
  if (!Array.isArray(value)) return entries
  const ids = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const { id, type, amountCents, category, note, date } = record
    if (typeof id !== 'string' || !id || ids.has(id)) continue
    if (type !== 'expense' && type !== 'income') continue
    if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents <= 0) continue
    if (typeof date !== 'string' || !ISO_DATE.test(date)) continue
    ids.add(id)
    entries.push({
      id,
      type,
      amountCents,
      category: typeof category === 'string' && CATEGORY_IDS.includes(category) ? category : 'other',
      note: typeof note === 'string' ? note.slice(0, 30) : '',
      date,
    })
  }
  return entries
}

export async function loadEntries(): Promise<Entry[]> {
  try {
    return parseEntries(await storage.get<unknown>(KEY, []))
  } catch {
    return []
  }
}

export const saveEntries = (entries: Entry[]) => storage.set(KEY, entries)

/** Sortable by creation time: time first, then a per-session counter and a random suffix. */
let counter = 0
export const newId = () =>
  `${Date.now().toString(36).padStart(9, '0')}${(counter++).toString(36).padStart(3, '0')}${Math.random().toString(36).slice(2, 6)}`

/** Cents for a typed amount, or null unless it is above 0 with at most two decimals. */
export function parseAmount(text: string): number | null {
  const match = /^(\d{0,8})(?:\.(\d{1,2}))?$/.exec(text.trim())
  if (!match || (!match[1] && !match[2])) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return cents > 0 ? cents : null
}

/** True while the text could still grow into a valid amount, so no error is shown yet. */
export const isPartialAmount = (text: string) => /^\d{0,8}\.?$/.test(text.trim())

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** `1,234.56` for a non-negative amount of cents; the sign is the caller's. */
export const money = (cents: number) => `${group(String(Math.floor(cents / 100)))}.${pad(cents % 100)}`

export const signedMoney = (cents: number) => `${cents < 0 ? '-' : cents > 0 ? '+' : ''}¥${money(Math.abs(cents))}`

export const monthOf = (date: Date): Month => ({ year: date.getFullYear(), month: date.getMonth() + 1 })

export const todayString = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const shiftMonth = ({ year, month }: Month, delta: number): Month => monthOf(new Date(year, month - 1 + delta, 1))

export const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month

const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })

export const monthLabel = ({ year, month }: Month) => monthName.format(new Date(year, month - 1, 1))

export function dayLabel(iso: string): string {
  const [year, month, date] = iso.split('-').map(Number)
  const local = new Date(year, month - 1, date)
  return `${weekday.format(local)} · ${day.format(local)}`
}

export const inMonth = (entries: Entry[], month: Month) => entries.filter((entry) => entry.date.startsWith(`${month.year}-${pad(month.month)}-`))

/** This month's entries grouped by day, newest first. */
export function groupByDay(entries: Entry[], month: Month): DayGroup[] {
  const groups: DayGroup[] = []
  const sorted = inMonth(entries, month).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  for (const entry of sorted) {
    const last = groups[groups.length - 1]
    if (last?.date === entry.date) last.entries.push(entry)
    else groups.push({ date: entry.date, entries: [entry] })
  }
  return groups
}

export function sum(entries: Entry[]): { expense: number; income: number } {
  let expense = 0
  let income = 0
  for (const entry of entries) {
    if (entry.type === 'expense') expense += entry.amountCents
    else income += entry.amountCents
  }
  return { expense, income }
}

/** Expense totals per category, largest first. */
export function breakdown(entries: Entry[]): Slice[] {
  const sums = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type === 'expense') sums.set(entry.category, (sums.get(entry.category) ?? 0) + entry.amountCents)
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0)
  return [...sums]
    .map(([category, cents]) => ({ category, cents, share: total ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents)
}
