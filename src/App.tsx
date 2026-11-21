import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft, ArrowUp, BarChart3, Blocks, BookOpen, CalendarCheck2, Check, ChevronRight, CircleUserRound,
  Clock3, Compass, FlaskConical, FolderGit2, GlassWater, Languages, LayoutGrid, Lightbulb,
  LoaderCircle, Map, MessageCircle, MessageSquare, NotebookPen, Plus, Rocket,
  ShieldCheck, Sparkles, Timer, Trash2, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AgentRuntime } from './agent/AgentRuntime'
import { giftStore, runtime } from './native/craft'
import { createOfflineTodo } from './sample'
import { detectLanguage, translate } from './i18n'
import type { Language, MessageKey } from './i18n'
import type { AgentConfig, ChatMessage, Gift, SessionState, Snapshot } from './types'
import './styles.css'

type Tab = 'chat' | 'discover' | 'gifts' | 'profile'

const NEW_GIFT_KEY = '__new__'
const OFFLINE_STATUS = 'Building the offline Todo validation app'
const COMPACT_STATUS = 'Compacting earlier context into archive pages'

type InspirationId = 'focus' | 'ledger' | 'habit' | 'travel' | 'words' | 'water'
type InspirationCategory = 'productivity' | 'finance' | 'life' | 'study'

const inspirations: readonly { id: InspirationId; icon: LucideIcon; tone: string; category: InspirationCategory }[] = [
  { id: 'focus', icon: Timer, tone: 'mint', category: 'productivity' },
  { id: 'ledger', icon: BarChart3, tone: 'blue', category: 'finance' },
  { id: 'habit', icon: CalendarCheck2, tone: 'orange', category: 'productivity' },
  { id: 'travel', icon: Map, tone: 'lavender', category: 'life' },
  { id: 'words', icon: BookOpen, tone: 'yellow', category: 'study' },
  { id: 'water', icon: GlassWater, tone: 'cyan', category: 'life' },
]

const categories = ['all', 'productivity', 'life', 'finance', 'study'] as const

const chatSuggestions = [
  { icon: BarChart3, key: 'suggestion.ledger', prompt: 'inspiration.ledger.prompt' },
  { icon: CalendarCheck2, key: 'suggestion.habit', prompt: 'inspiration.habit.prompt' },
  { icon: NotebookPen, key: 'suggestion.notes', prompt: 'suggestion.notes.prompt' },
] as const

function CraftMark({ size = 'normal' }: { size?: 'small' | 'normal' | 'large' }) {
  return <span className={`craft-mark ${size}`}><Blocks strokeWidth={2.2} /></span>
}

function welcomeChat(language: Language): ChatMessage {
  return { id: 'welcome', role: 'assistant', createdAt: Date.now(), text: translate(language, 'welcome.subtitle') }
}

