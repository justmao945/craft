import { useState } from 'react'
import { Icon } from './Icon'
import { t } from './i18n'
import { countOf, statusOf } from './model'
import type { Card, Progress, Status } from './model'

interface DeckProps {
  cards: Card[]
  progress: Progress
  counts: Record<Status, number>
  onStart: () => void
  onAdd: () => void
  onDelete: (word: string) => void
}

const STATUSES: readonly Status[] = ['new', 'learning', 'mastered']

export function Deck({ cards, progress, counts, onStart, onAdd, onDelete }: DeckProps) {
  const [pending, setPending] = useState<string | null>(null)
  const total = cards.length
  return (
    <>
      <header className="top">
        <h1 className="title">{t('app.title')}</h1>
        <button type="button" className="pill" data-testid="words-add" onClick={onAdd}>
          <Icon name="plus" />
          {t('deck.add')}
        </button>
      </header>

      <section className="card hero">
        <div className="section-head">
          <h2>{t('deck.progress')}</h2>
          <span className="num subtle">{t('deck.mastered', { known: counts.mastered, total })}</span>
        </div>
        <div
          className="bar"
          role="progressbar"
          aria-label={t('deck.progress')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={counts.mastered}
          data-testid="words-progress"
        >
          <i style={{ width: `${(counts.mastered / total) * 100}%` }} />
        </div>
        <ul className="legend">
          {STATUSES.map((status) => (
            <li key={status}>
              <span>{t(`status.${status}`)}</span>
              <b className="num">{counts[status]}</b>
            </li>
          ))}
        </ul>
        <button type="button" className="btn primary big block" data-testid="words-start" onClick={onStart}>
          <Icon name="play" />
          {t('deck.start')}
        </button>
      </section>

      <div className="section-head list-head">
        <h2>{t('deck.all')}</h2>
        <span className="num subtle">{t('deck.count', { n: total })}</span>
      </div>
      <ul className="list">
        {cards.map((card) => (
          <WordRow
            key={card.word}
            card={card}
            status={statusOf(countOf(progress, card.word))}
            confirming={pending === card.word}
            onAsk={() => setPending(card.word)}
            onCancel={() => setPending(null)}
            onDelete={() => {
              onDelete(card.word)
              setPending(null)
            }}
          />
        ))}
      </ul>
    </>
  )
}

interface WordRowProps {
  card: Card
  status: Status
  confirming: boolean
  onAsk: () => void
  onCancel: () => void
  onDelete: () => void
}

/** A list entry; custom words swap in place for the two-step delete confirmation. */
function WordRow({ card, status, confirming, onAsk, onCancel, onDelete }: WordRowProps) {
  return (
    <li
      className={`card row${confirming ? ' confirming' : ''}`}
      data-testid="words-row"
      data-word={card.word}
      data-status={status}
    >
      {confirming ? (
        <>
          <span className="ask" role="alert">
            {t('delete.ask')}
          </span>
          <button type="button" className="btn" data-testid="words-cancel-delete" onClick={onCancel}>
            {t('delete.cancel')}
          </button>
          <button type="button" className="btn danger" data-testid="words-confirm-delete" onClick={onDelete}>
            {t('delete.confirm')}
          </button>
        </>
      ) : (
        <>
          <div className="row-text">
            <p className="row-word">
              <b>{card.word}</b>
              {card.phonetic && <span className="phonetic">{card.phonetic}</span>}
            </p>
            <p className="meaning">{card.meaning}</p>
          </div>
          <span className="chip" data-status={status} data-testid="words-chip">
            {t(`status.${status}`)}
          </span>
          {card.custom && (
            <button
              type="button"
              className="icon-btn"
              data-testid="words-delete"
              data-word={card.word}
              aria-label={t('delete.word', { word: card.word })}
              onClick={onAsk}
            >
              <Icon name="trash" />
            </button>
          )}
        </>
      )}
    </li>
  )
}
