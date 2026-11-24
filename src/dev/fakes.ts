import { bridge, giftManifest } from '../native/craft'
import type { CraftGiftPlugin, CraftRuntimePlugin } from '../native/craft'
import type { AgentConfig, ChatMessage, Gift, SessionState, Snapshot } from '../types'

interface DevState {
  gifts: Gift[]
  workspaces: Record<string, Record<string, string>>
  conversations: Record<string, ChatMessage[]>
  general: ChatMessage[]
  session: SessionState
  config: AgentConfig
  snapshots: Record<string, Snapshot[]>
}

const KEY = 'craft-dev'
const fresh = (): DevState => ({
  gifts: [], workspaces: {}, conversations: {}, general: [], session: { drafts: {} }, snapshots: {},
  config: { apiKey: '', baseUrl: '', model: '', reasoningEffort: 'high', contextWindow: 1_000_000, compactionPercent: 30 },
})
let state = fresh()

function save(): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

function giftOf(giftId: string): Gift {
  const gift = state.gifts.find((candidate) => candidate.id === giftId)
  if (!gift) throw new Error(`No Gift ${giftId}`)
  return gift
}

function addGift(name: string, squareId?: string): Gift {
  const gift: Gift = { id: crypto.randomUUID(), name, squareId, updatedAt: Date.now() }
  state.gifts.push(gift)
  state.workspaces[gift.id] = {}
  return gift
}

function addSnapshot(giftId: string, message: string): Snapshot {
  const snapshot: Snapshot = { id: crypto.randomUUID().slice(0, 7), message, createdAt: Date.now(), buildId: `build-${crypto.randomUUID().slice(0, 7)}` }
  ;(state.snapshots[giftId] ??= []).unshift(snapshot)
  return snapshot
}

/** Shows in the page what a device would do: open the native preview. */
function announce(text: string): void {
  document.getElementById('craft-dev-note')?.remove()
  const note = Object.assign(document.createElement('div'), { id: 'craft-dev-note', textContent: text })
  note.style.cssText = 'position:fixed;z-index:99;left:12px;right:12px;bottom:12px;padding:12px 14px;border-radius:12px;background:#252630;color:#fff;font:13px/1.5 system-ui'
  document.body.append(note)
}

const ok = async () => ({ ok: true })

/** Covers what the app UI calls; model context is never touched because no agent runs in the browser. */
const fakeGift: CraftGiftPlugin = {
  getStorageStatus: async () => ({ granted: true, path: '/dev/Documents/Craft' }),
  requestStorageAccess: async () => ({ ok: true }),
  listGifts: async () => ({ gifts: [...state.gifts].sort((a, b) => b.updatedAt - a.updatedAt) }),
  createGift: async ({ name }) => {
    const gift = addGift(name)
    state.workspaces[gift.id]['gift.json'] = giftManifest(gift)
    save()
    return { gift }
  },
  installSquareWork: async ({ squareId, name, files, message }) => {
    const gift = addGift(name, squareId)
    state.workspaces[gift.id] = { ...files, 'gift.json': giftManifest(gift) }
    gift.releaseSnapshotId = addSnapshot(gift.id, message).id
    save()
    return { gift }
  },
  deleteGift: async ({ giftId }) => {
    state.gifts = state.gifts.filter((gift) => gift.id !== giftId)
    for (const store of [state.workspaces, state.conversations, state.snapshots]) delete store[giftId]
    save()
    return { ok: true }
  },
  getWorkspace: async ({ giftId }) => ({ gift: giftOf(giftId), files: state.workspaces[giftId] ?? {} }),
  listFiles: async ({ giftId }) => ({ files: Object.keys(state.workspaces[giftId] ?? {}) }),
  readFile: async ({ giftId, path }) => ({ content: state.workspaces[giftId]?.[path] ?? '' }),
  writeFile: async ({ giftId, path, content }) => {
    ;(state.workspaces[giftId] ??= {})[path] = content
    save()
    return { ok: true }
  },
  createSnapshot: async ({ giftId, message }) => {
    const snapshot = addSnapshot(giftId, message)
    save()
    return { snapshot }
  },
  listSnapshots: async ({ giftId }) => ({ snapshots: state.snapshots[giftId] ?? [] }),
  saveBuild: async () => ({ buildId: `build-${crypto.randomUUID().slice(0, 7)}` }),
  publish: async ({ giftId, snapshotId }) => {
    Object.assign(giftOf(giftId), { releaseSnapshotId: snapshotId, hasDraft: false, updatedAt: Date.now() })
    save()
    return { gift: giftOf(giftId) }
  },
  rollback: async ({ giftId, snapshotId }) => ({
    gift: giftOf(giftId),
    snapshot: state.snapshots[giftId]?.find((snapshot) => snapshot.id === snapshotId) ?? { id: snapshotId, message: '', createdAt: Date.now() },
  }),
  getConversation: async ({ giftId }) => ({ json: JSON.stringify(state.conversations[giftId] ?? []) }),
  saveConversation: async ({ giftId, json }) => {
    state.conversations[giftId] = JSON.parse(json)
    save()
    return { ok: true }
  },
  getModelContext: async () => ({ jsonl: '' }),
  saveModelContext: ok,
  archiveModelContext: async () => ({ file: 'archive.jsonl' }),
  listContextArchives: async () => ({ files: [] }),
  readContextArchive: async () => ({ jsonl: '' }),
  listGeneralFiles: async () => ({ files: [] }),
  readGeneralFile: async () => ({ content: '' }),
  writeGeneralFile: ok,
  getGeneralConversation: async () => ({ json: JSON.stringify(state.general) }),
  saveGeneralConversation: async ({ json }) => {
    state.general = JSON.parse(json)
    save()
    return { ok: true }
  },
  getGeneralModelContext: async () => ({ jsonl: '' }),
  saveGeneralModelContext: ok,
  archiveGeneralModelContext: async () => ({ file: 'archive.jsonl' }),
  listGeneralContextArchives: async () => ({ files: [] }),
  readGeneralContextArchive: async () => ({ jsonl: '' }),
  getSession: async () => ({ json: JSON.stringify(state.session) }),
  saveSession: async ({ json }) => {
    state.session = JSON.parse(json)
    save()
    return { ok: true }
  },
  setAgentConfig: async (next) => {
    state.config = next
    save()
    return { ok: true }
  },
  getAgentConfig: async () => state.config,
}

const fakePreview: CraftRuntimePlugin = {
  openDraft: async ({ title }) => {
    announce(`Device: opens the draft preview of "${title}"`)
    return { ok: true }
  },
  openRelease: async ({ title }) => {
    announce(`Device: runs "${title}"`)
    return { ok: true }
  },
  closePreview: ok,
  screenshot: async () => ({ dataUrl: '' }),
  inspect: async () => ({ tree: '', title: '', url: '' }),
  click: ok,
  input: ok,
  logs: async () => ({ logs: [] }),
}

/** Swaps the native plugins for the fakes; state persists in localStorage unless `reset`. */
export function installFakes(reset: boolean): void {
  if (reset) localStorage.removeItem(KEY)
  let stored: Partial<DevState> | null = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    stored = null
  }
  if (stored?.gifts) state = { ...fresh(), ...stored }
  bridge.gift = fakeGift
  bridge.preview = fakePreview
}
