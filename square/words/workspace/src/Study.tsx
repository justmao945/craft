import { useState } from 'react'
import { Icon } from './Icon'
import { t } from './i18n'
import type { Card, Session } from './model'

interface StudyProps {
  session: Session
  onGrade: (known: boolean) => void
  onAgain: () => void
  onBack: () => void
}

export function Study({ session, onGrade, onAgain, onBack }: StudyProps) {
  if (session.queue.length === 0) {
    return (
      <main className="stage">
        <section className="card summary" data-testid="words-summary">
          <span className="badge">
            <Icon name="check" size={28} />
          </span>
          <h2 className="title sm">{t('summary.title')}</h2>
          <p className="subtle">{t('summary.total', { n: session.total })}</p>
          <div className="stats">
            <div className="stat">
              <b className="num" data-testid="words-summary-known">
                {session.total - session.learned}
              </b>
              <span>{t('summary.known')}</span>
            </div>
            <div className="stat">
              <b className="num" data-testid="words-summary-learned">
                {session.learned}
              </b>
              <span>{t('summary.learned')}</span>
            </div>
          </div>
          <button type="button" className="btn primary big block" data-testid="words-again" onClick={onAgain}>
            <Icon name="again" />
            {t('summary.again')}
          </button>
          <button type="button" className="btn big block" data-testid="words-back" onClick={onBack}>
            {t('summary.deck')}
          </button>
        </section>
      </main>
    )
  }

  // A card that comes back keeps its slot: the counter only moves on once a card sticks.
  const position = session.total - session.queue.length + 1
  return (
    <>
      <header className="top sub">
        <button type="button" className="icon-btn" data-testid="words-back" aria-label={t('study.back')} onClick={onBack}>
          <Icon name="back" />
        </button>
        <p className="counter num" data-testid="words-position">
          {t('study.counter', { i: position, n: session.total })}
        </p>
      </header>
      <div className="bar slim" aria-hidden="true">
        <i style={{ width: `${((position - 1) / session.total) * 100}%` }} />
      </div>
      <main className="stage">
        <FlashCard key={session.turn} card={session.queue[0]} />
      </main>
      <div className="actions">
        <button type="button" className="btn big" data-testid="words-unknown" onClick={() => onGrade(false)}>
          <Icon name="again" />
          {t('study.unknown')}
        </button>
        <button type="button" className="btn primary big" data-testid="words-known" onClick={() => onGrade(true)}>
          <Icon name="check" />
          {t('study.known')}
        </button>
      </div>
    </>
  )
}

interface FlashCardProps {
  card: Card
}

/** Tapping flips the card in 3D between the word and its meaning. */
function FlashCard({ card }: FlashCardProps) {
  const [flipped, setFlipped] = useState(false)
  const size = card.word.length > 16 ? ' xl' : card.word.length > 11 ? ' lg' : ''
  return (
    <div className="flash">
      <button
        type="button"
        className={`flip${flipped ? ' flipped' : ''}`}
        data-testid="words-card"
        aria-pressed={flipped}
        aria-describedby="words-hint"
        onClick={() => setFlipped((value) => !value)}
      >
        <span className="flip-inner">
          <span className="face front">
            <span className={`word${size}`} data-testid="words-word">
              {card.word}
            </span>
            {card.phonetic && <span className="phonetic">{card.phonetic}</span>}
          </span>
          <span className="face back">
            <span className="back-word">{card.word}</span>
            <span className="back-meaning" data-testid="words-meaning">
              {card.meaning}
            </span>
            {card.example && (
              <span className="example" data-testid="words-example">
                {card.example}
              </span>
            )}
          </span>
        </span>
      </button>
      <p className="hint" id="words-hint">
        {t(flipped ? 'study.flipBack' : 'study.flip')}
      </p>
    </div>
  )
}
