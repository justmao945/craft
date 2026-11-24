import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { category, categoryLabel, EXPENSE_CATEGORIES, GLYPHS, Icon, INCOME_CATEGORIES } from './categories'
import { t } from './i18n'
import {
  breakdown,
  dayLabel,
  groupByDay,
  inMonth,
  isPartialAmount,
  loadEntries,
  money,
  monthLabel,
  monthOf,
  newId,
  parseAmount,
  saveEntries,
  sameMonth,
  shiftMonth,
  signedMoney,
  sum,
  todayString,
  type DayGroup,
  type Entry,
  type EntryType,
  type Month,
  type Slice,
} from './ledger'
import './styles.css'

function Skeleton({ w, h }: { w: number; h: number }) {
  return <i className="skeleton" style={{ width: w, height: h }} />
}

function EntryForm({ date, disabled, onAdd }: { date: string; disabled: boolean; onAdd: (entry: Entry) => void }) {
  const [type, setType] = useState<EntryType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string>(EXPENSE_CATEGORIES[0].id)
  const [note, setNote] = useState('')
  const amountInput = useRef<HTMLInputElement>(null)
  const cents = parseAmount(amount)
  const invalid = cents === null && !isPartialAmount(amount)
  const list = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  const switchType = (next: EntryType) => {
    setType(next)
    setCategoryId((next === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)[0].id)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (cents === null || disabled) return
    onAdd({ id: newId(), type, amountCents: cents, category: categoryId, note: note.trim(), date })
    setAmount('')
    setNote('')
    amountInput.current?.focus()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="form-row">
        <div className="segment" role="group" aria-label={t('typeLabel')}>
          {(['expense', 'income'] as const).map((option) => (
            <button key={option} type="button" data-testid={`ledger-type-${option}`} aria-pressed={type === option} onClick={() => switchType(option)}>
              {t(option)}
            </button>
          ))}
        </div>
        <label className={`amount${invalid ? ' invalid' : ''}`}>
          <span className="yen" aria-hidden="true">¥</span>
          <input
            ref={amountInput}
            data-testid="ledger-amount"
            aria-label={t('amountLabel')}
            aria-invalid={invalid}
            autoComplete="off"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
      </div>
      {invalid && (
        <p className="field-error" data-testid="ledger-amount-error" role="alert">
          {t('amountError')}
        </p>
      )}
      <div className="chips" role="group" aria-label={t('categoryLabel')}>
        {list.map((item) => (
          <button key={item.id} type="button" className="chip" data-testid={`ledger-cat-${item.id}`} aria-pressed={categoryId === item.id} onClick={() => setCategoryId(item.id)}>
            <Icon d={item.icon} />
            <span>{categoryLabel(item.id)}</span>
          </button>
        ))}
      </div>
      <div className="form-row">
        <input
          className="note"
          data-testid="ledger-note"
          aria-label={t('noteLabel')}
          placeholder={t('notePlaceholder')}
          maxLength={30}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="submit" className="btn" data-testid="ledger-save" disabled={cents === null || disabled}>
          {t('save')}
        </button>
      </div>
    </form>
  )
}

function Summary({ expense, income, loading }: { expense: number; income: number; loading: boolean }) {
  const net = income - expense
  const balance = `¥${money(Math.abs(net))}`
  return (
    <section className="card summary" aria-label={t('summaryLabel')}>
      <div className="balance">
        <span className="label">{t('balance')}</span>
        {loading ? (
          <Skeleton w={132} h={28} />
        ) : (
          <strong data-testid="ledger-balance" className={balance.length > 9 ? 'long' : undefined}>
            {net < 0 ? '-' : ''}
            {balance}
          </strong>
        )}
      </div>
      <dl>
        <div>
          <dt>{t('expense')}</dt>
          <dd data-testid="ledger-expense">{loading ? <Skeleton w={72} h={16} /> : <>¥{money(expense)}</>}</dd>
        </div>
        <div>
          <dt>{t('income')}</dt>
          <dd data-testid="ledger-income">{loading ? <Skeleton w={72} h={16} /> : <>¥{money(income)}</>}</dd>
        </div>
      </dl>
    </section>
  )
}

