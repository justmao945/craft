import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { storage } from '@craft/sdk'
import {
  BOTTLE_ML,
  CUP_ML,
  GOALS,
  HALF_ML,
  MAX_GOAL,
  STORAGE_KEY,
  WEEKDAY_INITIALS,
  fmt,
  formatToday,
  lastSevenDays,
  parseSaved,
  stamp,
  streak,
  todayEntries,
} from './logic'
import type { DayStat, Saved } from './logic'
import { STRINGS, detectLanguage, fill } from './strings'
import './styles.css'

const lang = detectLanguage()
const s = STRINGS[lang]
const AXIS = WEEKDAY_INITIALS[lang]

const ICONS = {
  drop: <path d="M12 3.2c3.2 3.6 5.5 6.4 5.5 9.2a5.5 5.5 0 0 1-11 0c0-2.8 2.3-5.6 5.5-9.2z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7" />
      <path d="m6 7 .9 12.5h10.2L18 7M10 11v5M14 11v5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  flame: (
    <path d="M12 22a6 6 0 0 1-6-6c0-2.2 1.1-3.7 2.3-5 .3 1.3 1 2.2 1.9 2.7-.6-3.2.6-6 3.3-8.7 0 2.6 1.3 4.2 2.6 5.7 1.2 1.4 1.9 2.7 1.9 5.3a6 6 0 0 1-6 6z" />
  ),
}
type IconName = keyof typeof ICONS

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

function Header({ now }: { now: Date }) {
  return (
    <header className="head">
      <div>
        <h1>{s.title}</h1>
        <p className="date">{formatToday(now, lang)}</p>
      </div>
      <span className="drop" aria-hidden="true">
        <Icon name="drop" />
      </span>
    </header>
  )
}

function TodayCard({ total, goal }: { total: number; goal: number }) {
  const percent = Math.round((total / goal) * 100)
  const left = Math.max(goal - total, 0)
  return (
    <section className="card today">
      <div className="card-head">
        <h2>{s.today}</h2>
        <span className="pct">{percent}%</span>
      </div>
      <p className="amount" key={total} aria-live="polite">
        <span className="amount-now">{fmt(total)}</span>
        <span className="amount-goal"> / {fmt(goal)} ml</span>
      </p>
      <div
        className="bar"
        role="progressbar"
        aria-label={s.progressAria}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(total, goal)}
        aria-valuetext={`${fmt(total)} / ${fmt(goal)} ml`}
      >
        <div className="bar-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <div className="today-foot">
        {total >= goal ? (
          <>
            <span className="badge">
              <Icon name="check" />
              {s.goalReached}
            </span>
            {total > goal && <span className="remaining">{fill(s.over, { ml: fmt(total - goal) })}</span>}
          </>
        ) : (
          <span className="remaining">{fill(s.remaining, { ml: fmt(left) })}</span>
        )}
      </div>
    </section>
  )
}

