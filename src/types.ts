export interface AppDescriptor {
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

export interface Workspace {
  app: AppDescriptor
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
  reasoningEffort: 'none' | 'low' | 'medium' | 'high'
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