export default function App() {
  const [gifts, setGifts] = useState<Gift[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [discoverCategory, setDiscoverCategory] = useState<(typeof categories)[number]>('all')
  const [notice, setNotice] = useState('')
  const [language, setLanguage] = useState<Language>(detectLanguage)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeChat(detectLanguage())])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [config, setConfig] = useState<AgentConfig>({ apiKey: '', baseUrl: '', model: '', reasoningEffort: 'high' })
  const [activeGiftId, setActiveGiftId] = useState<string>()
  const [versions, setVersions] = useState<Snapshot[]>([])
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<{ action: string; resolve: (approved: boolean) => void }>()
  const [deleteCandidate, setDeleteCandidate] = useState<string>()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const sessionRef = useRef<SessionState>({ drafts: {} })
  const sessionReady = useRef(false)
  // Keep refs in lockstep with state: agent hooks and persistence run outside render.
  const messagesRef = useRef<ChatMessage[]>(messages)
  const activeGiftIdRef = useRef<string | undefined>(undefined)
  const agentsRef = useRef(new globalThis.Map<string, AgentRuntime>())

  const t = useCallback((key: MessageKey, vars: Record<string, string | number> = {}) => translate(language, key, vars), [language])
  const locale = language === 'zh' ? 'zh-CN' : 'en'

  const refreshGifts = useCallback(async () => {
    setGifts(await giftStore.listGifts())
  }, [])

  const persistSession = useCallback(() => {
    if (sessionReady.current) void giftStore.saveSession(sessionRef.current)
  }, [])

  const setConversation = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
    if (activeGiftIdRef.current) void giftStore.saveConversation(activeGiftIdRef.current, next)
  }, [])

  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    const current = messagesRef.current
    const next = current.length === 1 && current[0].id === 'welcome'
      ? [{ id: crypto.randomUUID(), role, text, createdAt: Date.now() }]
      : [...current, { id: crypto.randomUUID(), role, text, createdAt: Date.now() }]
    setConversation(next)
  }, [setConversation])

  const agentHooks = useMemo(() => ({
    onStatus: setStatus,
    onAssistant: (text: string) => addMessage('assistant', text),
    onGiftsChanged: refreshGifts,
    onGiftSelected: (gift: Gift) => {
      // The unbound agent just created its Gift: adopt it under the Gift's key.
      const pending = agentsRef.current.get(NEW_GIFT_KEY)
      if (pending) {
        agentsRef.current.delete(NEW_GIFT_KEY)
        agentsRef.current.set(gift.id, pending)
      }
      activeGiftIdRef.current = gift.id
      setActiveGiftId(gift.id)
      void giftStore.saveConversation(gift.id, messagesRef.current)
    },
    confirm: (action: string) => {
      const { promise, resolve } = Promise.withResolvers<boolean>()
      setConfirmation({ action, resolve })
      return promise
    },
    onContext: async (jsonl: string) => {
      const giftId = activeGiftIdRef.current
      if (giftId) await giftStore.saveModelContext(giftId, jsonl)
    },
    onArchive: async (jsonl: string) => {
      const giftId = activeGiftIdRef.current
      if (giftId) await giftStore.archiveModelContext(giftId, jsonl)
    },
  }), [addMessage, refreshGifts])

  // One agent per Gift; full JSONL context is restored losslessly on cold start.
  const getAgent = useCallback(async (gift?: Gift): Promise<AgentRuntime> => {
    const key = gift?.id ?? NEW_GIFT_KEY
    let instance = agentsRef.current.get(key)
    if (!instance) {
      instance = new AgentRuntime(agentHooks, gift)
      if (gift) {
        const jsonl = await giftStore.getModelContext(gift.id)
        if (jsonl) instance.restoreContext(jsonl)
        else instance.seedHistory(messagesRef.current) // legacy conversations without context.jsonl
      }
      agentsRef.current.set(key, instance)
    }
    return instance
  }, [agentHooks])

  const openGift = useCallback(async (gift: Gift) => {
    if (busy) return
    const history = await giftStore.getConversation(gift.id)
    const next = history.length ? history : [welcomeChat(language)]
    activeGiftIdRef.current = gift.id
    setActiveGiftId(gift.id)
    messagesRef.current = next
    setMessages(next)
    setInput(sessionRef.current.drafts[gift.id] ?? '')
    await getAgent(gift)
    setActiveTab('chat')
  }, [busy, getAgent, language])

  const newGift = useCallback(() => {
    if (busy) return
    agentsRef.current.delete(NEW_GIFT_KEY)
    activeGiftIdRef.current = undefined
    setActiveGiftId(undefined)
    const welcome = [welcomeChat(language)]
    messagesRef.current = welcome
    setMessages(welcome)
    setInput(sessionRef.current.drafts[''] ?? '')
    setActiveTab('chat')
  }, [busy, language])

  useEffect(() => {
    let active = true
    void (async () => {
      const [initialGifts, initialConfig, session] = await Promise.all([
        giftStore.listGifts(), giftStore.getAgentConfig(), giftStore.getSession(),
      ])
      if (!active) return
      sessionRef.current = session
      sessionReady.current = true
      setGifts(initialGifts)
      setConfig(initialConfig)
      if (session.language) setLanguage(session.language)
      if (session.activeTab) setActiveTab(session.activeTab)
      const restored = session.activeGiftId ? initialGifts.find((gift) => gift.id === session.activeGiftId) : undefined
      if (restored) {
        const history = await giftStore.getConversation(restored.id)
        if (!active) return
        const next = history.length ? history : [welcomeChat(session.language ?? detectLanguage())]
        activeGiftIdRef.current = restored.id
        setActiveGiftId(restored.id)
        messagesRef.current = next
        setMessages(next)
        await getAgent(restored)
      }
      if (active) setInput(session.drafts[restored?.id ?? ''] ?? '')
    })()
    return () => { active = false }
  }, [getAgent])

  useEffect(() => {
    sessionRef.current.activeTab = activeTab
    sessionRef.current.activeGiftId = activeGiftId
    sessionRef.current.language = language
    persistSession()
  }, [activeTab, activeGiftId, language, persistSession])

  useEffect(() => {
    sessionRef.current.drafts[activeGiftId ?? ''] = input
    const timeout = setTimeout(persistSession, 400)
    return () => clearTimeout(timeout)
  }, [input, activeGiftId, persistSession])

  useEffect(() => {
    if (!deleteCandidate) return
    const timeout = setTimeout(() => setDeleteCandidate(undefined), 3000)
    return () => clearTimeout(timeout)
  }, [deleteCandidate])

  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(''), 2400)
    return () => clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    composer.style.height = 'auto'
    composer.style.height = `${Math.min(composer.scrollHeight, 112)}px`
  }, [input, activeTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, status])

  useEffect(() => {
    if (activeGiftId && versionsOpen) void giftStore.listSnapshots(activeGiftId).then(setVersions)
  }, [activeGiftId, versionsOpen])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const prompt = input.trim()
    if (!prompt || busy) return
    setInput('')
    setBusy(true)
    addMessage('user', prompt)
    try {
      const agent = await getAgent(activeGift)
      await agent.run(prompt)
    } catch (error) {
      addMessage('assistant', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const runOfflineCheck = async () => {
    setActiveTab('chat')
    setBusy(true)
    setStatus(OFFLINE_STATUS)
    try {
      const gift = await createOfflineTodo()
      await refreshGifts()
      const result: ChatMessage[] = [{ id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now(), text: t('offline.result') }]
      activeGiftIdRef.current = gift.id
      setActiveGiftId(gift.id)
      messagesRef.current = result
      setMessages(result)
      await giftStore.saveConversation(gift.id, result)
    } catch (error) {
      addMessage('assistant', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault()
    await giftStore.setAgentConfig(config)
    setSettingsOpen(false)
    setNotice(t('notice.configSaved'))
  }

  const rollback = async (snapshot: Snapshot) => {
    if (!activeGiftId) return
    setBusy(true)
    try {
      await giftStore.rollback(activeGiftId, snapshot.id)
      setVersions(await giftStore.listSnapshots(activeGiftId))
      await refreshGifts()
      setVersionsOpen(false)
      setActiveTab('chat')
      addMessage('assistant', t('rollback.message', { message: snapshot.message }))
    } catch (error) {
      addMessage('assistant', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const deleteGift = async (gift: Gift) => {
    if (busy) return
    if (deleteCandidate !== gift.id) {
      setDeleteCandidate(gift.id)
      return
    }
    setBusy(true)
    try {
      await runtime.closePreview()
      await giftStore.deleteGift(gift.id)
      agentsRef.current.delete(gift.id)
      delete sessionRef.current.drafts[gift.id]
      if (activeGiftIdRef.current === gift.id) {
        activeGiftIdRef.current = undefined
        setActiveGiftId(undefined)
        const welcome = [welcomeChat(language)]
        messagesRef.current = welcome
        setMessages(welcome)
      }
      setDeleteCandidate(undefined)
      await refreshGifts()
      setNotice(t('notice.deleted', { name: gift.name }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const activeGift = gifts.find((gift) => gift.id === activeGiftId)
  const isWelcome = !activeGiftId && messages.length === 1 && messages[0].id === 'welcome' && !status
  const filteredInspirations = discoverCategory === 'all' ? inspirations : inspirations.filter((item) => item.category === discoverCategory)
  const subagentStatus = status.startsWith('Subagent: ')
  const baseStatus = subagentStatus ? status.slice('Subagent: '.length) : status
  const statusText = (subagentStatus ? t('status.subagent') : '') + (
    baseStatus.startsWith('Agent round') ? t('status.working')
      : baseStatus === OFFLINE_STATUS ? t('status.offline')
        : baseStatus === COMPACT_STATUS ? t('status.compacting')
          : t(`status.${baseStatus}` as MessageKey) || baseStatus)

  const startPrompt = (prompt: string) => {
    if (busy) return
    newGift()
    setInput(prompt)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const continueGift = (gift: Gift) => {
    void openGift(gift).then(() => setNotice(t('notice.switched', { name: gift.name })))
  }

  return <div className="app-shell">
    {!settingsOpen && activeTab === 'chat' && <main className="screen chat-screen">
      <section className={`conversation ${isWelcome ? 'welcome-conversation' : ''}`}>
        {isWelcome ? <div className="welcome">
          <CraftMark size="large" />
          <h1>{t('welcome.title')}</h1>
          <p>{t('welcome.subtitle')}</p>
          <div className="suggestion-list">
            {chatSuggestions.map(({ key, icon: Icon, prompt }) => <button className="suggestion" key={key} onClick={() => startPrompt(t(prompt))}>
              <Icon size={19} /><span><strong>{t(`${key}.title`)}</strong><small>{t(`${key}.subtitle`)}</small></span><ChevronRight size={17} />
            </button>)}
          </div>
          <button className="offline-link" disabled={busy} onClick={() => void runOfflineCheck()}>
            <FlaskConical size={16} />{t('welcome.offline')}<ChevronRight size={15} />
          </button>
        </div> : <div className="message-list">
          {messages.map((message) => <article className={`message ${message.role}`} key={message.id}>
            {message.role === 'assistant' && <div className="assistant-label"><CraftMark size="small" /><strong>Craft</strong></div>}
            <div className="message-content">{message.text}</div>
          </article>)}
          {status && <div className="working"><LoaderCircle className="spin" size={17} /><span>{statusText}</span></div>}
          {confirmation && <div className="confirmation">
            <span className="confirmation-icon"><Rocket size={20} /></span>
            <div><strong>{confirmation.action}</strong><p>{t('confirm.body')}</p></div>
            <div className="confirmation-actions">
              <button onClick={() => { confirmation.resolve(false); setConfirmation(undefined) }}>{t('confirm.cancel')}</button>
              <button className="primary-button" onClick={() => { confirmation.resolve(true); setConfirmation(undefined) }}><Check size={16} />{t('confirm.ok')}</button>
            </div>
          </div>}
          <div ref={messagesEndRef} />
        </div>}
      </section>

      <div className="composer-area">
        {activeGift && <button className="gift-context" onClick={() => setVersionsOpen(true)}>
          <FolderGit2 size={15} /><span>{activeGift.name}</span><small>{activeGift.releaseSnapshotId ? t('gift.published') : t('gift.developing')}</small><ChevronRight size={14} />
        </button>}
        <form className="composer" onSubmit={send}>
          <textarea ref={composerRef} aria-label={t('composer.send')} value={input} rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={t('composer.placeholder')} />
          <div className="composer-footer">
            <button className="composer-tool" type="button" aria-label={t('profile.offline')} disabled={busy} onClick={() => void runOfflineCheck()}><FlaskConical size={17} /><span>{t('composer.offline')}</span></button>
            <button className="send-button" aria-label={t('composer.send')} disabled={busy || !input.trim()} type="submit">
              {busy ? <LoaderCircle className="spin" size={19} /> : <ArrowUp size={20} />}
            </button>
          </div>
        </form>
      </div>
    </main>}

    {!settingsOpen && activeTab === 'discover' && <main className="screen tab-screen discover-screen">
      <article className="featured-card">
        <span className="eyebrow">{t('featured.eyebrow')}</span>
        <div className="featured-icon"><Timer size={29} /></div>
        <h2>{t('inspiration.focus.name')}</h2>
        <p>{t('featured.subtitle')}</p>
        <button onClick={() => startPrompt(t('inspiration.focus.prompt'))}>{t('featured.cta')}<ArrowUp size={17} /></button>
      </article>
      <div className="category-tabs" aria-label={t('nav.discover')}>
        {categories.map((category) => <button key={category} className={discoverCategory === category ? 'active' : ''} onClick={() => setDiscoverCategory(category)}>{t(`category.${category}`)}</button>)}
      </div>
      <section className="inspiration-grid" aria-label={t('nav.discover')}>
        {filteredInspirations.map(({ id, icon: Icon, tone }) => <button className="inspiration-card" key={id} onClick={() => startPrompt(t(`inspiration.${id}.prompt`))}>
          <span className={`template-icon ${tone}`}><Icon size={23} /></span>
          <strong>{t(`inspiration.${id}.name`)}</strong><p>{t(`inspiration.${id}.description`)}</p><span className="use-template">{t('featured.cta')}<ArrowUp size={14} /></span>
        </button>)}
      </section>
    </main>}

    {!settingsOpen && activeTab === 'gifts' && <main className="screen tab-screen">
      {gifts.length === 0 ? <div className="empty-gifts">
        <span><Lightbulb size={29} /></span><h2>{t('empty.title')}</h2><p>{t('empty.body')}</p>
        <button className="primary-button" onClick={() => startPrompt('')}>{t('empty.cta')}<ArrowUp size={17} /></button>
      </div> : <>
        <button className="primary-button new-gift-button" disabled={busy} onClick={newGift}><Plus size={17} />{t('gifts.new')}</button>
        <section className="gift-list" aria-label={t('gifts.aria')}>
        {gifts.map((gift, index) => <article className="gift-row" key={gift.id}>
          <button className="gift-open" disabled={!gift.releaseSnapshotId} onClick={() => void runtime.openRelease(gift.id, gift.name)}>
            <span className={`gift-icon tone-${index % 4}`}><Blocks size={22} /></span>
            <span className="gift-info"><strong>{gift.name}</strong><small><i className={gift.releaseSnapshotId ? 'published' : ''} />{gift.releaseSnapshotId ? t('gift.published') : t('gift.developing')} · {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(gift.updatedAt)}</small></span>
            {gift.releaseSnapshotId ? <ChevronRight className="gift-chevron" size={18} /> : null}
          </button>
          <button className="gift-edit" aria-label={t('gift.continue', { name: gift.name })} disabled={busy} onClick={() => continueGift(gift)}><MessageSquare size={18} /></button>
          <button className={`gift-delete ${deleteCandidate === gift.id ? 'confirming' : ''}`} aria-label={t('gift.delete', { name: gift.name })} disabled={busy} onClick={() => void deleteGift(gift)}>
            {deleteCandidate === gift.id ? t('gift.deleteConfirm') : <Trash2 size={17} />}
          </button>
        </article>)}
      </section></>}
    </main>}

    {!settingsOpen && activeTab === 'profile' && <main className="screen tab-screen profile-screen">
      <section className="profile-card"><CraftMark size="large" /><div><h2>{t('profile.title')}</h2><p>{t('profile.summary', { total: gifts.length, published: gifts.filter((gift) => gift.releaseSnapshotId).length })}</p></div></section>
      <p className="menu-label">{t('profile.settings')}</p>
      <section className="settings-list">
        <button onClick={() => setSettingsOpen(true)}><span className="settings-icon"><Sparkles size={19} /></span><span><strong>{t('profile.model')}</strong><small>{config.model || t('profile.modelHint')}</small></span><ChevronRight size={18} /></button>
        <button disabled={busy} onClick={() => void runOfflineCheck()}><span className="settings-icon"><FlaskConical size={19} /></span><span><strong>{t('profile.offline')}</strong><small>{t('profile.offlineHint')}</small></span><ChevronRight size={18} /></button>
        <div className="language-row"><span className="settings-icon"><Languages size={19} /></span><span><strong>{t('profile.language')}</strong></span>
          <div className="effort-options language-options" role="group" aria-label={t('profile.language')}>
            {(['zh', 'en'] as const).map((option) => <button key={option} type="button" className={language === option ? 'active' : ''} aria-pressed={language === option} onClick={() => setLanguage(option)}>{option === 'zh' ? '中文' : 'English'}</button>)}
          </div>
        </div>
      </section>
      <p className="menu-label">{t('profile.about')}</p>
      <section className="settings-list static-list">
        <div><span className="settings-icon"><ShieldCheck size={19} /></span><span><strong>{t('profile.dataLocal')}</strong><small>{t('profile.dataLocalHint')}</small></span></div>
        <div><span className="settings-icon"><Blocks size={19} /></span><span><strong>Craft</strong><small>{t('profile.version')}</small></span></div>
      </section>
    </main>}

    {!settingsOpen && <nav className="bottom-nav" aria-label={t('nav.chat')}>
      {([
        { id: 'chat', label: t('nav.chat'), icon: MessageCircle },
        { id: 'discover', label: t('nav.discover'), icon: Compass },
        { id: 'gifts', label: t('nav.gifts'), icon: LayoutGrid },
        { id: 'profile', label: t('nav.profile'), icon: CircleUserRound },
      ] as { id: Tab; label: string; icon: LucideIcon }[]).map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}>
        <span><Icon size={22} strokeWidth={activeTab === id ? 2.3 : 1.8} /></span><small>{label}</small>
      </button>)}
    </nav>}

    {settingsOpen && <main className="screen settings-page">
      <header className="page-header">
        <button className="page-back" aria-label={t('settings.back')} onClick={() => setSettingsOpen(false)}><ArrowLeft size={22} /></button>
        <h1>{t('settings.title')}</h1>
        <span className="page-header-spacer" />
      </header>
      <div className="settings-page-content">
        <form className="settings-form" onSubmit={(event) => void saveSettings(event)}>
          <section className="settings-group" aria-label={t('settings.service')}>
            <p className="settings-group-title">{t('settings.service')}</p>
            <div className="settings-fields">
              <label>API Key<div className="field"><input type="password" autoComplete="off" placeholder="sk-…" value={config.apiKey} onChange={(event) => setConfig({ ...config, apiKey: event.target.value })} /></div></label>
              <label>{t('settings.baseUrl')}<div className="field"><input inputMode="url" placeholder="https://…/v1/chat/completions" value={config.baseUrl} onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })} /></div></label>
              <label>{t('settings.model')}<div className="field"><input placeholder={t('settings.modelPlaceholder')} value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} /></div></label>
            </div>
          </section>
          <section className="settings-group" aria-label={t('settings.generation')}>
            <p className="settings-group-title">{t('settings.generation')}</p>
            <div className="reasoning-setting">
              <div><strong>{t('settings.effort')}</strong><small>{t('settings.effortHint')}</small></div>
              <div className="effort-options" role="group" aria-label={t('settings.effort')}>
                {(['none', 'low', 'high', 'max'] as const).map((option) => <button key={option} type="button" className={config.reasoningEffort === option ? 'active' : ''} aria-pressed={config.reasoningEffort === option} onClick={() => setConfig({ ...config, reasoningEffort: option })}>{t(`effort.${option}`)}</button>)}
              </div>
              <p className="settings-help">{t('settings.effortHelp')}</p>
            </div>
          </section>
          <p className="security-note"><ShieldCheck size={15} />{t('settings.keyNote')}</p>
          <button className="save-button" type="submit">{t('settings.save')}<Check size={18} /></button>
        </form>
      </div>
    </main>}

    {versionsOpen && activeGift && <div className="sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setVersionsOpen(false) }}>
      <section className="bottom-sheet versions-sheet" role="dialog" aria-modal="true" aria-label={t('versions.title')}>
        <div className="sheet-handle" />
        <header><div><h2>{t('versions.title')}</h2><p>{activeGift.name}</p></div><button className="round-icon" aria-label={t('versions.close')} onClick={() => setVersionsOpen(false)}><X size={19} /></button></header>
        <div className="version-list">
          {versions.length === 0 ? <div className="empty-versions"><Clock3 size={25} /><p>{t('versions.empty')}</p></div> : versions.map((snapshot, index) => <div className="version-row" key={snapshot.id}>
            <span className="version-node">{index === 0 ? <Check size={15} /> : null}</span>
            <div><strong>{snapshot.message}</strong><small>{new Date(snapshot.createdAt).toLocaleString(locale)}</small></div>
            <button disabled={busy || !snapshot.buildId} onClick={() => void rollback(snapshot)}>{t('versions.rollback')}</button>
          </div>)}
        </div>
      </section>
    </div>}

    {notice && <div className="toast"><Check size={16} />{notice}</div>}
  </div>
}