function Breakdown({ slices, loading }: { slices: Slice[]; loading: boolean }) {
  return (
    <section className="card" aria-label={t('breakdownTitle')}>
      <h2 className="section-title">{t('breakdownTitle')}</h2>
      {loading ? (
        <div className="slice">
          <Skeleton w={20} h={20} />
          <Skeleton w={64} h={16} />
          <Skeleton w={96} h={16} />
          <Skeleton w={234} h={6} />
        </div>
      ) : slices.length === 0 ? (
        <p className="muted">{t('breakdownEmpty')}</p>
      ) : (
        slices.map((slice) => (
          <div className="slice" key={slice.category}>
            <Icon d={category(slice.category).icon} />
            <span className="name">{categoryLabel(slice.category)}</span>
            <span className="figures">
              <strong>¥{money(slice.cents)}</strong>
              <span>{Math.round(slice.share * 1000) / 10}%</span>
            </span>
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${slice.share * 100}%` }} />
            </span>
          </div>
        ))
      )}
    </section>
  )
}

function EntryRow({ entry, fresh, onDelete }: { entry: Entry; fresh: boolean; onDelete: (id: string) => void }) {
  const [arming, setArming] = useState(false)
  const name = categoryLabel(entry.category)
  return (
    <li>
      <div className={`row${fresh ? ' is-new' : ''}`} data-testid="ledger-entry">
        <span className="row-icon">
          <Icon d={category(entry.category).icon} />
        </span>
        <span className="row-body">
          <span className="row-title">{entry.note || name}</span>
          {entry.note && <span className="row-sub">{name}</span>}
        </span>
        <span className={`row-amt ${entry.type}`}>{signedMoney(entry.type === 'expense' ? -entry.amountCents : entry.amountCents)}</span>
        {arming ? (
          <span className="row-gap" />
        ) : (
          <button type="button" className="row-delete" data-testid="ledger-delete" aria-label={t('delete')} onClick={() => setArming(true)}>
            <Icon d={GLYPHS.trash} />
          </button>
        )}
      </div>
      {arming && (
        <div className="confirm" role="group" aria-label={t('confirmDeleteQuestion')}>
          <p>{t('confirmDeleteQuestion')}</p>
          <button type="button" className="btn-ghost" data-testid="ledger-cancel-delete" onClick={() => setArming(false)}>
            {t('cancel')}
          </button>
          <button type="button" className="btn-danger" data-testid="ledger-confirm-delete" onClick={() => onDelete(entry.id)}>
            {t('confirmDelete')}
          </button>
        </div>
      )}
    </li>
  )
}

function EntryList({ groups, fresh, onDelete }: { groups: DayGroup[] | null; fresh: string | null; onDelete: (id: string) => void }) {
  return (
    <section className="card" aria-label={t('entriesTitle')}>
      <h2 className="section-title">{t('entriesTitle')}</h2>
      {groups === null ? (
        [0, 1, 2].map((row) => (
          <div className="row" key={row}>
            <Skeleton w={36} h={36} />
            <Skeleton w={row === 1 ? 150 : 96} h={16} />
          </div>
        ))
      ) : groups.length === 0 ? (
        <div className="empty">
          <strong>{t('entriesEmpty')}</strong>
          <span>{t('entriesEmptyHint')}</span>
        </div>
      ) : (
        groups.map((group) => {
          const day = sum(group.entries)
          return (
            <div className="day" key={group.date}>
              <div className="day-head">
                <span>{dayLabel(group.date)}</span>
                <span>{signedMoney(day.income - day.expense)}</span>
              </div>
              <ul className="rows">
                {group.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} fresh={entry.id === fresh} onDelete={onDelete} />
                ))}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}

function App() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [month, setMonth] = useState<Month>(() => monthOf(new Date()))
  const [failed, setFailed] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)

  useEffect(() => {
    loadEntries().then(setEntries)
  }, [])
  useEffect(() => {
    if (!fresh) return
    const timer = setTimeout(() => setFresh(null), 1500)
    return () => clearTimeout(timer)
  }, [fresh])

  const thisMonth = monthOf(new Date())
  const isThisMonth = sameMonth(month, thisMonth)
  const loading = entries === null
  const shown = useMemo(() => entries && inMonth(entries, month), [entries, month])
  const { expense, income } = sum(shown ?? [])
  const slices = useMemo(() => shown && breakdown(shown), [shown])
  const groups = useMemo(() => shown && groupByDay(shown, month), [shown, month])

  const commit = (next: Entry[]) => {
    setEntries(next)
    saveEntries(next).then(
      () => setFailed(false),
      () => setFailed(true),
    )
  }
  const add = (entry: Entry) => {
    if (entries) commit([...entries, entry])
    setFresh(entry.id)
    setMonth(thisMonth)
  }

  return (
    <div className="app">
      <header className="top">
        <h1>{t('title')}</h1>
        {!isThisMonth && (
          <button type="button" className="link-btn" data-testid="ledger-this-month" onClick={() => setMonth(thisMonth)}>
            {t('thisMonth')}
          </button>
        )}
      </header>
      <div className="month" role="group" aria-label={t('monthLabel')}>
        <button type="button" className="icon-btn" data-testid="ledger-prev-month" aria-label={t('prevMonth')} disabled={month.year <= 2000} onClick={() => setMonth(shiftMonth(month, -1))}>
          <Icon d={GLYPHS.left} />
        </button>
        <span className="month-name">{monthLabel(month)}</span>
        <button type="button" className="icon-btn" data-testid="ledger-next-month" aria-label={t('nextMonth')} disabled={isThisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
          <Icon d={GLYPHS.right} />
        </button>
      </div>
      {failed && (
        <div className="banner" role="alert">
          <span>{t('saveFailed')}</span>
          <button type="button" data-testid="ledger-retry-save" onClick={() => commit(entries ?? [])}>
            {t('retry')}
          </button>
        </div>
      )}
      <EntryForm date={todayString()} disabled={loading} onAdd={add} />
      <Summary expense={expense} income={income} loading={loading} />
      <EntryList groups={groups} fresh={fresh} onDelete={(id) => entries && commit(entries.filter((entry) => entry.id !== id))} />
      <Breakdown slices={slices ?? []} loading={loading} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
