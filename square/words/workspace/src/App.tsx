import { useEffect, useMemo, useState } from 'react'
import { storage } from '@craft/sdk'
import { AddWord } from './AddWord'
import { DECK } from './data'
import { Deck } from './Deck'
import { lang, t } from './i18n'
import { advance, countOf, newId, newSession, parseCustomWords, parseProgress, statusOf } from './model'
import type { Card, CustomWord, Progress, Session, Status } from './model'
import { Study } from './Study'

type View = 'deck' | 'study' | 'add'

const PROGRESS_KEY = 'progress'
const CUSTOM_KEY = 'customWords'

/** State stays usable in memory when the host storage is unavailable. */
function persist(name: string, value: Progress | CustomWord[]) {
  storage.set(name, value).catch(() => undefined)
}

async function load() {
  const [storedProgress, storedCustom] = await Promise.all([
    storage.get<unknown>(PROGRESS_KEY, {}).catch(() => null),
    storage.get<unknown>(CUSTOM_KEY, []).catch(() => null),
  ])
  return { progress: parseProgress(storedProgress), custom: parseCustomWords(storedCustom) }
}

export default function App() {
  // `null` until storage has loaded, so stale or garbage numbers are never shown.
  const [custom, setCustom] = useState<CustomWord[] | null>(null)
  const [progress, setProgress] = useState<Progress>({})
  const [view, setView] = useState<View>('deck')
  const [session, setSession] = useState<Session | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void load().then((saved) => {
      setProgress(saved.progress)
      setCustom(saved.custom)
    })
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2400)
    return () => clearTimeout(timer)
  }, [notice])

  const cards = useMemo<Card[]>(
    () => [
      ...DECK.map(({ word, phonetic, zh, en, example }) => ({
        word,
        phonetic,
        meaning: lang === 'zh' ? zh : en,
        example,
        custom: false,
      })),
      ...(custom ?? []).map(({ word, meaning, example }) => ({ word, phonetic: '', meaning, example, custom: true })),
    ],
    [custom],
  )

  const counts = useMemo(() => {
    const result: Record<Status, number> = { new: 0, learning: 0, mastered: 0 }
    for (const { word } of cards) result[statusOf(countOf(progress, word))] += 1
    return result
  }, [cards, progress])

  const goDeck = () => {
    setSession(null)
    setView('deck')
  }

  const startStudy = () => {
    setSession(newSession(cards))
    setView('study')
  }

  const setCount = (word: string, count: number) => {
    const next = { ...progress }
    if (count > 0) next[word] = count
    else delete next[word]
    setProgress(next)
    persist(PROGRESS_KEY, next)
  }

  const grade = (known: boolean) => {
    if (!session || session.queue.length === 0) return
    const card = session.queue[0]
    setCount(card.word, known ? countOf(progress, card.word) + 1 : 0)
    setSession(advance(session, known))
  }

  const addWord = (word: string, meaning: string, example: string) => {
    const next = [...(custom ?? []), { id: newId(), word, meaning, example }]
    setCustom(next)
    persist(CUSTOM_KEY, next)
    setNotice(t('toast.added', { word }))
    setView('deck')
  }

  const deleteWord = (word: string) => {
    const nextCustom = (custom ?? []).filter((item) => item.word !== word)
    const nextProgress = { ...progress }
    delete nextProgress[word]
    setCustom(nextCustom)
    persist(CUSTOM_KEY, nextCustom)
    setProgress(nextProgress)
    persist(PROGRESS_KEY, nextProgress)
    setNotice(t('toast.deleted', { word }))
  }

  if (custom === null) {
    return (
      <div className="app">
        <h1 className="title">{t('app.title')}</h1>
        <p className="loading">{t('app.loading')}</p>
      </div>
    )
  }

  return (
    <div className={`app view-${view}`}>
      {view === 'deck' && (
        <Deck
          cards={cards}
          progress={progress}
          counts={counts}
          onStart={startStudy}
          onAdd={() => setView('add')}
          onDelete={deleteWord}
        />
      )}
      {view === 'study' && session && <Study session={session} onGrade={grade} onAgain={startStudy} onBack={goDeck} />}
      {view === 'add' && <AddWord cards={cards} onSave={addWord} onCancel={goDeck} />}
      {notice && (
        <p className="toast" role="status">
          {notice}
        </p>
      )}
    </div>
  )
}
