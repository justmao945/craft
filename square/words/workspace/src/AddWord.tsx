import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from './Icon'
import { t } from './i18n'
import { LIMITS } from './model'
import type { Card } from './model'

interface AddWordProps {
  cards: Card[]
  onSave: (word: string, meaning: string, example: string) => void
  onCancel: () => void
}

export function AddWord({ cards, onSave, onCancel }: AddWordProps) {
  const [word, setWord] = useState('')
  const [meaning, setMeaning] = useState('')
  const [example, setExample] = useState('')
  const trimmed = word.trim()
  const duplicate = cards.some((card) => card.word.toLowerCase() === trimmed.toLowerCase())
  const valid = trimmed !== '' && meaning.trim() !== '' && !duplicate

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (valid) onSave(trimmed, meaning.trim(), example.trim())
  }

  return (
    <form onSubmit={submit}>
      <header className="top sub">
        <button type="button" className="icon-btn" data-testid="words-back" aria-label={t('add.back')} onClick={onCancel}>
          <Icon name="back" />
        </button>
        <h1 className="title sm">{t('add.title')}</h1>
      </header>

      <div className="card fields">
        <label>
          {t('add.word')}
          <input
            data-testid="words-word"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            maxLength={LIMITS.word}
            placeholder={t('add.wordHint')}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="next"
            aria-invalid={duplicate}
          />
          {duplicate && (
            <span className="error" role="alert">
              {t('add.duplicate')}
            </span>
          )}
        </label>
        <label>
          {t('add.meaning')}
          <input
            data-testid="words-meaning"
            value={meaning}
            onChange={(event) => setMeaning(event.target.value)}
            maxLength={LIMITS.meaning}
            placeholder={t('add.meaningHint')}
            enterKeyHint="next"
          />
        </label>
        <label>
          {t('add.example')}
          <textarea
            data-testid="words-example"
            value={example}
            onChange={(event) => setExample(event.target.value)}
            maxLength={LIMITS.example}
            placeholder={t('add.exampleHint')}
            rows={3}
            enterKeyHint="done"
          />
        </label>
        <button type="submit" className="btn primary big block" data-testid="words-save" disabled={!valid}>
          {t('add.save')}
        </button>
      </div>
    </form>
  )
}
