import { registerPlugin } from '@capacitor/core'
import type { AgentConfig, ChatMessage, Gift, SessionState, Snapshot, StorageStatus, Workspace } from '../types'

export interface CraftGiftPlugin {
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
  installSquareWork(options: { squareId: string; name: string; files: Record<string, string>; js: string; css: string; message: string }): Promise<{ gift: Gift }>
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

export interface CraftRuntimePlugin {
  openDraft(options: { giftId: string; title: string }): Promise<{ ok: boolean }>
  openRelease(options: { giftId: string; title: string }): Promise<{ ok: boolean }>
  closePreview(options?: Record<string, never>): Promise<{ ok: boolean }>
  screenshot(options?: Record<string, never>): Promise<RuntimeSnapshot>
  inspect(options?: Record<string, never>): Promise<Inspection>
  click(options: { testId?: string; text?: string; x?: number; y?: number }): Promise<{ ok: boolean }>
  input(options: { testId?: string; label?: string; value: string }): Promise<{ ok: boolean }>
  logs(options?: Record<string, never>): Promise<{ logs: string[] }>
}

/** The two native plugins; src/dev replaces them with in-memory fakes before the app renders. */
export const bridge = {
  gift: registerPlugin<CraftGiftPlugin>('CraftGift'),
  preview: registerPlugin<CraftRuntimePlugin>('CraftRuntime'),
}

/** gift.json of a new Gift workspace: entry and permissions the runtime relies on. */
export function giftManifest(gift: Gift): string {
  return JSON.stringify({ id: gift.id, name: gift.name, runtimeVersion: 1, entry: 'src/main.tsx', permissions: ['storage'] }, null, 2)
}

const defaultConfig: AgentConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-flash',
  reasoningEffort: 'high',
  contextWindow: 1_000_000,
  compactionPercent: 30,
}

function normalizeContextWindow(window: number | undefined): number {
  return Number.isFinite(window) && window! > 0 ? Math.floor(window!) : 1_000_000
}

function normalizeCompactionPercent(percent: number | undefined): number {
  return Number.isFinite(percent) && percent! > 0 && percent! <= 100 ? Math.floor(percent) : 30
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
    return bridge.gift.getStorageStatus()
  },

  async requestStorageAccess(): Promise<void> {
    await bridge.gift.requestStorageAccess()
  },

  async listGifts(): Promise<Gift[]> {
    return (await bridge.gift.listGifts()).gifts
  },

  async createGift(name: string): Promise<Gift> {
    return (await bridge.gift.createGift({ name })).gift
  },

  /** Creates a Gift from a Square work: its sources, a release build and the first published snapshot. */
  async installSquareWork(work: { squareId: string; name: string; files: Record<string, string>; js: string; css: string; message: string }): Promise<Gift> {
    return (await bridge.gift.installSquareWork(work)).gift
  },

  /** Deletes registry entry, workspace git repo, snapshots, builds, conversation and model context. */
  async deleteGift(giftId: string): Promise<void> {
    await bridge.gift.deleteGift({ giftId })
  },

  async getWorkspace(giftId: string): Promise<Workspace> {
    return bridge.gift.getWorkspace({ giftId })
  },

  async listFiles(giftId: string): Promise<string[]> {
    return (await bridge.gift.listFiles({ giftId })).files
  },

  async readFile(giftId: string, path: string): Promise<string> {
    assertPath(path)
    return (await bridge.gift.readFile({ giftId, path })).content
  },

  async writeFile(giftId: string, path: string, content: string): Promise<void> {
    assertPath(path)
    await bridge.gift.writeFile({ giftId, path, content })
  },

  /** Commits the whole workspace to its git repo; snapshot id is the commit hash. */
  async createSnapshot(giftId: string, message: string): Promise<Snapshot> {
    return (await bridge.gift.createSnapshot({ giftId, message })).snapshot
  },

  async listSnapshots(giftId: string): Promise<Snapshot[]> {
    return (await bridge.gift.listSnapshots({ giftId })).snapshots
  },

  async saveBuild(giftId: string, snapshotId: string | undefined, js: string, css: string, draft: boolean): Promise<string> {
    return (await bridge.gift.saveBuild({ giftId, snapshotId, js, css, draft })).buildId
  },

  async publish(giftId: string, snapshotId: string): Promise<Gift> {
    return (await bridge.gift.publish({ giftId, snapshotId })).gift
  },

  async rollback(giftId: string, snapshotId: string): Promise<void> {
    await bridge.gift.rollback({ giftId, snapshotId })
  },

  async getConversation(giftId: string): Promise<ChatMessage[]> {
    const { json } = await bridge.gift.getConversation({ giftId })
    return JSON.parse(json) as ChatMessage[]
  },

  async saveConversation(giftId: string, messages: ChatMessage[]): Promise<void> {
    const persisted = messages.filter((message) => message.role !== 'status')
    await bridge.gift.saveConversation({ giftId, json: JSON.stringify(persisted) })
  },

  /** Full model transcript (JSONL), including tool calls and reasoning; '' when none saved yet. */
  async getModelContext(giftId: string): Promise<string> {
    return (await bridge.gift.getModelContext({ giftId })).jsonl
  },

  async saveModelContext(giftId: string, jsonl: string): Promise<void> {
    await bridge.gift.saveModelContext({ giftId, jsonl })
  },

  /** Pre-compaction transcript, kept as a new timestamped file per compaction. */
  async archiveModelContext(giftId: string, jsonl: string): Promise<void> {
    await bridge.gift.archiveModelContext({ giftId, jsonl })
  },

  async listContextArchives(giftId: string): Promise<string[]> {
    return (await bridge.gift.listContextArchives({ giftId })).files
  },

  async readContextArchive(giftId: string, file: string): Promise<string> {
    return (await bridge.gift.readContextArchive({ giftId, file })).jsonl
  },

  async getSession(): Promise<SessionState> {
    const { json } = await bridge.gift.getSession()
    if (!json) return { drafts: {} }
    const session = JSON.parse(json) as SessionState
    const activeTab = (session.activeTab as string) === 'chat' ? 'craft' : session.activeTab
    return { ...session, activeTab, drafts: session.drafts ?? {} }
  },

  async saveSession(session: SessionState): Promise<void> {
    await bridge.gift.saveSession({ json: JSON.stringify(session) })
  },

  async getAgentConfig(): Promise<AgentConfig> {
    const config = await bridge.gift.getAgentConfig()
    return {
      ...defaultConfig, ...config,
      reasoningEffort: normalizeEffort(config.reasoningEffort),
      contextWindow: normalizeContextWindow(config.contextWindow),
      compactionPercent: normalizeCompactionPercent(config.compactionPercent),
    }
  },

  async setAgentConfig(config: AgentConfig): Promise<void> {
    await bridge.gift.setAgentConfig(config)
  },
}

