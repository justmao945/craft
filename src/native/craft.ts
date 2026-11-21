import { Capacitor, registerPlugin } from '@capacitor/core'
import type { AgentConfig, AppDescriptor, BuildArtifact, Snapshot, Workspace } from '../types'

interface CraftProjectPlugin {
  listApps(): Promise<{ apps: AppDescriptor[] }>
  createApp(options: { name: string }): Promise<{ app: AppDescriptor }>
  getWorkspace(options: { appId: string }): Promise<Workspace>
  listFiles(options: { appId: string }): Promise<{ files: string[] }>
  readFile(options: { appId: string; path: string }): Promise<{ content: string }>
  writeFile(options: { appId: string; path: string; content: string }): Promise<{ ok: boolean }>
  createSnapshot(options: { appId: string; message: string }): Promise<{ snapshot: Snapshot }>
  listSnapshots(options: { appId: string }): Promise<{ snapshots: Snapshot[] }>
  saveBuild(options: { appId: string; snapshotId?: string; js: string; css: string; draft: boolean }): Promise<{ buildId: string }>
  getDraftBuild(options: { appId: string }): Promise<BuildArtifact>
  getReleaseBuild(options: { appId: string }): Promise<BuildArtifact>
  publish(options: { appId: string; snapshotId: string }): Promise<{ app: AppDescriptor }>
  rollback(options: { appId: string; snapshotId: string }): Promise<{ app: AppDescriptor; snapshot: Snapshot }>
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
  openDraft(options: { appId: string; title: string }): Promise<{ ok: boolean }>
  openRelease(options: { appId: string; title: string }): Promise<{ ok: boolean }>
  closePreview(options?: Record<string, never>): Promise<{ ok: boolean }>
  screenshot(options?: Record<string, never>): Promise<RuntimeSnapshot>
  inspect(options?: Record<string, never>): Promise<Inspection>
  click(options: { testId?: string; text?: string; x?: number; y?: number }): Promise<{ ok: boolean }>
  input(options: { testId?: string; label?: string; value: string }): Promise<{ ok: boolean }>
  logs(options?: Record<string, never>): Promise<{ logs: string[] }>
}

const nativeProject = registerPlugin<CraftProjectPlugin>('CraftProject')
const nativeRuntime = registerPlugin<CraftRuntimePlugin>('CraftRuntime')
const isNative = Capacitor.isNativePlatform()

interface BrowserState {
  apps: AppDescriptor[]
  workspaces: Record<string, Record<string, string>>
  snapshots: Record<string, Snapshot[]>
  sources: Record<string, Record<string, string>>
  builds: Record<string, BuildArtifact>
  drafts: Record<string, string>
  config: AgentConfig
}

const defaultConfig: AgentConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-chat',
  reasoningEffort: 'high',
}

let browserState: BrowserState | undefined

function loadBrowserState(): BrowserState {
  if (browserState) return browserState
  const saved = localStorage.getItem('craft-browser-state-v1')
  browserState = saved ? JSON.parse(saved) as BrowserState : {
    apps: [], workspaces: {}, snapshots: {}, sources: {}, builds: {}, drafts: {}, config: defaultConfig,
  }
  return browserState
}

function persistBrowserState(): void {
  localStorage.setItem('craft-browser-state-v1', JSON.stringify(browserState))
}

function assertPath(path: string): void {
  if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid project path')
}

function browserBuild(appId: string, buildId: string): BuildArtifact {
  const build = loadBrowserState().builds[`${appId}:${buildId}`]
  if (!build) throw new Error('Build not found')
  return build
}

