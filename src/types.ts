export interface Gift {
  id: string
  name: string
  /** Square work this Gift was installed from. */
  squareId?: string
  releaseSnapshotId?: string
  /** A draft build other than the release exists. */
  hasDraft?: boolean
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
  /** Model context window in tokens; drives the usage-based compaction trigger (default 1M, DeepSeek Flash). */
  contextWindow?: number
  /** Compaction trigger as a percent of the context window (default 30). */
  compactionPercent?: number
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
  drafts: Record<string, string>
}