/** Persistent general conversation and its fixed, project-independent workspace. */
export const generalStore = {
  async listFiles(): Promise<string[]> {
    return (await bridge.gift.listGeneralFiles()).files
  },

  async readFile(path: string): Promise<string> {
    assertPath(path)
    return (await bridge.gift.readGeneralFile({ path })).content
  },

  async writeFile(path: string, content: string): Promise<void> {
    assertPath(path)
    await bridge.gift.writeGeneralFile({ path, content })
  },

  async getConversation(): Promise<ChatMessage[]> {
    const { json } = await bridge.gift.getGeneralConversation()
    return JSON.parse(json) as ChatMessage[]
  },

  async saveConversation(messages: ChatMessage[]): Promise<void> {
    const persisted = messages.filter((message) => message.role !== 'status')
    await bridge.gift.saveGeneralConversation({ json: JSON.stringify(persisted) })
  },

  async getModelContext(): Promise<string> {
    return (await bridge.gift.getGeneralModelContext()).jsonl
  },

  async saveModelContext(jsonl: string): Promise<void> {
    await bridge.gift.saveGeneralModelContext({ jsonl })
  },

  async archiveModelContext(jsonl: string): Promise<void> {
    await bridge.gift.archiveGeneralModelContext({ jsonl })
  },

  async listContextArchives(): Promise<string[]> {
    return (await bridge.gift.listGeneralContextArchives()).files
  },

  async readContextArchive(file: string): Promise<string> {
    return (await bridge.gift.readGeneralContextArchive({ file })).jsonl
  },
}

export const runtime = {
  async openDraft(giftId: string, title: string): Promise<void> {
    await bridge.preview.openDraft({ giftId, title })
  },
  async openRelease(giftId: string, title: string): Promise<void> {
    await bridge.preview.openRelease({ giftId, title })
  },
  async closePreview(): Promise<void> {
    await bridge.preview.closePreview({})
  },
  async screenshot(): Promise<string> {
    return (await bridge.preview.screenshot({})).dataUrl
  },
  async inspect(): Promise<Inspection> {
    return bridge.preview.inspect({})
  },
  async click(options: { testId?: string; text?: string; x?: number; y?: number }): Promise<void> {
    await bridge.preview.click(options)
  },
  async input(options: { testId?: string; label?: string; value: string }): Promise<void> {
    await bridge.preview.input(options)
  },
  async logs(): Promise<string[]> {
    return (await bridge.preview.logs({})).logs
  },
}
