import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import {
  ArrowLeft, ArrowUp, BarChart3, Blocks, BookOpen, CalendarCheck2, Check, ChevronRight, CircleUserRound,
  Clock3, Compass, FlaskConical, FolderGit2, GlassWater, LayoutGrid, Lightbulb,
  LoaderCircle, Map, MessageCircle, MessageSquare, NotebookPen, Rocket,
  ShieldCheck, Sparkles, Timer, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AgentRuntime } from './agent/AgentRuntime'
import { projectStore, runtime, setBrowserRuntime } from './native/craft'
import type { BrowserRuntimeHandler } from './native/craft'
import { createOfflineTodo } from './sample'
import type { AgentConfig, AppDescriptor, BuildArtifact, ChatMessage, Snapshot } from './types'
import './styles.css'

interface BrowserPreviewState {
  appId: string
  title: string
  environment: 'draft' | 'release'
  build: BuildArtifact
  runtimeSource: string
}

interface PreviewWindow extends Window {
  __craftLogs?: string[]
}

function BrowserPreview({ preview, iframeRef, onClose }: {
  preview: BrowserPreviewState
  iframeRef: RefObject<HTMLIFrameElement | null>
  onClose: () => void
}) {
  const escapeScript = (source: string) => source.replace(/<\/script/gi, '<\\/script')
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preview.build.css}</style></head><body><div id="root"></div><script>
window.__craftLogs=[];
for (const level of ['log','warn','error']) { const original=console[level]; console[level]=(...args)=>{window.__craftLogs.push(level+': '+args.map(String).join(' '));original(...args)} }
window.addEventListener('error',event=>window.__craftLogs.push('error: '+event.message));
window.addEventListener('unhandledrejection',event=>window.__craftLogs.push('rejection: '+String(event.reason)));
</script><script>window.CRAFT_CONTEXT=${JSON.stringify({ appId: preview.appId, environment: preview.environment })}</script><script>${escapeScript(preview.runtimeSource)}</script><script>${escapeScript(preview.build.js)}</script></body></html>`
  return <div className="browser-preview">
    <div className="preview-bar"><strong>{preview.title} · {preview.environment === 'draft' ? 'Draft' : 'Release'}</strong><button onClick={onClose}>关闭</button></div>
    <iframe ref={iframeRef} title={preview.title} sandbox="allow-scripts allow-same-origin" srcDoc={html} />
  </div>
}

type Tab = 'chat' | 'discover' | 'apps' | 'profile'

interface Inspiration {
  name: string
  description: string
  category: string
  icon: LucideIcon
  tone: string
  prompt: string
}

const inspirations: Inspiration[] = [
  { name: '专注计时器', description: '专注一会儿，看见每天的进步', category: '效率', icon: Timer, tone: 'mint', prompt: '做一个专注计时器，支持 25 分钟专注、休息计时、本地记录每天完成的专注次数，界面安静克制。' },
  { name: '轻量记账', description: '简单记录，清楚每笔收支', category: '财务', icon: BarChart3, tone: 'blue', prompt: '做一个轻量记账应用，支持收入和支出分类、本地保存、月度统计和收支趋势。' },
  { name: '习惯打卡', description: '把想坚持的事变成日常', category: '效率', icon: CalendarCheck2, tone: 'orange', prompt: '做一个习惯打卡应用，可以创建习惯、每天打卡、查看连续天数和本周完成情况。' },
  { name: '旅行手帐', description: '收藏路上的风景和故事', category: '生活', icon: Map, tone: 'lavender', prompt: '做一个旅行手帐应用，按旅程记录地点、日期和文字，支持本地图片与回顾视图。' },
  { name: '单词卡片', description: '利用碎片时间轻松记忆', category: '学习', icon: BookOpen, tone: 'yellow', prompt: '做一个单词卡片应用，支持正反面翻卡、认识和不认识标记、本地词库与学习进度。' },
  { name: '喝水记录', description: '一杯一杯，完成今日目标', category: '生活', icon: GlassWater, tone: 'cyan', prompt: '做一个喝水记录应用，可以设置每日目标、快捷记录饮水量、查看今日进度和历史趋势。' },
]

const chatSuggestions = [
  { title: '做一个记账应用', subtitle: '收支记录与每月统计', icon: BarChart3, prompt: inspirations[1].prompt },
  { title: '做一个习惯打卡', subtitle: '追踪目标与连续天数', icon: CalendarCheck2, prompt: inspirations[2].prompt },
  { title: '做一个灵感笔记', subtitle: '随时记录，快速查找', icon: NotebookPen, prompt: '做一个灵感笔记应用，支持快速记录、标签分类、全文搜索和本地保存。' },
]

function CraftMark({ size = 'normal' }: { size?: 'small' | 'normal' | 'large' }) {
  return <span className={`craft-mark ${size}`}><Blocks strokeWidth={2.2} /></span>
}

const initialMessage: ChatMessage = {
  id: 'welcome', role: 'assistant', createdAt: Date.now(),
  text: '告诉我你想做什么应用。我会创建源码、在本地编译，再打开真实预览进行测试。',
}

export default function App() {
  const [apps, setApps] = useState<AppDescriptor[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [discoverCategory, setDiscoverCategory] = useState('全部')
  const [notice, setNotice] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [config, setConfig] = useState<AgentConfig>({ apiKey: '', baseUrl: '', model: '', reasoningEffort: 'high' })
  const [activeAppId, setActiveAppId] = useState<string>()
  const [versions, setVersions] = useState<Snapshot[]>([])
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<{ action: string; resolve: (approved: boolean) => void }>()
  const [browserPreview, setBrowserPreview] = useState<BrowserPreviewState>()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const refreshApps = useCallback(async () => {
    setApps(await projectStore.listApps())
  }, [])

  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    const message = { id: crypto.randomUUID(), role, text, createdAt: Date.now() }
    setMessages((current) => current.length === 1 && current[0].id === 'welcome' ? [message] : [...current, message])
  }, [])

  const agent = useMemo(() => new AgentRuntime({
    onStatus: setStatus,
    onAssistant: (text) => addMessage('assistant', text),
    onAppsChanged: refreshApps,
    onAppSelected: (app) => setActiveAppId(app.id),
    confirm: (action) => {
      const { promise, resolve } = Promise.withResolvers<boolean>()
      setConfirmation({ action, resolve })
      return promise
    },
  }), [addMessage, refreshApps])

  useEffect(() => {
    let active = true
    void (async () => {
      const [initialApps, initialConfig] = await Promise.all([projectStore.listApps(), projectStore.getAgentConfig()])
      if (active) {
        setApps(initialApps)
        setConfig(initialConfig)
      }
    })()
    return () => { active = false }
  }, [])

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
    if (activeAppId && versionsOpen) void projectStore.listSnapshots(activeAppId).then(setVersions)
  }, [activeAppId, versionsOpen])

  useEffect(() => {
    let runtimeSource: string | undefined
    const open = async (appId: string, title: string, environment: 'draft' | 'release') => {
      const build = environment === 'draft' ? await projectStore.getDraftBuild(appId) : await projectStore.getReleaseBuild(appId)
      runtimeSource ??= await fetch('/craft-runtime.js').then((response) => response.text())
      setBrowserPreview({ appId, title, environment, build, runtimeSource })
    }
    const frame = () => iframeRef.current?.contentWindow as PreviewWindow | null
    const document = () => iframeRef.current?.contentDocument
    const handler: BrowserRuntimeHandler = {
      open,
      close: async () => setBrowserPreview(undefined),
      inspect: async () => {
        const doc = document()
        if (!doc) throw new Error('No browser preview')
        const tree = Array.from(doc.querySelectorAll<HTMLElement>('button,input,textarea,select,h1,h2,h3,[role],[data-testid]'))
          .filter((element) => element.getClientRects().length > 0)
          .slice(0, 100)
          .map((element) => {
            const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.getAttribute('placeholder') ?? ''
            return `${element.tagName.toLowerCase()} testId=${element.dataset.testid ?? ''} label=${label}`
          }).join('\n')
        return { tree, title: doc.title, url: frame()?.location.href ?? 'about:srcdoc' }
      },
      click: async (options) => {
        const doc = document()
        const element = options.testId
          ? doc?.querySelector<HTMLElement>(`[data-testid="${CSS.escape(options.testId)}"]`)
          : Array.from(doc?.querySelectorAll<HTMLElement>('button,[role="button"]') ?? [])
            .find((item) => item.textContent?.includes(options.text ?? ''))
        const coordinateTarget = options.x !== undefined && options.y !== undefined
          ? doc?.elementFromPoint(options.x, options.y) as HTMLElement | null : undefined
        const target = element ?? coordinateTarget
        if (!target) throw new Error('Preview click target not found')
        target.click()
      },
      input: async (options) => {
        const doc = document()
        const element = options.testId
          ? doc?.querySelector<HTMLInputElement>(`[data-testid="${CSS.escape(options.testId)}"]`)
          : Array.from(doc?.querySelectorAll<HTMLInputElement>('input,textarea') ?? [])
            .find((item) => item.getAttribute('aria-label') === options.label || item.placeholder === options.label)
        if (!element) throw new Error('Preview input target not found')
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, options.value)
        const win = frame()
        if (!win) throw new Error('Preview window not found')
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      },
      logs: async () => frame()?.__craftLogs ?? [],
    }
    setBrowserRuntime(handler)
  }, [])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const prompt = input.trim()
    if (!prompt || busy) return
    setInput('')
    setBusy(true)
    addMessage('user', prompt)
    try {
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
    setStatus('Building the offline Todo validation app')
    try {
      const app = await createOfflineTodo()
      setActiveAppId(app.id)
      await refreshApps()
      addMessage('assistant', '离线 Todo 已通过多文件 TSX 编译、UI 输入/点击、语义检查、快照和发布；Android 同时验证了真实截图。未调用模型。')
    } catch (error) {
      addMessage('assistant', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault()
    await projectStore.setAgentConfig(config)
    setSettingsOpen(false)
    setNotice('模型配置已保存')
  }

  const rollback = async (snapshot: Snapshot) => {
    if (!activeAppId) return
    setBusy(true)
    try {
      await projectStore.rollback(activeAppId, snapshot.id)
      setVersions(await projectStore.listSnapshots(activeAppId))
      await refreshApps()
      setVersionsOpen(false)
      setActiveTab('chat')
      addMessage('assistant', `已回滚到 ${snapshot.message}。`)
    } catch (error) {
      addMessage('assistant', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const activeApp = apps.find((app) => app.id === activeAppId)
  const isWelcome = messages.length === 1 && messages[0].id === 'welcome' && !status
  const filteredInspirations = discoverCategory === '全部'
    ? inspirations : inspirations.filter((item) => item.category === discoverCategory)
  const statusText = status.startsWith('Agent round') ? '正在思考…' : ({
    create_app: '正在创建项目…', select_app: '正在打开项目…', list_files: '正在查看项目文件…',
    read_file: '正在阅读代码…', write_file: '正在编写代码…', build_app: '正在编译并打开预览…',
    inspect_preview: '正在检查界面结构…', screenshot_preview: '正在查看真实截图…',
    click_preview: '正在测试界面交互…', input_preview: '正在测试输入…', preview_logs: '正在检查运行日志…',
    publish_app: '正在准备发布…', 'Building the offline Todo validation app': '正在运行离线验证…',
  } as Record<string, string>)[status] ?? status

  const startPrompt = (prompt: string) => {
    setActiveTab('chat')
    setInput(prompt)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const continueApp = (app: AppDescriptor) => {
    setActiveAppId(app.id)
    setActiveTab('chat')
    setNotice(`已切换到 ${app.name}`)
  }

  return <div className="app-shell">
    {!settingsOpen && activeTab === 'chat' && <main className="screen chat-screen">
      <section className={`conversation ${isWelcome ? 'welcome-conversation' : ''}`}>
        {isWelcome ? <div className="welcome">
          <CraftMark size="large" />
          <h1>想做什么，直接告诉我。</h1>
          <p>描述一个想法，Craft 会写代码、运行并测试。</p>
          <div className="suggestion-list">
            {chatSuggestions.map(({ title, subtitle, icon: Icon, prompt }) => <button className="suggestion" key={title} onClick={() => startPrompt(prompt)}>
              <Icon size={19} /><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={17} />
            </button>)}
          </div>
          <button className="offline-link" disabled={busy} onClick={() => void runOfflineCheck()}>
            <FlaskConical size={16} />先试试离线验证<ChevronRight size={15} />
          </button>
        </div> : <div className="message-list">
          {messages.map((message) => <article className={`message ${message.role}`} key={message.id}>
            {message.role === 'assistant' && <div className="assistant-label"><CraftMark size="small" /><strong>Craft</strong></div>}
            <div className="message-content">{message.text}</div>
          </article>)}
          {status && <div className="working"><LoaderCircle className="spin" size={17} /><span>{statusText}</span></div>}
          {confirmation && <div className="confirmation">
            <span className="confirmation-icon"><Rocket size={20} /></span>
            <div><strong>{confirmation.action}</strong><p>当前 Draft 已通过构建，将保存为新的正式版本。</p></div>
            <div className="confirmation-actions">
              <button onClick={() => { confirmation.resolve(false); setConfirmation(undefined) }}>取消</button>
              <button className="primary-button" onClick={() => { confirmation.resolve(true); setConfirmation(undefined) }}><Check size={16} />确认发布</button>
            </div>
          </div>}
          <div ref={messagesEndRef} />
        </div>}
      </section>

      <div className="composer-area">
        {activeApp && <button className="project-context" onClick={() => setVersionsOpen(true)}>
          <FolderGit2 size={15} /><span>{activeApp.name}</span><small>{activeApp.releaseSnapshotId ? '已发布' : '开发中'}</small><ChevronRight size={14} />
        </button>}
        <form className="composer" onSubmit={send}>
          <textarea ref={composerRef} aria-label="开发需求" value={input} rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="描述你想做的应用…" />
          <div className="composer-footer">
            <button className="composer-tool" type="button" aria-label="离线验证" disabled={busy} onClick={() => void runOfflineCheck()}><FlaskConical size={17} /><span>离线验证</span></button>
            <button className="send-button" aria-label="发送需求" disabled={busy || !input.trim()} type="submit">
              {busy ? <LoaderCircle className="spin" size={19} /> : <ArrowUp size={20} />}
            </button>
          </div>
        </form>
      </div>
    </main>}

    {!settingsOpen && activeTab === 'discover' && <main className="screen tab-screen discover-screen">
      <article className="featured-card">
        <span className="eyebrow">本周精选 · 效率</span>
        <div className="featured-icon"><Timer size={29} /></div>
        <h2>专注计时器</h2>
        <p>把大目标拆成每一个 25 分钟</p>
        <button onClick={() => startPrompt(inspirations[0].prompt)}>用这个灵感创作<ArrowUp size={17} /></button>
      </article>
      <div className="category-tabs" aria-label="模板分类">
        {['全部', '效率', '生活', '财务', '学习'].map((category) => <button key={category} className={discoverCategory === category ? 'active' : ''} onClick={() => setDiscoverCategory(category)}>{category}</button>)}
      </div>
      <section className="inspiration-grid" aria-label="应用灵感">
        {filteredInspirations.map(({ name, description, icon: Icon, tone, prompt }) => <button className="inspiration-card" key={name} onClick={() => startPrompt(prompt)}>
          <span className={`template-icon ${tone}`}><Icon size={23} /></span>
          <strong>{name}</strong><p>{description}</p><span className="use-template">使用模板<ArrowUp size={14} /></span>
        </button>)}
      </section>
    </main>}

    {!settingsOpen && activeTab === 'apps' && <main className="screen tab-screen">
      {apps.length === 0 ? <div className="empty-projects">
        <span><Lightbulb size={29} /></span><h2>下一个应用，从一句话开始</h2><p>告诉 Craft 你的想法，它会完成代码、预览和测试。</p>
        <button className="primary-button" onClick={() => startPrompt('')}>开始第一个项目<ArrowUp size={17} /></button>
      </div> : <section className="project-list" aria-label="我的应用项目">
        {apps.map((app, index) => <article className="project-row" key={app.id}>
          <button className="project-open" disabled={!app.releaseSnapshotId} onClick={() => void runtime.openRelease(app.id, app.name)}>
            <span className={`project-icon tone-${index % 4}`}><Blocks size={22} /></span>
            <span className="project-info"><strong>{app.name}</strong><small><i className={app.releaseSnapshotId ? 'published' : ''} />{app.releaseSnapshotId ? '已发布' : '开发中'} · {new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(app.updatedAt)}</small></span>
            {app.releaseSnapshotId ? <ChevronRight className="project-chevron" size={18} /> : null}
          </button>
          <button className="project-edit" aria-label={`继续开发 ${app.name}`} onClick={() => continueApp(app)}><MessageSquare size={18} /></button>
        </article>)}
      </section>}
    </main>}

    {!settingsOpen && activeTab === 'profile' && <main className="screen tab-screen profile-screen">
      <section className="profile-card"><CraftMark size="large" /><div><h2>个人工作区</h2><p>{apps.length} 个项目 · {apps.filter((app) => app.releaseSnapshotId).length} 个已发布</p></div></section>
      <p className="menu-label">工作区设置</p>
      <section className="settings-list">
        <button onClick={() => setSettingsOpen(true)}><span className="settings-icon"><Sparkles size={19} /></span><span><strong>模型设置</strong><small>{config.model || '配置你的 AI 模型'}</small></span><ChevronRight size={18} /></button>
        <button disabled={busy} onClick={() => void runOfflineCheck()}><span className="settings-icon"><FlaskConical size={19} /></span><span><strong>离线验证</strong><small>不调用模型，测试完整构建链路</small></span><ChevronRight size={18} /></button>
      </section>
      <p className="menu-label">关于</p>
      <section className="settings-list static-list">
        <div><span className="settings-icon"><ShieldCheck size={19} /></span><span><strong>数据保存在本机</strong><small>项目、版本与密钥不离开设备</small></span></div>
        <div><span className="settings-icon"><Blocks size={19} /></span><span><strong>Craft</strong><small>验证版 0.1.0</small></span></div>
      </section>
    </main>}

    {!settingsOpen && <nav className="bottom-nav" aria-label="主导航">
      {([
        { id: 'chat', label: '对话', icon: MessageCircle },
        { id: 'discover', label: '广场', icon: Compass },
        { id: 'apps', label: '应用', icon: LayoutGrid },
        { id: 'profile', label: '我的', icon: CircleUserRound },
      ] as { id: Tab; label: string; icon: LucideIcon }[]).map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}>
        <span><Icon size={22} strokeWidth={activeTab === id ? 2.3 : 1.8} /></span><small>{label}</small>
      </button>)}
    </nav>}

    {settingsOpen && <main className="screen settings-page">
      <header className="page-header">
        <button className="page-back" aria-label="返回我的" onClick={() => setSettingsOpen(false)}><ArrowLeft size={22} /></button>
        <h1>模型设置</h1>
        <span className="page-header-spacer" />
      </header>
      <div className="settings-page-content">
        <form className="settings-form" onSubmit={(event) => void saveSettings(event)}>
          <section className="settings-group" aria-label="模型服务">
            <p className="settings-group-title">模型服务</p>
            <div className="settings-fields">
              <label>API Key<div className="field"><input type="password" autoComplete="off" placeholder="sk-…" value={config.apiKey} onChange={(event) => setConfig({ ...config, apiKey: event.target.value })} /></div></label>
              <label>接口地址<div className="field"><input inputMode="url" placeholder="https://…/v1/chat/completions" value={config.baseUrl} onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })} /></div></label>
              <label>模型名称<div className="field"><input placeholder="例如 gpt-4.1-mini" value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} /></div></label>
            </div>
          </section>
          <section className="settings-group" aria-label="生成偏好">
            <p className="settings-group-title">生成偏好</p>
            <div className="reasoning-setting">
              <div><strong>思考强度</strong><small>更高强度通常更慢，也会消耗更多 Token</small></div>
              <div className="effort-options" role="group" aria-label="思考强度">
                {([
                  { value: 'none', label: '关闭' },
                  { value: 'low', label: '低' },
                  { value: 'medium', label: '中' },
                  { value: 'high', label: '高' },
                ] as const).map((option) => <button key={option.value} type="button" className={config.reasoningEffort === option.value ? 'active' : ''} aria-pressed={config.reasoningEffort === option.value} onClick={() => setConfig({ ...config, reasoningEffort: option.value })}>{option.label}</button>)}
              </div>
              <p className="settings-help">随 reasoning_effort 发送；实际效果取决于模型支持。</p>
            </div>
          </section>
          <p className="security-note"><ShieldCheck size={15} />API Key 将加密保存在本机</p>
          <button className="save-button" type="submit">保存配置<Check size={18} /></button>
        </form>
      </div>
    </main>}

    {versionsOpen && activeApp && <div className="sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setVersionsOpen(false) }}>
      <section className="bottom-sheet versions-sheet" role="dialog" aria-modal="true" aria-label="版本记录">
        <div className="sheet-handle" />
        <header><div><h2>版本记录</h2><p>{activeApp.name}</p></div><button className="round-icon" aria-label="关闭版本记录" onClick={() => setVersionsOpen(false)}><X size={19} /></button></header>
        <div className="version-list">
          {versions.length === 0 ? <div className="empty-versions"><Clock3 size={25} /><p>还没有快照</p></div> : versions.map((snapshot, index) => <div className="version-row" key={snapshot.id}>
            <span className="version-node">{index === 0 ? <Check size={15} /> : null}</span>
            <div><strong>{snapshot.message}</strong><small>{new Date(snapshot.createdAt).toLocaleString()}</small></div>
            <button disabled={busy || !snapshot.buildId} onClick={() => void rollback(snapshot)}>回滚</button>
          </div>)}
        </div>
      </section>
    </div>}

    {notice && <div className="toast"><Check size={16} />{notice}</div>}
    {browserPreview && <BrowserPreview preview={browserPreview} iframeRef={iframeRef} onClose={() => setBrowserPreview(undefined)} />}
  </div>
}
