import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { storage } from '@craft/sdk'
import {
  CONFIRM_MS,
  DEFAULT_PRESET,
  PRESETS,
  clock,
  dateKey,
  idleFor,
  lastSevenDays,
  minutesText,
  parsePreset,
  parseSessions,
  parseTimer,
  streak,
} from './logic'
import type { DayStat, Mode, Session, Timer } from './logic'
import { WEEKDAYS, detectLanguage, t } from './strings'
import './styles.css'

const lang = detectLanguage()
const MODES: Mode[] = ['focus', 'break']
const CIRCUMFERENCE = 2 * Math.PI * 45

const ICONS = {
  timer: (
    <>
      <path d="M10 2h4" />
      <circle cx="12" cy="14" r="8" />
      <path d="m12 14 3-3" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
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

/** Circular progress: the elapsed share of the session, with the time left in the middle. */
function Ring({ progress, time, caption, warning }: { progress: number; time: string; caption: string; warning: boolean }) {
  const share = Math.min(Math.max(progress, 0), 1)
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ring-track" cx="50" cy="50" r="45" />
        <circle
          className={share > 0 ? 'ring-fill' : 'ring-fill is-empty'}
          cx="50"
          cy="50"
          r="45"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - share)}
        />
      </svg>
      <div className="ring-center">
        <div className="time" data-testid="focus-time">{time}</div>
        <div className={warning ? 'caption is-warning' : 'caption'} aria-live="polite">
          {caption}
        </div>
      </div>
    </div>
  )
}

