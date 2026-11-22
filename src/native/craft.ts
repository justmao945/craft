import { registerPlugin } from '@capacitor/core'
import type { AgentConfig, ChatMessage, Gift, SessionState, Snapshot, StorageStatus, Workspace } from '../types'

interface CraftGiftPlugin {
  getStorageStatus(): Promise<StorageStatus>
  requestStorageAccess(): Promise<{ ok: boolean }>
  listGifts(): Promise<{ gifts: Gift[] }>
  createGift(options: { name: string }): Promise<{ gift: Gift }>
  deleteGift(options: { giftId: string }): Promise<{ ok: boolean }>
  getWorkspace(options: { giftId: string }): Promise<Workspace>
  listFiles(options: { giftId: string }): Promise<{ files: string[] }>
  readFile(options: { giftId: string; path: string }): Promise<{ content: string }>
  writeFile(options: { giftId: string; path: string; content: string }): Promise<{ ok: boolean }>
  createSnapshot(options: { giftId: string; message: string }): Promise<{ snapshot: Snapshot }>
  listSnapshots(options: { giftId: string }): Promise<{ snapshots: Snapshot[] }>
  saveBuild(options: { giftId: string; snapshotId?: string; js: string; css: string; draft: boolean }): Promise<{ buildId: string }>
  publish(options: { giftId: string; snapshotId: string }): Promise<{ gift: Gift }>
  rollback(options: { giftId: string; snapshotId: string }): Promise<{ gift: Gift; snapshot: Snapshot }>
  getConversation(options: { giftId: string }): Promise<{ json: string }>
  saveConversation(options: { giftId: string; json: string }): Promise<{ ok: boolean }>
  getModelContext(options: { giftId: string }): Promise<{ jsonl: string }>
  saveModelContext(options: { giftId: string; jsonl: string }): Promise<{ ok: boolean }>
  archiveModelContext(options: { giftId: string; jsonl: string }): Promise<{ file: string }>
  listContextArchives(options: { giftId: string }): Promise<{ files: string[] }>
  readContextArchive(options: { giftId: string; file: string }): Promise<{ jsonl: string }>
  listGeneralFiles(): Promise<{ files: string[] }>
  readGeneralFile(options: { path: string }): Promise<{ content: string }>
  writeGeneralFile(options: { path: string; content: string }): Promise<{ ok: boolean }>
  getGeneralConversation(): Promise<{ json: string }>
  saveGeneralConversation(options: { json: string }): Promise<{ ok: boolean }>
  getGeneralModelContext(): Promise<{ jsonl: string }>
  saveGeneralModelContext(options: { jsonl: string }): Promise<{ ok: boolean }>
  archiveGeneralModelContext(options: { jsonl: string }): Promise<{ file: string }>
  listGeneralContextArchives(): Promise<{ files: string[] }>
  readGeneralContextArchive(options: { file: string }): Promise<{ jsonl: string }>
  getSession(): Promise<{ json: string }>
  saveSession(options: { json: string }): Promise<{ ok: boolean }>
  setAgentConfig(options: AgentConfig): Promise<{ ok: boolean }>
  getAgentConfig(): Promise<AgentConfig>
}

export interface RuntimeSnapshot {
  dataUrl: string
}

export interface Inspection {
  tree: string
  title: string
  url: string
}

interface CraftRuntimePlugin {
  openDraft(options: { giftId: string; title: string }): Promise<{ ok: boolean }>
  openRelease(options: { giftId: string; title: string }): Promise<{ ok: boolean }>
  closePreview(options?: Record<string, never>): Promise<{ ok: boolean }>
  screenshot(options?: Record<string, never>): Promise<RuntimeSnapshot>
  inspect(options?: Record<string, never>): Promise<Inspection>
  click(options: { testId?: string; text?: string; x?: number; y?: number }): Promise<{ ok: boolean }>
  input(options: { testId?: string; label?: string; value: string }): Promise<{ ok: boolean }>
  logs(options?: Record<string, never>): Promise<{ logs: string[] }>
}

const giftPlugin = registerPlugin<CraftGiftPlugin>('CraftGift')
const preview = registerPlugin<CraftRuntimePlugin>('CraftRuntime')

const defaultConfig: AgentConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-flash',
  reasoningEffort: 'high',
}

/** DeepSeek compatibility aliases: minimal->low, medium/xhigh->high. */
function normalizeEffort(effort: string): AgentConfig['reasoningEffort'] {
  if (effort === 'none' || effort === 'low' || effort === 'high' || effort === 'max') return effort
  if (effort === 'minimal') return 'low'
  return 'high'
}

function assertPath(path: string): void {
  if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid workspace path')
}

