import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { storage } from '@craft/sdk'
import { MAX_NAME, dateKey, isDone, newId, parseChecks, parseHabits, streak, toggleCheck, trail } from './habit'
import type { Checks, DayCell, Habit } from './habit'
import { WEEKDAYS, WEEKDAY_INITIALS, detectLanguage, formatDate, t } from './i18n'
import './styles.css'

const lang = detectLanguage()
const HABITS_KEY = 'habits.v1'
const CHECKS_KEY = 'checks.v1'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const icons = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
}

function HabitCard(props: {
  habit: Habit
  cells: DayCell[]
  streakDays: number
  done: boolean
  confirming: boolean
  onToggle: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const { habit, cells, streakDays, done, confirming } = props
  return (
    <li className="card habit" data-testid="habit-card">
      <div className="habit-head">
        <div className="habit-main">
          <h2 className="habit-name">{habit.name}</h2>
          <div className="habit-meta">
            <span className={streakDays > 0 ? 'pill' : 'pill is-zero'} data-testid="habit-streak">
              {t(lang, 'streak', { n: streakDays })}
            </span>
            <span className="week-count" data-testid="habit-week">
              {t(lang, 'week', { n: cells.filter((cell) => cell.state === 'done').length })}
            </span>
          </div>
        </div>
        <div className="habit-actions">
          <button
            type="button"
            className={confirming ? 'icon-btn is-armed' : 'icon-btn'}
            data-testid="habit-delete"
            aria-label={t(lang, 'deleteHabit', { name: habit.name })}
            onClick={props.onAskDelete}
          >
            <Icon>{icons.trash}</Icon>
          </button>
          <button
            type="button"
            className={done ? 'check is-done' : 'check'}
            data-testid="habit-check"
            aria-pressed={done}
            aria-label={t(lang, done ? 'markOpen' : 'markDone', { name: habit.name })}
            onClick={props.onToggle}
          >
            {done && <Icon>{icons.check}</Icon>}
          </button>
        </div>
      </div>
      <div className="week" role="group" aria-label={t(lang, 'strip')}>
        {cells.map((cell, index) => {
          const day = WEEKDAYS[lang][cell.weekday]
          const label = t(lang, cell.state === 'done' ? 'dayDone' : cell.state === 'missed' ? 'dayMissed' : 'dayOpen', { day })
          return (
            <div className={index === cells.length - 1 ? 'day is-today' : 'day'} key={cell.key} role="img" aria-label={label}>
              <span className={`dot is-${cell.state}`} />
              <span className="dow" aria-hidden="true">
                {WEEKDAY_INITIALS[lang][cell.weekday]}
              </span>
            </div>
          )
        })}
      </div>
      {confirming && (
        <div className="confirm">
          <p className="confirm-text">{t(lang, 'confirmDelete', { name: habit.name })}</p>
          <div className="confirm-actions">
            <button type="button" className="ghost" data-testid="habit-cancel-delete" onClick={props.onCancelDelete}>
              {t(lang, 'cancel')}
            </button>
            <button type="button" className="danger-btn" data-testid="habit-confirm-delete" onClick={props.onConfirmDelete}>
              {t(lang, 'confirm')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function App() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [checks, setChecks] = useState<Checks>({})
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let alive = true
    Promise.all([storage.get<unknown>(HABITS_KEY, null), storage.get<unknown>(CHECKS_KEY, null)])
      .then(([storedHabits, storedChecks]) => {
        if (!alive) return
        const loaded = parseHabits(storedHabits)
        setHabits(loaded)
        setChecks(parseChecks(storedChecks, loaded))
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (ready) storage.set(HABITS_KEY, habits).catch(() => undefined)
  }, [habits, ready])

  useEffect(() => {
    if (ready) storage.set(CHECKS_KEY, checks).catch(() => undefined)
  }, [checks, ready])

  // Re-read the clock every minute so the date, the open day and the counts roll over past midnight.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const today = dateKey(now)
  const trimmed = draft.trim()
  const duplicate = trimmed.length > 0 && habits.some((habit) => habit.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
  const canAdd = trimmed.length > 0 && !duplicate
  const doneToday = habits.filter((habit) => isDone(checks, habit.id, today)).length
  const share = habits.length > 0 ? (doneToday / habits.length) * 100 : 0

  function addHabit(event: FormEvent) {
    event.preventDefault()
    if (!canAdd) return
    setHabits((current) => [...current, { id: newId(), name: trimmed, createdAt: Date.now() }])
    setDraft('')
  }

  function removeHabit(id: string) {
    setHabits((current) => current.filter((habit) => habit.id !== id))
    setChecks((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setConfirmingId(null)
  }

  return (
    <main className="app">
      <header className="head">
        <h1>{t(lang, 'title')}</h1>
        <p className="date">{formatDate(lang, now)}</p>
        <p className="today">
          <span data-testid="habit-today">{t(lang, 'today', { done: doneToday, total: habits.length })}</span>
          <span className="today-share" aria-hidden="true">
            {Math.round(share)}%
          </span>
        </p>
        <div
          className="track"
          data-testid="habit-progress"
          role="progressbar"
          aria-label={t(lang, 'progress')}
          aria-valuemin={0}
          aria-valuemax={Math.max(habits.length, 1)}
          aria-valuenow={doneToday}
        >
          <div className="track-fill" style={{ width: `${share}%` }} />
        </div>
      </header>

      <form className="card add" onSubmit={addHabit}>
        <div className="add-row">
          <input
            className="input"
            data-testid="habit-add-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_NAME}
            placeholder={t(lang, 'placeholder')}
            aria-label={t(lang, 'nameLabel')}
            autoComplete="off"
            enterKeyHint="done"
          />
          <button type="submit" className="add-btn" data-testid="habit-add" disabled={!canAdd}>
            <Icon>{icons.plus}</Icon>
            {t(lang, 'add')}
          </button>
        </div>
        <div className="add-foot">
          <span className={duplicate ? 'note is-warning' : 'note'} role="status">
            {duplicate ? t(lang, 'duplicate') : ''}
          </span>
          <span className="counter" data-testid="habit-counter">
            {draft.length}/{MAX_NAME}
          </span>
        </div>
      </form>

      {!ready ? (
        <p className="loading" data-testid="habit-loading">
          {t(lang, 'loading')}
        </p>
      ) : habits.length === 0 ? (
        <div className="card empty" data-testid="habit-empty">
          <span className="empty-icon">
            <Icon>{icons.calendar}</Icon>
          </span>
          <p className="empty-title">{t(lang, 'emptyTitle')}</p>
          <p className="empty-hint">{t(lang, 'emptyHint')}</p>
        </div>
      ) : (
        <ul className="list">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              cells={trail(checks, habit.id, now)}
              streakDays={streak(checks, habit.id, now)}
              done={isDone(checks, habit.id, today)}
              confirming={confirmingId === habit.id}
              onToggle={() => setChecks((current) => toggleCheck(current, habit.id, today))}
              onAskDelete={() => setConfirmingId((current) => (current === habit.id ? null : habit.id))}
              onCancelDelete={() => setConfirmingId(null)}
              onConfirmDelete={() => removeHabit(habit.id)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
