import { registerPlugin } from '@capacitor/core'
import type { AgentConfig, BuildArtifact, ChatMessage, Gift, SessionState, Snapshot, Workspace } from '../types'

interface CraftGiftPlugin {
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
  getDraftBuild(options: { giftId: string }): Promise<BuildArtifact>
  getReleaseBuild(options: { giftId: string }): Promise<BuildArtifact>
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

const project = registerPlugin<CraftGiftPlugin>('CraftGift')
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
  async listGifts(): Promise<Gift[]> {
    return (await project.listGifts()).gifts
  },

  async createGift(name: string): Promise<Gift> {
    return (await project.createGift({ name })).gift
  },

  /** Deletes registry entry, workspace git repo, snapshots, builds, conversation and model context. */
  async deleteGift(giftId: string): Promise<void> {
    await project.deleteGift({ giftId })
  },

  async getWorkspace(giftId: string): Promise<Workspace> {
    return project.getWorkspace({ giftId })
  },

  async listFiles(giftId: string): Promise<string[]> {
    return (await project.listFiles({ giftId })).files
  },

  async readFile(giftId: string, path: string): Promise<string> {
    assertPath(path)
    return (await project.readFile({ giftId, path })).content
  },

  async writeFile(giftId: string, path: string, content: string): Promise<void> {
    assertPath(path)
    await project.writeFile({ giftId, path, content })
  },

  /** Commits the whole workspace to its git repo; snapshot id is the commit hash. */
  async createSnapshot(giftId: string, message: string): Promise<Snapshot> {
    return (await project.createSnapshot({ giftId, message })).snapshot
  },

  async listSnapshots(giftId: string): Promise<Snapshot[]> {
    return (await project.listSnapshots({ giftId })).snapshots
  },

  async saveBuild(giftId: string, snapshotId: string | undefined, js: string, css: string, draft: boolean): Promise<string> {
    return (await project.saveBuild({ giftId, snapshotId, js, css, draft })).buildId
  },

  async getDraftBuild(giftId: string): Promise<BuildArtifact> {
    return project.getDraftBuild({ giftId })
  },

  async getReleaseBuild(giftId: string): Promise<BuildArtifact> {
    return project.getReleaseBuild({ giftId })
  },

  async publish(giftId: string, snapshotId: string): Promise<Gift> {
    return (await project.publish({ giftId, snapshotId })).gift
  },

  async rollback(giftId: string, snapshotId: string): Promise<void> {
    await project.rollback({ giftId, snapshotId })
  },

  async getConversation(giftId: string): Promise<ChatMessage[]> {
    const { json } = await project.getConversation({ giftId })
    return JSON.parse(json) as ChatMessage[]
  },

  async saveConversation(giftId: string, messages: ChatMessage[]): Promise<void> {
    const persisted = messages.filter((message) => message.role !== 'status')
    await project.saveConversation({ giftId, json: JSON.stringify(persisted) })
  },

  /** Full model transcript (JSONL), including tool calls and reasoning; '' when none saved yet. */
  async getModelContext(giftId: string): Promise<string> {
    return (await project.getModelContext({ giftId })).jsonl
  },

  async saveModelContext(giftId: string, jsonl: string): Promise<void> {
    await project.saveModelContext({ giftId, jsonl })
  },

  /** Pre-compaction transcript, kept as a new timestamped file per compaction. */
  async archiveModelContext(giftId: string, jsonl: string): Promise<void> {
    await project.archiveModelContext({ giftId, jsonl })
  },

  async listContextArchives(giftId: string): Promise<string[]> {
    return (await project.listContextArchives({ giftId })).files
  },

  async readContextArchive(giftId: string, file: string): Promise<string> {
    return (await project.readContextArchive({ giftId, file })).jsonl
  },

  async getSession(): Promise<SessionState> {
    const { json } = await project.getSession()
    if (!json) return { drafts: {} }
    const session = JSON.parse(json) as SessionState
    const activeTab = (session.activeTab as string) === 'chat' ? 'craft' : session.activeTab
    return { ...session, activeTab, drafts: session.drafts ?? {} }
  },

  async saveSession(session: SessionState): Promise<void> {
    await project.saveSession({ json: JSON.stringify(session) })
  },

  async getAgentConfig(): Promise<AgentConfig> {
    const config = await project.getAgentConfig()
    return { ...defaultConfig, ...config, reasoningEffort: normalizeEffort(config.reasoningEffort) }
  },

  async setAgentConfig(config: AgentConfig): Promise<void> {
    await project.setAgentConfig(config)
  },
}

/** Persistent general conversation and its fixed, project-independent workspace. */
export const generalStore = {
  async listFiles(): Promise<string[]> {
    return (await project.listGeneralFiles()).files
  },

  async readFile(path: string): Promise<string> {
    assertPath(path)
    return (await project.readGeneralFile({ path })).content
  },

  async writeFile(path: string, content: string): Promise<void> {
    assertPath(path)
    await project.writeGeneralFile({ path, content })
  },

  async getConversation(): Promise<ChatMessage[]> {
    const { json } = await project.getGeneralConversation()
    return JSON.parse(json) as ChatMessage[]
  },

  async saveConversation(messages: ChatMessage[]): Promise<void> {
    const persisted = messages.filter((message) => message.role !== 'status')
    await project.saveGeneralConversation({ json: JSON.stringify(persisted) })
  },

  async getModelContext(): Promise<string> {
    return (await project.getGeneralModelContext()).jsonl
  },

  async saveModelContext(jsonl: string): Promise<void> {
    await project.saveGeneralModelContext({ jsonl })
  },

  async archiveModelContext(jsonl: string): Promise<void> {
    await project.archiveGeneralModelContext({ jsonl })
  },

  async listContextArchives(): Promise<string[]> {
    return (await project.listGeneralContextArchives()).files
  },

  async readContextArchive(file: string): Promise<string> {
    return (await project.readGeneralContextArchive({ file })).jsonl
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
