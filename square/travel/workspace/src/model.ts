import { storage } from '@craft/sdk'

export interface Trip {
  id: string
  title: string
  destination: string
  /** Local calendar dates, `YYYY-MM-DD`; `end` is null while the return is open. */
  start: string
  end: string | null
  createdAt: string
}

export interface Entry {
  id: string
  tripId: string
  /** Local wall-clock time of writing, `YYYY-MM-DDTHH:mm`: stays what the clock said, even after a flight. */
  date: string
  place: string
  /** Emoji of the picked mood; null when skipped. */
  mood: string | null
  text: string
}

export type TripInput = Pick<Trip, 'title' | 'destination' | 'start' | 'end'>
export type EntryInput = Pick<Entry, 'place' | 'mood' | 'text'>

export type TripStatus =
  | { kind: 'ongoing'; day: number }
  | { kind: 'upcoming'; inDays: number }
  | { kind: 'ended'; days: number }

/* ---------- storage: versioned keys, defensive reads ---------- */

const KEYS = { trips: 'travel.trips.v1', entries: 'travel.entries.v1' }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export const isDay = (value: unknown): value is string => typeof value === 'string' && DAY.test(value)

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** One stored trip, or null when its shape is unusable; an end before the start reads as open-ended. */
function readTrip(record: Record<string, unknown>): Trip | null {
  const { id, start, end } = record
  if (typeof id !== 'string' || !isDay(start)) return null
  return {
    id,
    start,
    end: isDay(end) && end >= start ? end : null,
    title: text(record.title),
    destination: text(record.destination),
    createdAt: text(record.createdAt),
  }
}

function readEntry(record: Record<string, unknown>): Entry | null {
  const { id, tripId, date } = record
  if (typeof id !== 'string' || typeof tripId !== 'string' || typeof date !== 'string' || !STAMP.test(date)) return null
  return {
    id,
    tripId,
    date,
    place: text(record.place),
    mood: text(record.mood) || null,
    text: text(record.text),
  }
}

/** The stored collection with only the records `read` accepts; a missing key, corrupt JSON or failing storage reads as empty. */
async function readCollection<T>(key: string, read: (record: Record<string, unknown>) => T | null): Promise<T[]> {
  let stored: unknown
  try {
    stored = await storage.get<unknown>(key, null)
  } catch {
    return []
  }
  if (!Array.isArray(stored)) return []
  return stored.flatMap((item): T[] => {
    const parsed = typeof item === 'object' && item !== null ? read(item as Record<string, unknown>) : null
    return parsed ? [parsed] : []
  })
}

export async function loadTrips(): Promise<Trip[]> {
  return readCollection(KEYS.trips, readTrip)
}

export async function loadEntries(): Promise<Entry[]> {
  return readCollection(KEYS.entries, readEntry)
}

/** Persists a whole collection; a failed write leaves the in-memory state usable and the next change retries. */
export function saveTrips(trips: Trip[]): void {
  storage.set(KEYS.trips, trips).catch(() => undefined)
}

export function saveEntries(entries: Entry[]): void {
  storage.set(KEYS.entries, entries).catch(() => undefined)
}

/* ---------- calendar maths ---------- */

const pad = (value: number) => String(value).padStart(2, '0')

/** Now as local wall-clock time, `YYYY-MM-DDTHH:mm`; its first ten characters are the day. */
export function stamp(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/** Today as a local day, `YYYY-MM-DD`; ISO day strings order and compare as plain strings. */
export const today = (): string => stamp().slice(0, 10)

/** Local midnight of a `YYYY-MM-DD` day. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)

export const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** Where today sits in a trip: it is ongoing from the start date until the end date, or forever when open. */
export function tripStatus(trip: Trip, todayKey: string): TripStatus {
  if (todayKey < trip.start) return { kind: 'upcoming', inDays: daysBetween(todayKey, trip.start) }
  if (trip.end === null || todayKey <= trip.end) return { kind: 'ongoing', day: daysBetween(trip.start, todayKey) + 1 }
  return { kind: 'ended', days: daysBetween(trip.start, trip.end) + 1 }
}

/** Entries per local day, newest day first and newest entry first inside each day. */
export function byDay(entries: Entry[]): [day: string, entries: Entry[]][] {
  const days: [day: string, entries: Entry[]][] = []
  for (const entry of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
    const day = entry.date.slice(0, 10)
    const last = days[days.length - 1]
    if (last?.[0] === day) last[1].push(entry)
    else days.push([day, [entry]])
  }
  return days
}

/** Cover colour of a trip: the accent hue (#7c5cd6) rotated by an FNV-1a hash of its title. */
export function coverHue(title: string): number {
  let hash = 2166136261
  for (const char of title) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619)
  return (256 + (hash >>> 0)) % 360
}