function Stats({ days, run, today }: { days: DayStat[]; run: number; today: string }) {
  const names = WEEKDAYS[lang]
  const most = Math.max(1, ...days.map((day) => day.minutes))
  const total = days.reduce((sum, day) => ({ sessions: sum.sessions + day.sessions, minutes: sum.minutes + day.minutes }), { sessions: 0, minutes: 0 })
  return (
    <section className="card stats" data-testid="focus-stats">
      <div className="stats-head">
        <h2>{t(lang, 'stats')}</h2>
        <span className={run > 0 ? 'streak' : 'streak is-zero'} data-testid="focus-streak">
          {run > 0 && <Icon name="flame" />}
          {t(lang, 'streak', { n: run })}
        </span>
      </div>
      <div
        className="chart"
        role="img"
        aria-label={[t(lang, 'chartLabel'), ...days.map((day) => `${names.long[day.weekday]} ${minutesText(day.minutes)}`)].join(', ')}
      >
        {days.map((day) => (
          <div key={day.key} className={day.key === today ? 'day is-today' : 'day'} data-testid={`focus-day-${day.key}`}>
            <span className="day-value">{day.minutes > 0 ? minutesText(day.minutes) : ''}</span>
            <div className="day-slot">
              {day.minutes > 0 ? <div className="day-bar" style={{ height: `${(day.minutes / most) * 100}%` }} /> : <div className="day-zero" />}
            </div>
            <span className="day-name">{names.short[day.weekday]}</span>
          </div>
        ))}
      </div>
      <p className="stats-foot">
        {total.sessions === 0
          ? t(lang, 'statsEmpty')
          : t(lang, 'statsTotal', {
              sessions: t(lang, total.sessions === 1 ? 'sessionOne' : 'sessionMany', { n: total.sessions }),
              minutes: minutesText(total.minutes),
            })}
      </p>
    </section>
  )
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [preset, setPreset] = useState<number>(DEFAULT_PRESET)
  const [timer, setTimer] = useState<Timer>(() => idleFor('focus', DEFAULT_PRESET))
  const [now, setNow] = useState(Date.now)
  const [loaded, setLoaded] = useState(false)
  const [confirmUntil, setConfirmUntil] = useState(0)

  const todayKey = dateKey(new Date(now))
  // Both only depend on the calendar day, so ticks within a day reuse the memo.
  const week = useMemo(() => ({ days: lastSevenDays(sessions, now), run: streak(sessions, now) }), [sessions, todayKey])
  const duration = timer.minutes * 60
  const running = timer.endAt !== null
  const paused = !running && timer.left < duration
  const locked = running || paused
  const confirming = running && now < confirmUntil
  const remaining = timer.endAt === null ? timer.left : Math.max(0, (timer.endAt - now) / 1000)
  const today = week.days[week.days.length - 1]

  // Load once. Missing, corrupt or unreadable data leaves the defaults in place.
  useEffect(() => {
    let active = true
    Promise.all([storage.get<unknown>('sessions', null), storage.get<unknown>('preset', null), storage.get<unknown>('timer', null)]).then(
      ([savedSessions, savedPreset, savedTimer]) => {
        if (!active) return
        const restored = parsePreset(savedPreset)
        setSessions(parseSessions(savedSessions))
        setPreset(restored)
        setTimer(parseTimer(savedTimer, restored))
        setNow(Date.now())
        setLoaded(true)
      },
    )
    return () => {
      active = false
    }
  }, [])

  // Write every change back; nothing is written before the stored values are in.
  useEffect(() => {
    if (loaded) void storage.set('sessions', sessions)
  }, [loaded, sessions])
  useEffect(() => {
    if (loaded) void storage.set('preset', preset)
  }, [loaded, preset])
  useEffect(() => {
    if (loaded) void storage.set('timer', timer)
  }, [loaded, timer])

  // The clock only needs to advance while a session runs. A hidden page catches up as soon as
  // it is visible again, and one wakeup at midnight keeps "today" honest.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const midnight = new Date()
    midnight.setHours(24, 0, 0, 0)
    const interval = running ? setInterval(tick, 250) : undefined
    const rollover = setTimeout(tick, midnight.getTime() - Date.now())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      clearTimeout(rollover)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [running, todayKey])

  const complete = useCallback(
    (mode: Mode, minutes: number, endedAt: number) => {
      if (mode === 'focus') setSessions((list) => [...list, { date: dateKey(new Date(endedAt)), minutes }])
      setTimer(idleFor(mode === 'focus' ? 'break' : 'focus', preset, { mode, minutes }))
    },
    [preset],
  )

  // Completion is derived from the end time, so it is caught even if the page slept through it.
  useEffect(() => {
    if (loaded && timer.endAt !== null && timer.endAt <= now) complete(timer.mode, timer.minutes, timer.endAt)
  }, [loaded, timer, now, complete])

  const toggle = () => {
    if (!loaded) return
    const at = Date.now()
    if (timer.endAt === null) {
      setNow(at)
      setTimer({ ...timer, done: null, endAt: at + timer.left * 1000 })
    } else if (timer.endAt <= at) {
      complete(timer.mode, timer.minutes, timer.endAt)
    } else {
      setTimer({ ...timer, endAt: null, left: (timer.endAt - at) / 1000 })
    }
  }

  const reset = () => {
    if (!loaded) return
    if (running && !confirming) {
      // Discarding a live session must be deliberate: the first tap only arms the button.
      setConfirmUntil(Date.now() + CONFIRM_MS)
      return
    }
    setConfirmUntil(0)
    // From the completion banner, Reset means "skip the offered break" or "not yet".
    setTimer(idleFor(timer.done ? 'focus' : timer.mode, preset))
  }

  const selectPreset = (minutes: number) => {
    if (loaded && !locked) {
      setPreset(minutes)
      setTimer(idleFor('focus', minutes))
    }
  }

  const selectMode = (mode: Mode) => {
    if (loaded && !locked) setTimer(idleFor(mode, preset))
  }

  const focusDone = timer.done?.mode === 'focus'
  const startLabel = running
    ? t(lang, 'pause')
    : paused
      ? t(lang, 'resume')
      : timer.done
        ? t(lang, focusDone ? 'startBreak' : 'startFocus')
        : t(lang, 'start')
  const resetLabel = confirming ? t(lang, 'confirmReset') : timer.done ? t(lang, focusDone ? 'skip' : 'later') : t(lang, 'reset')
  const caption = confirming
    ? t(lang, 'confirmHint')
    : running
      ? t(lang, timer.mode === 'focus' ? 'focusing' : 'breaking')
      : paused
        ? t(lang, 'paused')
        : t(lang, timer.mode === 'focus' ? 'readyFocus' : 'readyBreak')

  return (
    <div className={loaded ? 'app' : 'app is-loading'}>
      <header className="header">
        <span className="mark">
          <Icon name="timer" />
        </span>
        <div>
          <h1>{t(lang, 'title')}</h1>
          <p className="today" data-testid="focus-today">
            {t(lang, 'today', {
              sessions: t(lang, today.sessions === 1 ? 'sessionOne' : 'sessionMany', { n: today.sessions }),
              minutes: minutesText(today.minutes),
            })}
          </p>
        </div>
      </header>

      <section className="card timer-card">
        <div className="seg" role="group" aria-label={t(lang, 'modeLabel')}>
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`focus-mode-${mode}`}
              aria-pressed={timer.mode === mode}
              disabled={locked}
              onClick={() => selectMode(mode)}
            >
              {t(lang, mode)}
            </button>
          ))}
        </div>

        <Ring progress={1 - remaining / duration} time={clock(remaining)} caption={caption} warning={confirming} />

        <div className="slot">
          {timer.done ? (
            <div className="done" role="status" data-testid="focus-done">
              <span className="done-icon">
                <Icon name={focusDone ? 'check' : 'sun'} />
              </span>
              <div>
                <div className="done-title">{t(lang, focusDone ? 'focusDone' : 'breakDone')}</div>
                <div className="done-body">{t(lang, focusDone ? 'focusDoneBody' : 'breakDoneBody', { minutes: minutesText(timer.done.minutes) })}</div>
              </div>
            </div>
          ) : (
            <div className="presets">
              <div className="label">{t(lang, timer.mode === 'focus' ? 'focusLength' : 'nextFocus')}</div>
              <div className="chips">
                {PRESETS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className="chip"
                    data-testid={`focus-preset-${minutes}`}
                    aria-pressed={preset === minutes}
                    disabled={locked}
                    onClick={() => selectPreset(minutes)}
                  >
                    {minutes}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="actions">
          <button type="button" className="primary" data-testid="focus-start" onClick={toggle}>
            <Icon name={running ? 'pause' : 'play'} />
            {startLabel}
          </button>
          <button
            type="button"
            className={confirming ? 'secondary is-danger' : 'secondary'}
            data-testid="focus-reset"
            disabled={!running && !paused && !timer.done}
            onClick={reset}
          >
            {resetLabel}
          </button>
        </div>
      </section>

      <Stats days={week.days} run={week.run} today={todayKey} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
