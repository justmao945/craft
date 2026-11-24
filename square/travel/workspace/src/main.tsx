import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, FormEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MOODS, dayLabel, moodName, rangeLabel, t, weekday } from './i18n'
import { byDay, coverHue, daysBetween, isDay, loadEntries, loadTrips, newId, saveEntries, saveTrips, stamp, today, tripStatus } from './model'
import type { Entry, EntryInput, Trip, TripInput, TripStatus } from './model'
import './styles.css'

/* ---------- icons: 20px, stroke 1.8, round caps ---------- */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const Pin = () => (
  <Icon>
    <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
)

const Calendar = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
)

/* ---------- hooks ---------- */

/** Scrolls the freshly created record (the element with id `travel-fresh`) into view. */
function useReveal(freshId: string | null): void {
  useEffect(() => {
    if (freshId) document.getElementById('travel-fresh')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [freshId])
}

/** Publishes the height the on-screen keyboard covers as `--keyboard` (0 where the viewport already shrinks), so inputs can scroll clear of it. */
function useKeyboardInset(): void {
  useEffect(() => {
    const sync = () => {
      const viewport = window.visualViewport
      // A narrower visual viewport is a pinch zoom, not a keyboard.
      const covered = viewport && viewport.width >= window.innerWidth - 1 ? Math.max(0, window.innerHeight - viewport.height) : 0
      document.documentElement.style.setProperty('--keyboard', `${covered}px`)
    }
    sync()
    window.visualViewport?.addEventListener('resize', sync)
    window.addEventListener('resize', sync)
    return () => {
      window.visualViewport?.removeEventListener('resize', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])
}

/* ---------- trips screen ---------- */

/** Tinted band of a trip: the accent hue rotated by a hash of its title, plus where today sits in the trip. */
function Cover({ trip, status, large = false }: { trip: Trip; status: TripStatus; large?: boolean }) {
  return (
    <div className={`cover${large ? ' cover-lg' : ''}`} style={{ '--cover-h': coverHue(trip.title) } as CSSProperties}>
      {status.kind === 'ongoing' ? (
        <span className="badge">{t.ongoing(status.day)}</span>
      ) : (
        <span className="cover-label">{status.kind === 'upcoming' ? t.upcoming(status.inDays) : t.lasted(status.days)}</span>
      )}
      <svg className="cover-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="24" cy="24" r="19" strokeWidth={1.5} strokeDasharray="2.5 4" />
        <g transform="translate(12 12)" strokeWidth={1.6}>
          <path d="M21 3 3 10.5l7 3.5 3.5 7L21 3Z" />
          <path d="m10 14 11-11" />
        </g>
      </svg>
    </div>
  )
}

/** Destination and dates, as the trip card and the detail header both list them. */
function TripFacts({ trip, count }: { trip: Trip; count?: number }) {
  return (
    <>
      {trip.destination && (
        <p className="meta">
          <Pin />
          <span className="meta-text">{trip.destination}</span>
        </p>
      )}
      <p className="meta">
        <Calendar />
        <span className="meta-text">{rangeLabel(trip.start, trip.end)}</span>
        {count !== undefined && (
          <>
            <span className="meta-text" aria-hidden="true">
              ·
            </span>
            <span className="meta-text">{t.entryCount(count)}</span>
          </>
        )}
      </p>
    </>
  )
}

function TripCard({ trip, count, todayKey, fresh, onOpen }: { trip: Trip; count: number; todayKey: string; fresh: boolean; onOpen: () => void }) {
  return (
    <article
      id={fresh ? 'travel-fresh' : undefined}
      className={`card trip${fresh ? ' fresh' : ''}`}
      data-testid="travel-trip"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <Cover trip={trip} status={tripStatus(trip, todayKey)} />
      <div className="trip-body">
        <h2 className="trip-title">{trip.title}</h2>
        <TripFacts trip={trip} count={count} />
      </div>
    </article>
  )
}

function TripList({ trips, counts, freshId, onNew, onOpen }: {
  trips: Trip[] | null
  counts: Map<string, number>
  freshId: string | null
  onNew: () => void
  onOpen: (id: string) => void
}) {
  useReveal(freshId)
  const todayKey = today()
  const sorted = trips && [...trips].sort((a, b) => b.start.localeCompare(a.start) || b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      <header className="topbar">
        <h1 className="page-title">{t.appName}</h1>
        <button type="button" className="btn btn-primary btn-pill" data-testid="travel-new" onClick={onNew} disabled={trips === null}>
          <Icon>
            <path d="M12 5v14M5 12h14" />
          </Icon>
          {t.newTrip}
        </button>
      </header>
      <main className="content">
        {sorted?.length === 0 && (
          <section className="card dashed empty">
            <Icon>
              <rect x="4" y="8" width="16" height="12" rx="2.5" />
              <path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M8.5 12v4M15.5 12v4" />
            </Icon>
            <h2 className="empty-title">{t.emptyTitle}</h2>
            <p className="empty-hint">{t.emptyHint}</p>
          </section>
        )}
        {sorted?.map((trip) => (
          <TripCard key={trip.id} trip={trip} count={counts.get(trip.id) ?? 0} todayKey={todayKey} fresh={trip.id === freshId} onOpen={() => onOpen(trip.id)} />
        ))}
        {trips === null && (
          <div aria-busy="true">
            <p className="sr-only" role="status">
              {t.loading}
            </p>
            <div className="skeleton" aria-hidden="true" />
            <div className="skeleton" aria-hidden="true" />
          </div>
        )}
      </main>
    </>
  )
}

/* ---------- new trip form ---------- */

type Draft = { [Field in keyof TripInput]: string }

function TripForm({ onSave, onClose }: { onSave: (input: TripInput) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({ title: '', destination: '', start: today(), end: '' }))
  const [titleTouched, setTitleTouched] = useState(false)

  const startOk = isDay(draft.start)
  const endOk = draft.end === '' || (isDay(draft.end) && draft.end >= draft.start)
  const valid = draft.title.trim() !== '' && startOk && endOk
  const titleError = titleTouched && draft.title.trim() === '' ? t.titleRequired : ''
  const endError = endOk ? '' : t.endBeforeStart

  const set = (field: keyof Draft) => (event: ChangeEvent<HTMLInputElement>) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid) return
    onSave({ title: draft.title.trim(), destination: draft.destination.trim(), start: draft.start, end: draft.end || null })
  }

  return (
    <div className="modal" onClick={onClose} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <form className="card modal-card" aria-labelledby="travel-form-title" noValidate onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <h2 id="travel-form-title" className="modal-title">
          {t.formTitle}
        </h2>

        <div className="field">
          <label className="label" htmlFor="travel-title">
            <span>{t.titleLabel}</span>
            <span className="counter" aria-hidden="true">
              {draft.title.length}/20
            </span>
          </label>
          <input
            id="travel-title"
            className="input"
            data-testid="travel-title"
            value={draft.title}
            maxLength={20}
            placeholder={t.titlePlaceholder}
            autoFocus
            aria-invalid={titleError !== ''}
            aria-describedby={titleError ? 'travel-title-error' : undefined}
            onChange={set('title')}
            onBlur={() => setTitleTouched(true)}
          />
          {titleError && (
            <p id="travel-title-error" className="error" role="alert">
              {titleError}
            </p>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="travel-destination">
            {t.destinationLabel}
          </label>
          <input
            id="travel-destination"
            className="input"
            data-testid="travel-destination"
            value={draft.destination}
            maxLength={40}
            placeholder={t.destinationPlaceholder}
            onChange={set('destination')}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="travel-start">
              {t.startLabel}
            </label>
            <span className="input-wrap trailing">
              <input id="travel-start" className="input" data-testid="travel-start" type="date" value={draft.start} aria-invalid={!startOk} onChange={set('start')} />
              <Calendar />
            </span>
          </div>
          <div className="field">
            <label className="label" htmlFor="travel-end">
              {t.endLabel}
            </label>
            <span className="input-wrap trailing">
              <input
                id="travel-end"
                className="input"
                data-testid="travel-end"
                type="date"
                value={draft.end}
                aria-invalid={!endOk}
                aria-describedby={endError ? 'travel-end-error' : undefined}
                onChange={set('end')}
              />
              <Calendar />
            </span>
          </div>
        </div>
        {!startOk && (
          <p className="error" role="alert">
            {t.startRequired}
          </p>
        )}
        {endError && (
          <p id="travel-end-error" className="error" role="alert">
            {endError}
          </p>
        )}

        <div className="actions">
          <button type="button" className="btn btn-ghost" data-testid="travel-cancel" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="btn btn-primary" data-testid="travel-save" disabled={!valid}>
            {t.save}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ---------- trip detail ---------- */

function EntryItem({ entry, fresh, confirming, onAskDelete, onCancelDelete, onConfirmDelete }: {
  entry: Entry
  fresh: boolean
  confirming: boolean
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const mood = entry.mood ? MOODS.find((item) => item.emoji === entry.mood) : undefined
  const headline = entry.place || (mood ? moodName(mood) : '')

  return (
    <article id={fresh ? 'travel-fresh' : undefined} className={`card entry${fresh ? ' fresh' : ''}`} data-testid="travel-entry">
      <header className="entry-head">
        {mood && (
          <span className="mood" role="img" aria-label={moodName(mood)}>
            <span aria-hidden="true">{mood.emoji}</span>
          </span>
        )}
        {headline && <h4 className="entry-place">{headline}</h4>}
        <time className="entry-time" dateTime={entry.date}>
          {entry.date.slice(11, 16)}
        </time>
        {!confirming && (
          <button type="button" className="icon-btn" data-testid="travel-delete" aria-label={t.deleteEntry} onClick={onAskDelete}>
            <Icon>
              <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
            </Icon>
          </button>
        )}
      </header>
      <p className="entry-text">{entry.text}</p>
      {confirming && (
        <div className="confirm">
          <span>{t.confirmDelete}</span>
          <button type="button" className="btn btn-ghost" data-testid="travel-cancel-delete" autoFocus onClick={onCancelDelete}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn-danger" data-testid="travel-confirm-delete" onClick={onConfirmDelete}>
            {t.delete}
          </button>
        </div>
      )}
    </article>
  )
}

function Composer({ onAdd }: { onAdd: (input: EntryInput) => void }) {
  const [place, setPlace] = useState('')
  const [mood, setMood] = useState<string | null>(null)
  const [text, setText] = useState('')
  const ready = text.trim() !== ''

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready) return
    onAdd({ place: place.trim(), mood, text: text.trim() })
    setPlace('')
    setMood(null)
    setText('')
  }

  return (
    <form className="card composer" aria-label={t.writeEntry} onSubmit={submit}>
      <span className="input-wrap leading">
        <input
          className="input"
          data-testid="travel-place"
          value={place}
          maxLength={40}
          placeholder={t.placePlaceholder}
          aria-label={t.placeLabel}
          onChange={(event) => setPlace(event.target.value)}
        />
        <Pin />
      </span>
      <div className="moods" role="group" aria-label={t.moodLabel}>
        {MOODS.map((item, index) => {
          const selected = mood === item.emoji
          return (
            <button
              key={item.emoji}
              type="button"
              className="mood-chip"
              data-testid={`travel-mood-${index + 1}`}
              aria-pressed={selected}
              aria-label={moodName(item)}
              onClick={() => setMood(selected ? null : item.emoji)}
            >
              <span aria-hidden="true">{item.emoji}</span>
            </button>
          )
        })}
      </div>
      <div className="input-area">
        <textarea
          className="textarea"
          data-testid="travel-text"
          value={text}
          maxLength={300}
          rows={3}
          placeholder={t.textPlaceholder}
          aria-label={t.textLabel}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="composer-foot">
          <span className={`counter${text.length >= 300 ? ' limit' : ''}`} aria-hidden="true">
            {text.length}/300
          </span>
          <button type="submit" className="btn btn-primary" data-testid="travel-add" disabled={!ready}>
            <Icon>
              <path d="M12 5v14M5 12h14" />
            </Icon>
            {t.add}
          </button>
        </div>
      </div>
    </form>
  )
}

function TripDetail({ trip, entries, onBack, onAdd, onDelete }: {
  trip: Trip
  entries: Entry[]
  onBack: () => void
  onAdd: (input: EntryInput) => string
  onDelete: (id: string) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null)
  useReveal(freshId)

  const days = byDay(entries)

  return (
    <>
      <header className="topbar">
        <button type="button" className="icon-btn" data-testid="travel-back" aria-label={t.back} onClick={onBack}>
          <Icon>
            <path d="m15 5-7 7 7 7" />
          </Icon>
        </button>
        <span className="topbar-title">{t.appName}</span>
      </header>
      <main className="content">
        <section className="card hero">
          <Cover trip={trip} status={tripStatus(trip, today())} large />
          <div className="hero-body">
            <h1 className="hero-title">{trip.title}</h1>
            <TripFacts trip={trip} />
          </div>
        </section>

        <h2 className="section-title">
          {t.entries}
          <span className="count">{t.entryCount(entries.length)}</span>
        </h2>

        {days.length === 0 && (
          <section className="card dashed empty">
            <Icon>
              <path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v13H7.5A2.5 2.5 0 0 1 5 17.5v-13Z" />
              <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19M9 8.5h6" />
            </Icon>
            <h3 className="empty-title">{t.noEntriesTitle}</h3>
            <p className="empty-hint">{t.noEntriesHint}</p>
          </section>
        )}

        {days.map(([day, items]) => (
          <section className="day" key={day} aria-labelledby={`travel-day-${day}`}>
            <header className="day-head">
              <h3 id={`travel-day-${day}`} className="day-date">
                {dayLabel(day)}
                <span className="weekday">{weekday(day)}</span>
              </h3>
              {day >= trip.start && <span className="pill">{t.day(daysBetween(trip.start, day) + 1)}</span>}
            </header>
            {items.map((entry) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                fresh={entry.id === freshId}
                confirming={entry.id === confirmId}
                onAskDelete={() => setConfirmId(entry.id)}
                onCancelDelete={() => setConfirmId(null)}
                onConfirmDelete={() => {
                  onDelete(entry.id)
                  setConfirmId(null)
                }}
              />
            ))}
          </section>
        ))}

        <Composer
          onAdd={(input) => {
            setFreshId(onAdd(input))
          }}
        />
      </main>
    </>
  )
}

/* ---------- app ---------- */

function App() {
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [freshTripId, setFreshTripId] = useState<string | null>(null)
  const scrollBeforeOpen = useRef(0)

  useKeyboardInset()

  useEffect(() => {
    void Promise.all([loadTrips(), loadEntries()]).then(([storedTrips, storedEntries]) => {
      setTrips(storedTrips)
      setEntries(storedEntries)
    })
  }, [])

  // A detail screen starts at its top; going back returns to where the list was left.
  useEffect(() => {
    window.scrollTo(0, openId ? 0 : scrollBeforeOpen.current)
  }, [openId])

  const openTrip = trips?.find((trip) => trip.id === openId)
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.tripId, (counts.get(entry.tripId) ?? 0) + 1)

  const addTrip = (input: TripInput) => {
    const trip: Trip = { id: newId(), ...input, createdAt: new Date().toISOString() }
    const next = [...(trips ?? []), trip]
    setTrips(next)
    saveTrips(next)
    setCreating(false)
    setFreshTripId(trip.id)
  }

  const addEntry = (tripId: string, input: EntryInput): string => {
    const entry: Entry = { id: newId(), tripId, date: stamp(), ...input }
    setEntries([entry, ...entries])
    saveEntries([entry, ...entries])
    return entry.id
  }

  const removeEntry = (id: string) => {
    const next = entries.filter((entry) => entry.id !== id)
    setEntries(next)
    saveEntries(next)
  }

  return (
    <>
      <div className="app" inert={creating}>
        {openTrip ? (
          <TripDetail
            trip={openTrip}
            entries={entries.filter((entry) => entry.tripId === openTrip.id)}
            onBack={() => setOpenId(null)}
            onAdd={(input) => addEntry(openTrip.id, input)}
            onDelete={removeEntry}
          />
        ) : (
          <TripList
            trips={trips}
            counts={counts}
            freshId={freshTripId}
            onNew={() => setCreating(true)}
            onOpen={(id) => {
              scrollBeforeOpen.current = window.scrollY
              setOpenId(id)
            }}
          />
        )}
      </div>
      {creating && <TripForm onSave={addTrip} onClose={() => setCreating(false)} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
