export type Progress = Record<string, number>
export type Status = 'new' | 'learning' | 'mastered'

/** A word the user added. `meaning` is shown as typed, whatever the UI language. */
export interface CustomWord {
  id: string
  word: string
  meaning: string
  example: string
}

/** One studyable card. Built-in words carry their meaning in the UI language. */
export interface Card {
  word: string
  phonetic: string
  meaning: string
  example: string
  custom: boolean
}

interface StudyCard extends Card {
  /** Times this card was marked "still learning" during the session. */
  misses: number
}

export interface Session {
  queue: StudyCard[]
  total: number
  /** Cards that needed a second look before they stuck. */
  learned: number
  /** Cards shown so far; also remounts the flash card for each new one. */
  turn: number
}

/** Longest value kept for each custom field. */
export const LIMITS = { word: 40, meaning: 120, example: 200 } as const

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clipped = (value: unknown, limit: number) => (typeof value === 'string' ? value.trim().slice(0, limit) : '')

/** Keeps only well-formed entries, so corrupt storage never reaches the UI. */
export function parseProgress(value: unknown): Progress {
  const progress: Progress = {}
  if (record(value)) {
    for (const [word, count] of Object.entries(value)) {
      if (word && typeof count === 'number' && Number.isInteger(count) && count > 0) progress[word] = count
    }
  }
  return progress
}

export function parseCustomWords(value: unknown): CustomWord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown, index: number) => {
    if (!record(item)) return []
    const word = clipped(item.word, LIMITS.word)
    if (!word) return []
    return [
      {
        id: clipped(item.id, 64) || `word-${index}`,
        word,
        meaning: clipped(item.meaning, LIMITS.meaning),
        example: clipped(item.example, LIMITS.example),
      },
    ]
  })
}

/** A word is learning after 1 known mark, mastered after 2. */
export const statusOf = (count: number): Status => (count >= 2 ? 'mastered' : count === 1 ? 'learning' : 'new')

/** Own property only: a word such as "constructor" must never read Object.prototype. */
export const countOf = (counts: Record<string, number>, word: string) =>
  Object.prototype.hasOwnProperty.call(counts, word) ? counts[word] : 0

export const newId = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let last = copy.length - 1; last > 0; last--) {
    const pick = Math.floor(Math.random() * (last + 1))
    const held = copy[last]
    copy[last] = copy[pick]
    copy[pick] = held
  }
  return copy
}

export function newSession(cards: readonly Card[]): Session {
  return { queue: shuffled(cards).map((card) => ({ ...card, misses: 0 })), total: cards.length, learned: 0, turn: 0 }
}

/** Known cards leave the queue; the others return to its end and count as learned once they stick. */
export function advance(session: Session, known: boolean): Session {
  const [card, ...rest] = session.queue
  if (!card) return session
  return {
    queue: known ? rest : [...rest, { ...card, misses: card.misses + 1 }],
    total: session.total,
    learned: session.learned + (known && card.misses > 0 ? 1 : 0),
    turn: session.turn + 1,
  }
}