function History({ days, goal, streakDays, weekTotal }: { days: DayStat[]; goal: number; streakDays: number; weekTotal: number }) {
  const scale = Math.max(MAX_GOAL, goal, ...days.map((day) => day.total)) * 1.08
  return (
    <section className="card">
      <div className="card-head">
        <h2>{s.historyTitle}</h2>
        <span className="streak">
          <Icon name="flame" />
          {streakDays > 0 ? fill(s.streak, { n: streakDays }) : s.noStreak}
        </span>
      </div>
      <div
        className="chart"
        data-testid="water-chart"
        role="img"
        aria-label={fill(s.chartAria, { goal: fmt(goal) })}
      >
        <div className="plot">
          <div className="goal-line" style={{ bottom: `${(goal / scale) * 100}%` }}>
            <span>{fill(s.goalLabel, { goal: fmt(goal) })}</span>
          </div>
          {days.map((day) => (
            <div className="col" key={day.key}>
              {day.total > 0 && (
                <div
                  className={`chart-bar${day.isToday ? ' today' : ''}`}
                  style={{ height: `${Math.max((day.total / scale) * 100, 3)}%` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="axis" aria-hidden="true">
          {days.map((day) => (
            <span key={day.key} className={day.isToday ? 'today' : undefined}>
              {AXIS[day.weekday]}
            </span>
          ))}
        </div>
      </div>
      <p className="chart-foot">{fill(s.weekTotal, { ml: fmt(weekTotal) })}</p>
    </section>
  )
}

function App() {
  const [data, setData] = useState<Saved | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const now = new Date()

  useEffect(() => {
    let live = true
    storage
      .get<unknown>(STORAGE_KEY, null)
      .then((value) => {
        if (live) setData(parseSaved(value))
      })
      .catch(() => {
        if (live) setData(parseSaved(null))
      })
    return () => {
      live = false
    }
  }, [])

  if (!data)
    return (
      <div className="app">
        <Header now={now} />
        <p className="loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {s.loading}
        </p>
      </div>
    )

  const save = (next: Saved) => {
    setData(next)
    void storage.set(STORAGE_KEY, next).catch(() => undefined)
  }

  const add = (ml: number) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    save({ ...data, entries: [...data.entries, { id, ml, at: stamp(new Date()) }] })
  }

  const remove = (id: string) => {
    setConfirmId(null)
    save({ ...data, entries: data.entries.filter((entry) => entry.id !== id) })
  }

  const entries = todayEntries(data.entries, now)
  const todayTotal = entries.reduce((sum, entry) => sum + entry.ml, 0)
  const week = lastSevenDays(data.entries, now)
  const weekTotal = week.reduce((sum, day) => sum + day.total, 0)

  return (
    <div className="app">
      <Header now={now} />
      <main>
        <TodayCard total={todayTotal} goal={data.goalMl} />

        <section className="card">
          <button className="primary" data-testid="water-add-cup" onClick={() => add(CUP_ML)}>
            <Icon name="drop" />
            <span>{s.addCup}</span>
            <span className="primary-size">+{CUP_ML} ml</span>
          </button>
          <div className="sizes">
            <button className="size" data-testid="water-add-half" onClick={() => add(HALF_ML)}>
              <span>{s.half}</span>
              <b>{HALF_ML} ml</b>
            </button>
            <button className="size" data-testid="water-add-cup-chip" onClick={() => add(CUP_ML)}>
              <span>{s.oneCup}</span>
              <b>{CUP_ML} ml</b>
            </button>
            <button className="size" data-testid="water-add-bottle" onClick={() => add(BOTTLE_ML)}>
              <span>{s.bottle}</span>
              <b>{BOTTLE_ML} ml</b>
            </button>
          </div>
        </section>

        <section className="card">
          <h2>{s.goalTitle}</h2>
          <div className="goals">
            {GOALS.map((ml) => (
              <button
                key={ml}
                className={`goal${ml === data.goalMl ? ' active' : ''}`}
                data-testid={`water-goal-${ml}`}
                aria-pressed={ml === data.goalMl}
                aria-label={fill(s.goalAria, { ml })}
                onClick={() => save({ ...data, goalMl: ml })}
              >
                {ml} ml
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>{s.entriesTitle}</h2>
            {entries.length > 0 && <span className="head-note">{fmt(todayTotal)} ml</span>}
          </div>
          {entries.length === 0 ? (
            <div className="empty">
              <Icon name="drop" />
              <p>{s.emptyTitle}</p>
              <span>{s.emptyHint}</span>
            </div>
          ) : (
            <ul className="entries">
              {entries.map((entry) => {
                const time = entry.at.slice(11, 16)
                const confirming = confirmId === entry.id
                return (
                  <li key={entry.id} className="entry" data-testid="water-entry">
                    <div className="entry-main">
                      <time className="entry-time" dateTime={entry.at}>
                        {time}
                      </time>
                      <span className="entry-ml">{fmt(entry.ml)} ml</span>
                      {!confirming && (
                        <button
                          className="icon-btn"
                          data-testid="water-delete"
                          aria-label={fill(s.deleteAria, { time })}
                          onClick={() => setConfirmId(entry.id)}
                        >
                          <Icon name="trash" />
                        </button>
                      )}
                    </div>
                    {confirming && (
                      <div className="confirm">
                        <p>{s.deletePrompt}</p>
                        <div className="confirm-actions">
                          <button
                            className="ghost"
                            data-testid="water-cancel-delete"
                            onClick={() => setConfirmId(null)}
                          >
                            {s.cancelDelete}
                          </button>
                          <button
                            className="danger"
                            data-testid="water-confirm-delete"
                            onClick={() => remove(entry.id)}
                          >
                            {s.confirmDelete}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <History days={week} goal={data.goalMl} streakDays={streak(data.entries, data.goalMl, now)} weekTotal={weekTotal} />
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
