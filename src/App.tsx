import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft, ArrowUp, BarChart3, Blocks, BookOpen, CalendarCheck2, Check, ChevronRight, CircleUserRound,
  Clock3, Compass, FolderGit2, GlassWater, Languages, LayoutGrid, Lightbulb,
  LoaderCircle, Map, MessageCircle, MoreHorizontal, NotebookPen, Pin, Play, Plus, Rocket, Search,
  ShieldCheck, Sparkles, Timer, Trash2, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AgentRuntime, AGENT_ROUND_STATUS_PREFIX, SUBAGENT_STATUS_PREFIX } from './agent/AgentRuntime'
import { COMPACTION_STATUS } from './agent/context'
import { generalStore, giftStore, runtime } from './native/craft'
import { detectLanguage, isMessageKey, translate } from './i18n'
import type { Language, MessageKey } from './i18n'
import type { AgentConfig, ChatMessage, Gift, SessionState, Snapshot, StorageStatus } from './types'
import './styles.css'

type Tab = 'craft' | 'gifts' | 'discover' | 'profile'
type AgentMode = 'gift' | 'general'

const NEW_GIFT_KEY = '__new__'
const GENERAL_SESSION_KEY = '__general__'

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

type SuggestionKey = 'suggestion.ledger' | 'suggestion.habit' | 'suggestion.notes' | 'suggestion.think' | 'suggestion.explain' | 'suggestion.write'
type Suggestion = { icon: LucideIcon; key: SuggestionKey; prompt: MessageKey }

const giftSuggestions: readonly Suggestion[] = [
  { icon: BarChart3, key: 'suggestion.ledger', prompt: 'inspiration.ledger.prompt' },
  { icon: CalendarCheck2, key: 'suggestion.habit', prompt: 'inspiration.habit.prompt' },
  { icon: NotebookPen, key: 'suggestion.notes', prompt: 'suggestion.notes.prompt' },
] as const

const generalSuggestions: readonly Suggestion[] = [
  { icon: Lightbulb, key: 'suggestion.think', prompt: 'suggestion.think.prompt' },
  { icon: BookOpen, key: 'suggestion.explain', prompt: 'suggestion.explain.prompt' },
  { icon: NotebookPen, key: 'suggestion.write', prompt: 'suggestion.write.prompt' },
] as const

function CraftMark({ size = 'normal' }: { size?: 'small' | 'normal' | 'large' }) {
  return <span className={`craft-mark ${size}`}><Blocks strokeWidth={2.2} /></span>
}

function welcomeMessage(language: Language): ChatMessage {
  return { id: 'welcome', role: 'assistant', createdAt: Date.now(), text: translate(language, 'welcome.subtitle') }
}

function conversationPreview(messages: ChatMessage[] | undefined, fallback: string): string {
  const latest = messages?.filter((message) => message.role !== 'status').at(-1)
  return latest && latest.id !== 'welcome' ? latest.text : fallback
}

