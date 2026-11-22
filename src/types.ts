export interface Gift {
  id: string
  name: string
  releaseSnapshotId?: string
  updatedAt: number
}

export interface Snapshot {
  id: string
  message: string
  createdAt: number
  buildId?: string
}

export interface StorageStatus {
  granted: boolean
  path: string
}

export interface Workspace {
  gift: Gift
  files: Record<string, string>
}

export interface BuildArtifact {
  buildId: string
  js: string
  css: string
}

export interface AgentConfig {
  apiKey: string
  baseUrl: string
  model: string
  reasoningEffort: 'none' | 'low' | 'high' | 'max'
}

export interface CompileResult {
  js: string
  css: string
  diagnostics: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status'
  text: string
  createdAt: number
}

/** App-level UI session: what to restore on cold start. */
export interface SessionState {
  activeGiftId?: string
  activeTab?: 'craft' | 'gifts' | 'discover' | 'profile'
  language?: 'zh' | 'en'
  /** Unsent composer text, keyed by Gift id ('' = new Gift, '__general__' = general conversation). */
  drafts: Record<string, string>
}