export const projectStore = {
  async listApps(): Promise<AppDescriptor[]> {
    if (isNative) return (await nativeProject.listApps()).apps
    return [...loadBrowserState().apps].sort((a, b) => b.updatedAt - a.updatedAt)
  },

  async createApp(name: string): Promise<AppDescriptor> {
    if (isNative) return (await nativeProject.createApp({ name })).app
    const state = loadBrowserState()
    const app: AppDescriptor = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'app'}-${crypto.randomUUID().slice(0, 8)}`,
      name,
      updatedAt: Date.now(),
    }
    state.apps.push(app)
    state.workspaces[app.id] = {}
    state.snapshots[app.id] = []
    persistBrowserState()
    return app
  },

  async getWorkspace(appId: string): Promise<Workspace> {
    if (isNative) return nativeProject.getWorkspace({ appId })
    const state = loadBrowserState()
    const app = state.apps.find((item) => item.id === appId)
    if (!app) throw new Error('App not found')
    return { app, files: { ...state.workspaces[appId] } }
  },

  async listFiles(appId: string): Promise<string[]> {
    if (isNative) return (await nativeProject.listFiles({ appId })).files
    return Object.keys(loadBrowserState().workspaces[appId] ?? {}).sort()
  },

  async readFile(appId: string, path: string): Promise<string> {
    assertPath(path)
    if (isNative) return (await nativeProject.readFile({ appId, path })).content
    const content = loadBrowserState().workspaces[appId]?.[path]
    if (content === undefined) throw new Error(`File not found: ${path}`)
    return content
  },

  async writeFile(appId: string, path: string, content: string): Promise<void> {
    assertPath(path)
    if (isNative) {
      await nativeProject.writeFile({ appId, path, content })
      return
    }
    const state = loadBrowserState()
    state.workspaces[appId][path] = content
    const app = state.apps.find((item) => item.id === appId)
    if (app) app.updatedAt = Date.now()
    persistBrowserState()
  },

  async createSnapshot(appId: string, message: string): Promise<Snapshot> {
    if (isNative) return (await nativeProject.createSnapshot({ appId, message })).snapshot
    const state = loadBrowserState()
    const snapshot: Snapshot = { id: crypto.randomUUID(), message, createdAt: Date.now() }
    state.snapshots[appId].unshift(snapshot)
    state.sources[snapshot.id] = { ...state.workspaces[appId] }
    persistBrowserState()
    return snapshot
  },

  async listSnapshots(appId: string): Promise<Snapshot[]> {
    if (isNative) return (await nativeProject.listSnapshots({ appId })).snapshots
    return loadBrowserState().snapshots[appId] ?? []
  },

  async saveBuild(appId: string, snapshotId: string | undefined, js: string, css: string, draft: boolean): Promise<string> {
    if (isNative) return (await nativeProject.saveBuild({ appId, snapshotId, js, css, draft })).buildId
    const state = loadBrowserState()
    const buildId = crypto.randomUUID()
    state.builds[`${appId}:${buildId}`] = { buildId, js, css }
    if (draft) state.drafts[appId] = buildId
    const snapshot = state.snapshots[appId].find((item) => item.id === snapshotId)
    if (snapshot) snapshot.buildId = buildId
    persistBrowserState()
    return buildId
  },

  async getDraftBuild(appId: string): Promise<BuildArtifact> {
    if (isNative) return nativeProject.getDraftBuild({ appId })
    const buildId = loadBrowserState().drafts[appId]
    if (!buildId) throw new Error('No draft build')
    return browserBuild(appId, buildId)
  },

  async getReleaseBuild(appId: string): Promise<BuildArtifact> {
    if (isNative) return nativeProject.getReleaseBuild({ appId })
    const state = loadBrowserState()
    const app = state.apps.find((item) => item.id === appId)
    const snapshot = state.snapshots[appId]?.find((item) => item.id === app?.releaseSnapshotId)
    if (!snapshot?.buildId) throw new Error('No release build')
    return browserBuild(appId, snapshot.buildId)
  },

  async publish(appId: string, snapshotId: string): Promise<AppDescriptor> {
    if (isNative) return (await nativeProject.publish({ appId, snapshotId })).app
    const state = loadBrowserState()
    const snapshot = state.snapshots[appId].find((item) => item.id === snapshotId)
    if (!snapshot?.buildId) throw new Error('Snapshot has no build')
    const app = state.apps.find((item) => item.id === appId)
    if (!app) throw new Error('App not found')
    app.releaseSnapshotId = snapshotId
    app.updatedAt = Date.now()
    persistBrowserState()
    return app
  },

  async rollback(appId: string, snapshotId: string): Promise<void> {
    if (isNative) {
      await nativeProject.rollback({ appId, snapshotId })
      return
    }
    const state = loadBrowserState()
    const target = state.snapshots[appId].find((item) => item.id === snapshotId)
    if (!target?.buildId) throw new Error('Snapshot has no build')
    state.workspaces[appId] = { ...state.sources[snapshotId] }
    const snapshot: Snapshot = {
      id: crypto.randomUUID(), message: `Rollback to ${snapshotId}`, createdAt: Date.now(), buildId: target.buildId,
    }
    state.snapshots[appId].unshift(snapshot)
    state.sources[snapshot.id] = { ...state.workspaces[appId] }
    const app = state.apps.find((item) => item.id === appId)
    if (app) app.releaseSnapshotId = snapshot.id
    persistBrowserState()
  },

  async getAgentConfig(): Promise<AgentConfig> {
    if (isNative) return nativeProject.getAgentConfig()
    return { ...defaultConfig, ...loadBrowserState().config }
  },

  async setAgentConfig(config: AgentConfig): Promise<void> {
    if (isNative) {
      await nativeProject.setAgentConfig(config)
      return
    }
    loadBrowserState().config = config
    persistBrowserState()
  },
}

export interface BrowserRuntimeHandler {
  open(appId: string, title: string, environment: 'draft' | 'release'): Promise<void>
  close(): Promise<void>
  inspect(): Promise<Inspection>
  click(options: { testId?: string; text?: string; x?: number; y?: number }): Promise<void>
  input(options: { testId?: string; label?: string; value: string }): Promise<void>
  logs(): Promise<string[]>
}

let browserRuntime: BrowserRuntimeHandler | undefined

export function setBrowserRuntime(handler: BrowserRuntimeHandler): void {
  browserRuntime = handler
}

export const runtime = {
  async openDraft(appId: string, title: string): Promise<void> {
    if (isNative) await nativeRuntime.openDraft({ appId, title })
    else await browserRuntime?.open(appId, title, 'draft')
  },
  async openRelease(appId: string, title: string): Promise<void> {
    if (isNative) await nativeRuntime.openRelease({ appId, title })
    else await browserRuntime?.open(appId, title, 'release')
  },
  async closePreview(): Promise<void> {
    if (isNative) await nativeRuntime.closePreview({})
    else await browserRuntime?.close()
  },
  async screenshot(): Promise<string> {
    if (!isNative) throw new Error('Native screenshot is available in the Android preview')
    return (await nativeRuntime.screenshot({})).dataUrl
  },
  async inspect(): Promise<Inspection> {
    if (isNative) return nativeRuntime.inspect({})
    if (!browserRuntime) throw new Error('No preview is open')
    return browserRuntime.inspect()
  },
  async click(options: { testId?: string; text?: string; x?: number; y?: number }): Promise<void> {
    if (isNative) await nativeRuntime.click(options)
    else await browserRuntime?.click(options)
  },
  async input(options: { testId?: string; label?: string; value: string }): Promise<void> {
    if (isNative) await nativeRuntime.input(options)
    else await browserRuntime?.input(options)
  },
  async logs(): Promise<string[]> {
    if (isNative) return (await nativeRuntime.logs({})).logs
    return browserRuntime?.logs() ?? []
  },
}