/** Android-native Gift storage; every method rejects on native errors. */
export const giftStore = {
  async getStorageStatus(): Promise<StorageStatus> {
    return giftPlugin.getStorageStatus()
  },

  async requestStorageAccess(): Promise<void> {
    await giftPlugin.requestStorageAccess()
  },

  async listGifts(): Promise<Gift[]> {
    return (await giftPlugin.listGifts()).gifts
  },

  async createGift(name: string): Promise<Gift> {
    return (await giftPlugin.createGift({ name })).gift
  },

  /** Deletes registry entry, workspace git repo, snapshots, builds, conversation and model context. */
  async deleteGift(giftId: string): Promise<void> {
    await giftPlugin.deleteGift({ giftId })
  },

  async getWorkspace(giftId: string): Promise<Workspace> {
    return giftPlugin.getWorkspace({ giftId })
  },

  async listFiles(giftId: string): Promise<string[]> {
    return (await giftPlugin.listFiles({ giftId })).files
  },

  async readFile(giftId: string, path: string): Promise<string> {
    assertPath(path)
    return (await giftPlugin.readFile({ giftId, path })).content
  },

  async writeFile(giftId: string, path: string, content: string): Promise<void> {
    assertPath(path)
    await giftPlugin.writeFile({ giftId, path, content })
  },

  /** Commits the whole workspace to its git repo; snapshot id is the commit hash. */
  async createSnapshot(giftId: string, message: string): Promise<Snapshot> {
    return (await giftPlugin.createSnapshot({ giftId, message })).snapshot
  },

  async listSnapshots(giftId: string): Promise<Snapshot[]> {
    return (await giftPlugin.listSnapshots({ giftId })).snapshots
  },

  async saveBuild(giftId: string, snapshotId: string | undefined, js: string, css: string, draft: boolean): Promise<string> {
    return (await giftPlugin.saveBuild({ giftId, snapshotId, js, css, draft })).buildId
  },

  async publish(giftId: string, snapshotId: string): Promise<Gift> {
    return (await giftPlugin.publish({ giftId, snapshotId })).gift
  },

  async rollback(giftId: string, snapshotId: string): Promise<void> {
    await giftPlugin.rollback({ giftId, snapshotId })
  },

  async getConversation(giftId: string): Promise<ChatMessage[]> {
    const { json } = await giftPlugin.getConversation({ giftId })
    return JSON.parse(json) as ChatMessage[]
  },

  async saveConversation(giftId: string, messages: ChatMessage[]): Promise<void> {
    const persisted = messages.filter((message) => message.role !== 'status')
    await giftPlugin.saveConversation({ giftId, json: JSON.stringify(persisted) })
  },

  /** Full model transcript (JSONL), including tool calls and reasoning; '' when none saved yet. */
  async getModelContext(giftId: string): Promise<string> {
    return (await giftPlugin.getModelContext({ giftId })).jsonl
  },

  async saveModelContext(giftId: string, jsonl: string): Promise<void> {
    await giftPlugin.saveModelContext({ giftId, jsonl })
  },

  /** Pre-compaction transcript, kept as a new timestamped file per compaction. */
  async archiveModelContext(giftId: string, jsonl: string): Promise<void> {
    await giftPlugin.archiveModelContext({ giftId, jsonl })
  },

  async listContextArchives(giftId: string): Promise<string[]> {
    return (await giftPlugin.listContextArchives({ giftId })).files
  },

  async readContextArchive(giftId: string, file: string): Promise<string> {
    return (await giftPlugin.readContextArchive({ giftId, file })).jsonl
  },

  async getSession(): Promise<SessionState> {
    const { json } = await giftPlugin.getSession()
    if (!json) return { drafts: {} }
    const session = JSON.parse(json) as SessionState
    const activeTab = (session.activeTab as string) === 'chat' ? 'craft' : session.activeTab
    return { ...session, activeTab, drafts: session.drafts ?? {} }
  },

  async saveSession(session: SessionState): Promise<void> {
    await giftPlugin.saveSession({ json: JSON.stringify(session) })
  },

  async getAgentConfig(): Promise<AgentConfig> {
    const config = await giftPlugin.getAgentConfig()
    return { ...defaultConfig, ...config, reasoningEffort: normalizeEffort(config.reasoningEffort) }
  },

  async setAgentConfig(config: AgentConfig): Promise<void> {
    await giftPlugin.setAgentConfig(config)
  },
}

/** Persistent general conversation and its fixed, project-independent workspace. */
export const generalStore = {
  async listFiles(): Promise<string[]> {
    return (await giftPlugin.listGeneralFiles()).files
  },

  async readFile(path: string): Promise<string> {
    assertPath(path)
    return (await giftPlugin.readGeneralFile({ path })).content
  },

  async writeFile(path: string, content: string): Promise<void> {
    assertPath(path)
    await giftPlugin.writeGeneralFile({ path, content })
  },

  async getConversation(): Promise<ChatMessage[]> {
    const { json } = await giftPlugin.getGeneralConversation()
    return JSON.parse(json) as ChatMessage[]
  },

  async saveConversation(messages: ChatMessage[]): Promise<void> {
    const persisted = messages.filter((message) => message.role !== 'status')
    await giftPlugin.saveGeneralConversation({ json: JSON.stringify(persisted) })
  },

  async getModelContext(): Promise<string> {
    return (await giftPlugin.getGeneralModelContext()).jsonl
  },

  async saveModelContext(jsonl: string): Promise<void> {
    await giftPlugin.saveGeneralModelContext({ jsonl })
  },

  async archiveModelContext(jsonl: string): Promise<void> {
    await giftPlugin.archiveGeneralModelContext({ jsonl })
  },

  async listContextArchives(): Promise<string[]> {
    return (await giftPlugin.listGeneralContextArchives()).files
  },

  async readContextArchive(file: string): Promise<string> {
    return (await giftPlugin.readGeneralContextArchive({ file })).jsonl
  },
}

export const runtime = {
  async openDraft(giftId: string, title: string): Promise<void> {
    await preview.openDraft({ giftId, title })
  },
  async openRelease(giftId: string, title: string): Promise<void> {
    await preview.openRelease({ giftId, title })
  },
  async closePreview(): Promise<void> {
    await preview.closePreview({})
  },
  async screenshot(): Promise<string> {
    return (await preview.screenshot({})).dataUrl
  },
  async inspect(): Promise<Inspection> {
    return preview.inspect({})
  },
  async click(options: { testId?: string; text?: string; x?: number; y?: number }): Promise<void> {
    await preview.click(options)
  },
  async input(options: { testId?: string; label?: string; value: string }): Promise<void> {
    await preview.input(options)
  },
  async logs(): Promise<string[]> {
    return (await preview.logs({})).logs
  },
}