export default function App() {
  const [gifts, setGifts] = useState<Gift[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('craft')
  const [discoverCategory, setDiscoverCategory] = useState<(typeof categories)[number]>('all')
  const [notice, setNotice] = useState('')
  const [today] = useState(() => new Date().toDateString())
  const [storageStatus, setStorageStatus] = useState<StorageStatus>()
  const [storageError, setStorageError] = useState('')
  const [language, setLanguage] = useState<Language>(detectLanguage)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage(detectLanguage())])
  const [generalMessages, setGeneralMessages] = useState<ChatMessage[]>(messages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [config, setConfig] = useState<AgentConfig>({ apiKey: '', baseUrl: '', model: '', reasoningEffort: 'high' })
  const [activeGiftId, setActiveGiftId] = useState<string>()
  const [creatingGift, setCreatingGift] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, ChatMessage[]>>({})
  const [giftQuery, setGiftQuery] = useState('')
  const [toolsOpen, setToolsOpen] = useState(false)
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
  const generalMessagesRef = useRef<ChatMessage[]>(messages)
  const activeGiftIdRef = useRef<string | undefined>(undefined)
  const creatingGiftRef = useRef(false)
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
    else if (!creatingGiftRef.current) {
      generalMessagesRef.current = next
      setGeneralMessages(next)
      void generalStore.saveConversation(next)
    }
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
      creatingGiftRef.current = false
      setActiveGiftId(gift.id)
      setCreatingGift(false)
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
      else if (!creatingGiftRef.current) await generalStore.saveModelContext(jsonl)
    },
    onArchive: async (jsonl: string) => {
      const giftId = activeGiftIdRef.current
      if (giftId) await giftStore.archiveModelContext(giftId, jsonl)
      else if (!creatingGiftRef.current) await generalStore.archiveModelContext(jsonl)
    },
  }), [addMessage, refreshGifts])

  // One persistent agent per Gift, one builder for a new Gift, and one persistent general agent.
  const getAgent = useCallback(async (gift?: Gift, mode: AgentMode = 'gift'): Promise<AgentRuntime> => {
    const key = gift?.id ?? (mode === 'general' ? GENERAL_SESSION_KEY : NEW_GIFT_KEY)
    let instance = agentsRef.current.get(key)
    if (!instance) {
      instance = new AgentRuntime(agentHooks, gift, mode)
      if (gift) {
        const jsonl = await giftStore.getModelContext(gift.id)
        if (jsonl) instance.restoreContext(jsonl)
        else instance.seedHistory(messagesRef.current) // legacy conversations without context.jsonl
      } else if (mode === 'general') {
        const jsonl = await generalStore.getModelContext()
        if (jsonl) instance.restoreContext(jsonl)
        else instance.seedHistory(generalMessagesRef.current)
      }
      agentsRef.current.set(key, instance)
    }
    return instance
  }, [agentHooks])

  const openGift = useCallback(async (gift: Gift) => {
    if (busy) return
    const history = await giftStore.getConversation(gift.id)
    const next = history.length ? history : [welcomeMessage(language)]
    activeGiftIdRef.current = gift.id
    creatingGiftRef.current = false
    setActiveGiftId(gift.id)
    setCreatingGift(false)
    messagesRef.current = next
    setMessages(next)
    setInput(sessionRef.current.drafts[gift.id] ?? '')
    setToolsOpen(false)
    setConversationOpen(true)
    await getAgent(gift)
    setActiveTab('craft')
  }, [busy, getAgent, language])

  const openGeneral = useCallback(async () => {
    if (busy) return
    const history = await generalStore.getConversation()
    const next = history.length ? history : [welcomeMessage(language)]
    activeGiftIdRef.current = undefined
    creatingGiftRef.current = false
    setActiveGiftId(undefined)
    setCreatingGift(false)
    generalMessagesRef.current = next
    setGeneralMessages(next)
    messagesRef.current = next
    setMessages(next)
    setInput(sessionRef.current.drafts[GENERAL_SESSION_KEY] ?? '')
    setToolsOpen(false)
    setActiveTab('craft')
    setConversationOpen(true)
    await getAgent(undefined, 'general')
  }, [busy, getAgent, language])

  const newGift = useCallback(() => {
    if (busy) return
    agentsRef.current.delete(NEW_GIFT_KEY)
    activeGiftIdRef.current = undefined
    creatingGiftRef.current = true
    setActiveGiftId(undefined)
    setCreatingGift(true)
    const welcome = [welcomeMessage(language)]
    messagesRef.current = welcome
    setMessages(welcome)
    setInput(sessionRef.current.drafts[''] ?? '')
    setToolsOpen(false)
    setActiveTab('craft')
    setConversationOpen(true)
  }, [busy, language])

  const checkStorage = useCallback(async () => {
    try {
      setStorageStatus(await giftStore.getStorageStatus())
      setStorageError('')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    if (storageStatus?.granted) return
    const initial = window.setTimeout(() => void checkStorage(), 0)
    const interval = window.setInterval(() => void checkStorage(), 1000)
    window.addEventListener('focus', checkStorage)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      window.removeEventListener('focus', checkStorage)
    }
  }, [checkStorage, storageStatus?.granted])

  useEffect(() => {
    if (!storageStatus?.granted) return
    let active = true
    void (async () => {
      const [initialGifts, initialConfig, session, generalHistory] = await Promise.all([
        giftStore.listGifts(), giftStore.getAgentConfig(), giftStore.getSession(), generalStore.getConversation(),
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
        const next = history.length ? history : [welcomeMessage(session.language ?? detectLanguage())]
        activeGiftIdRef.current = restored.id
        setActiveGiftId(restored.id)
        messagesRef.current = next
        setMessages(next)
        await getAgent(restored)
      } else {
        const next = generalHistory.length ? generalHistory : [welcomeMessage(session.language ?? detectLanguage())]
        generalMessagesRef.current = next
        setGeneralMessages(next)
        messagesRef.current = next
        setMessages(next)
        await getAgent(undefined, 'general')
      }
      if (active) setInput(session.drafts[restored?.id ?? GENERAL_SESSION_KEY] ?? '')
    })()
    return () => { active = false }
  }, [getAgent, storageStatus?.granted])

  useEffect(() => {
    sessionRef.current.activeTab = activeTab
    sessionRef.current.activeGiftId = activeGiftId
    sessionRef.current.language = language
    persistSession()
  }, [activeTab, activeGiftId, language, persistSession])

  useEffect(() => {
    const draftKey = activeGiftId ?? (creatingGift ? '' : GENERAL_SESSION_KEY)
    sessionRef.current.drafts[draftKey] = input
    const timeout = setTimeout(persistSession, 400)
    return () => clearTimeout(timeout)
  }, [input, activeGiftId, creatingGift, persistSession])

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
    if (!toolsOpen && !versionsOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setToolsOpen(false)
      setVersionsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [toolsOpen, versionsOpen])

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

  useEffect(() => {
    if (activeTab !== 'craft' || conversationOpen || gifts.length === 0) return
    let active = true
    void Promise.all(gifts.map(async (gift) => [gift.id, await giftStore.getConversation(gift.id)] as const)).then((entries) => {
      if (active) setConversationPreviews(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [activeTab, conversationOpen, gifts])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const prompt = input.trim()
    if (!prompt || busy) return
    setInput('')
    setBusy(true)
    addMessage('user', prompt)
    try {
      const agent = activeGift
        ? await getAgent(activeGift)
        : await getAgent(undefined, creatingGift ? 'gift' : 'general')
      await agent.run(prompt)
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
      setActiveTab('craft')
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
        creatingGiftRef.current = false
        setActiveGiftId(undefined)
        setCreatingGift(false)
        setConversationOpen(false)
        const history = await generalStore.getConversation()
        const next = history.length ? history : [welcomeMessage(language)]
        generalMessagesRef.current = next
        setGeneralMessages(next)
        messagesRef.current = next
        setMessages(next)
        setInput(sessionRef.current.drafts[GENERAL_SESSION_KEY] ?? '')
      }
      setDeleteCandidate(undefined)
      setToolsOpen(false)
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
  const suggestions = creatingGift ? giftSuggestions : generalSuggestions
  const composerPlaceholder = activeGift
    ? t('composer.giftPlaceholder')
    : creatingGift ? t('composer.placeholder') : t('composer.generalPlaceholder')
  const filteredInspirations = discoverCategory === 'all' ? inspirations : inspirations.filter((item) => item.category === discoverCategory)
  const normalizedGiftQuery = giftQuery.trim().toLocaleLowerCase(locale)
  const filteredGifts = normalizedGiftQuery
    ? gifts.filter((gift) => gift.name.toLocaleLowerCase(locale).includes(normalizedGiftQuery))
    : gifts
  const generalPreview = conversationPreview(generalMessages, t('workspace.generalHint'))
  const generalLastMessage = generalMessages.at(-1)
  const generalUpdatedAt = generalLastMessage?.id === 'welcome' ? undefined : generalLastMessage?.createdAt
  const formatListTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return new Intl.DateTimeFormat(locale, date.toDateString() === today
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric' }).format(date)
  }
  const subagentStatus = status.startsWith(SUBAGENT_STATUS_PREFIX)
  const baseStatus = subagentStatus ? status.slice(SUBAGENT_STATUS_PREFIX.length) : status
  const statusKey = `status.${baseStatus}`
  const statusText = (subagentStatus ? t('status.subagent') : '') + (
    baseStatus.startsWith(AGENT_ROUND_STATUS_PREFIX) ? t('status.working')
      : baseStatus === COMPACTION_STATUS ? t('status.compacting')
          : isMessageKey(statusKey) ? t(statusKey) : baseStatus)

  const startPrompt = (prompt: string) => {
    if (busy) return
    newGift()
    setInput(prompt)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const startGeneralPrompt = (prompt: string) => {
    if (busy) return
    setInput(prompt)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const continueGift = (gift: Gift) => {
    void openGift(gift)
  }

  const requestSharedStorage = async () => {
    try {
      await giftStore.requestStorageAccess()
      await checkStorage()
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error))
    }
  }

  if (!storageStatus?.granted) return <div className="app-shell">
    <main className="screen storage-screen">
      <CraftMark size="large" />
      <h1>{t('storage.title')}</h1>
      <p>{t('storage.body')}</p>
      {storageStatus?.path && <code>{storageStatus.path}</code>}
      {storageError && <p className="storage-error" role="alert">{storageError}</p>}
      <button className="primary-button" onClick={() => void requestSharedStorage()}>{t('storage.authorize')}<ChevronRight size={18} /></button>
      <small>{t('storage.hint')}</small>
    </main>
  </div>

  return <div className="app-shell">
    {!settingsOpen && activeTab === 'craft' && !conversationOpen && <main className="screen tab-screen craft-list-screen">
      <header className="section-header">
        <div><h1>{t('nav.craft')}</h1><p>{t('craft.conversationsHint')}</p></div>
        <button className="workspace-more" aria-label={t('workspace.newGiftAction')} disabled={busy} onClick={newGift}><Plus size={23} /></button>
      </header>
      <section className="conversation-list" aria-label={t('craft.conversations')}>
        <button className="conversation-row pinned" disabled={busy} onClick={() => void openGeneral()}>
          <span className="conversation-avatar general"><MessageCircle size={23} /></span>
          <span className="conversation-row-main">
            <span className="conversation-row-title"><strong>{t('workspace.general')}<Pin size={12} /></strong>{generalUpdatedAt && <time>{formatListTime(generalUpdatedAt)}</time>}</span>
            <small>{generalPreview}</small>
          </span>
        </button>
        {gifts.map((gift, index) => <button className="conversation-row" key={gift.id} disabled={busy} onClick={() => continueGift(gift)}>
          <span className={`conversation-avatar tone-${index % 4}`}><Blocks size={23} /></span>
          <span className="conversation-row-main">
            <span className="conversation-row-title"><strong>{gift.name}</strong><time>{formatListTime(gift.updatedAt)}</time></span>
            <small>{conversationPreview(conversationPreviews[gift.id], gift.releaseSnapshotId ? t('gift.published') : t('gift.developing'))}</small>
          </span>
        </button>)}
      </section>
    </main>}

    {!settingsOpen && activeTab === 'craft' && conversationOpen && <main className="screen craft-screen">
      <header className="workspace-header conversation-header">
        <button className="conversation-back" aria-label={t('craft.back')} disabled={busy} onClick={() => { setConversationOpen(false); setToolsOpen(false) }}><ArrowLeft size={22} /></button>
        <span className={`workspace-symbol ${activeGift || creatingGift ? 'gift' : ''}`}>
          {activeGift ? <Blocks size={19} /> : creatingGift ? <Plus size={20} /> : <MessageCircle size={19} />}
        </span>
        <span className="workspace-copy">
          <strong>{activeGift?.name ?? (creatingGift ? t('workspace.newGift') : t('workspace.general'))}</strong>
          <small>{activeGift ? (activeGift.releaseSnapshotId ? t('gift.published') : t('gift.developing')) : creatingGift ? t('workspace.newGiftHint') : t('workspace.generalHint')}</small>
        </span>
        {activeGift && <button className="workspace-more" aria-label={t('menu.more')} aria-expanded={toolsOpen} disabled={busy} onClick={() => setToolsOpen(true)}>
          <MoreHorizontal size={23} />
        </button>}
      </header>

      <section className={`conversation ${isWelcome ? 'welcome-conversation' : ''}`}>
        {isWelcome ? <div className="welcome">
          <CraftMark size="large" />
          <h1>{t(creatingGift ? 'welcome.title' : 'welcome.generalTitle')}</h1>
          <p>{t(creatingGift ? 'welcome.subtitle' : 'welcome.generalSubtitle')}</p>
          <p className="suggestion-label">{t(creatingGift ? 'welcome.suggestions' : 'welcome.generalSuggestions')}</p>
          <div className="suggestion-list">
            {suggestions.map(({ key, icon: Icon, prompt }) => <button className="suggestion" key={key} onClick={() => creatingGift ? startPrompt(t(prompt)) : startGeneralPrompt(t(prompt))}>
              <span className="suggestion-icon"><Icon size={19} /></span><span><strong>{t(`${key}.title`)}</strong><small>{t(`${key}.subtitle`)}</small></span><ChevronRight size={17} />
            </button>)}
          </div>
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
        <form className="composer" onSubmit={send}>
          <textarea ref={composerRef} aria-label={composerPlaceholder} value={input} rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={composerPlaceholder} />
          <button className="send-button" aria-label={t('composer.send')} disabled={busy || !input.trim()} type="submit">
            {busy ? <LoaderCircle className="spin" size={19} /> : <ArrowUp size={20} />}
          </button>
        </form>
      </div>
    </main>}

    {!settingsOpen && activeTab === 'discover' && <main className="screen tab-screen discover-screen">
      <header className="section-header"><div><h1>{t('discover.title')}</h1><p>{t('discover.subtitle')}</p></div></header>
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

    {!settingsOpen && activeTab === 'gifts' && <main className="screen tab-screen gifts-screen">
      <header className="section-header">
        <div><h1>{t('gifts.title')}</h1><p>{t('gifts.subtitle')}</p></div>
        <button className="workspace-more" aria-label={t('workspace.newGiftAction')} disabled={busy} onClick={newGift}><Plus size={23} /></button>
      </header>
      <label className="gift-search"><Search size={18} /><input type="search" aria-label={t('gifts.search')} placeholder={t('gifts.search')} value={giftQuery} onChange={(event) => setGiftQuery(event.target.value)} /></label>
      {gifts.length === 0 ? <div className="empty-gifts">
        <span><Lightbulb size={29} /></span><h2>{t('empty.title')}</h2><p>{t('empty.body')}</p>
        <button className="primary-button" onClick={() => startPrompt('')}>{t('empty.cta')}<ArrowUp size={17} /></button>
      </div> : filteredGifts.length === 0 ? <div className="gift-search-empty"><Search size={24} /><p>{t('gifts.noResults')}</p></div> : <section className="gift-list" aria-label={t('gifts.aria')}>
        {filteredGifts.map((gift, index) => <button className="gift-row" key={gift.id} disabled={busy} onClick={() => continueGift(gift)}>
          <span className={`gift-icon tone-${index % 4}`}><Blocks size={22} /></span>
          <span className="gift-info">
            <span className="gift-title"><strong>{gift.name}</strong></span>
            <small><i className={gift.releaseSnapshotId ? 'published' : ''} />{gift.releaseSnapshotId ? t('gift.published') : t('gift.developing')} · {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(gift.updatedAt)}</small>
          </span>
          <ChevronRight className="gift-chevron" size={17} />
        </button>)}
      </section>}
    </main>}

    {!settingsOpen && activeTab === 'profile' && <main className="screen tab-screen profile-screen">
      <header className="section-header"><div><h1>{t('nav.profile')}</h1></div></header>
      <p className="menu-label profile-menu-label">{t('profile.settings')}</p>
      <section className="settings-list">
        <button onClick={() => setSettingsOpen(true)}><span className="settings-icon"><Sparkles size={19} /></span><span><strong>{t('profile.model')}</strong><small>{config.model || t('profile.modelHint')}</small></span><ChevronRight size={18} /></button>
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

    {!settingsOpen && !conversationOpen && <nav className="bottom-nav" aria-label={t('nav.craft')}>
      {([
        { id: 'craft', label: t('nav.craft'), icon: Sparkles },
        { id: 'gifts', label: t('nav.gifts'), icon: LayoutGrid },
        { id: 'discover', label: t('nav.discover'), icon: Compass },
        { id: 'profile', label: t('nav.profile'), icon: CircleUserRound },
      ] as { id: Tab; label: string; icon: LucideIcon }[]).map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}>
        <span><Icon size={22} strokeWidth={1.9} /></span><small>{label}</small>
      </button>)}
    </nav>}

    {toolsOpen && <>
      <button className="tools-dismiss" aria-label={t('menu.close')} onClick={() => setToolsOpen(false)} />
      <section className="tools-menu" role="menu" aria-label={t('menu.more')}>
        {conversationOpen && activeGift && <>
          <button role="menuitem" onClick={() => { setToolsOpen(false); setVersionsOpen(true) }}><FolderGit2 size={18} /><span>{t('menu.versions')}</span><ChevronRight size={15} /></button>
          {activeGift.releaseSnapshotId && <button role="menuitem" onClick={() => { setToolsOpen(false); void runtime.openRelease(activeGift.id, activeGift.name) }}><Play size={18} /><span>{t('menu.openRelease')}</span><ChevronRight size={15} /></button>}
          <button className={`danger-menu-item ${deleteCandidate === activeGift.id ? 'confirming' : ''}`} role="menuitem" disabled={busy} onClick={() => void deleteGift(activeGift)}><Trash2 size={18} /><span>{deleteCandidate === activeGift.id ? t('gift.deleteConfirm') : t('gift.delete', { name: activeGift.name })}</span></button>
        </>}
      </section>
    </>}

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
