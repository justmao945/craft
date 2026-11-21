import { CapacitorHttp } from '@capacitor/core'
import { z } from 'zod'
import { compileProject } from '../compiler/compiler'
import { giftStore, runtime } from '../native/craft'
import type { AgentConfig, Gift, BuildArtifact, ChatMessage } from '../types'
import type { AssistantMessage, ContentPart, ModelMessage } from './context'
import {
  applyFileEdit, contextChars, decodeContextJsonl, encodeContextJsonl, findCompactionCut, sliceFileLines,
} from './context'
import { renderContextImages } from './contextImage'

type ToolArguments = Record<string, unknown>

const AssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.string().nullish(),
  reasoning_content: z.string().nullish(),
  tool_calls: z.array(z.object({
    id: z.string(),
    function: z.object({ name: z.string(), arguments: z.string() }),
  })).optional(),
})
const AssistantResponseSchema = z.object({
  choices: z.array(z.object({ message: AssistantMessageSchema })).min(1),
})
const ModelErrorSchema = z.object({ error: z.object({ message: z.string() }) })
const ToolArgumentsSchema = z.record(z.string(), z.unknown())

function parseAssistantMessage(payload: unknown): AssistantMessage {
  return AssistantResponseSchema.parse(payload).choices[0].message
}

function stringArgument(args: ToolArguments, key: string, allowEmpty = false): string {
  const value = args[key]
  if (typeof value !== 'string' || (!allowEmpty && !value)) {
    throw new Error(`Tool argument ${key} must be a string`)
  }
  return value
}

function optionalString(args: ToolArguments, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value ? value : undefined
}

function optionalNumber(args: ToolArguments, key: string): number | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new Error(`Tool argument ${key} must be a positive number`)
  }
  return value
}

interface AgentHooks {
  onStatus: (text: string) => void
  onAssistant: (text: string) => void
  onGiftsChanged: () => Promise<void>
  onGiftSelected: (app: Gift) => void
  confirm: (action: string) => Promise<boolean>
  /** Full JSONL transcript after each run; host persists it per project. */
  onContext?: (jsonl: string) => Promise<void>
  /** Raw JSONL of messages dropped by a compaction, archived as a new file. */
  onArchive?: (jsonl: string) => Promise<void>
}

const systemPrompt = `You are Craft, a self-developed mobile coding agent running on Android.
Craft is a host app made of Gifts: self-contained feature modules (tools, utilities, games) living inside Craft, never standalone APKs.
Each conversation belongs to exactly one Gift. If none is bound yet, call create_gift once with a short name derived from the user's request; the conversation then stays bound to that Gift. Never create additional Gifts in a bound conversation.
Use tools to create and modify real modules. Never substitute printed code for tool execution.
The module entry is src/main.tsx. Available imports: react, react-dom/client, react/jsx-runtime, @craft/sdk.
Every module must mount with createRoot(document.getElementById('root')!).render(<App />).
@craft/sdk exposes storage.get(name, fallback), storage.set(name, value), and storage.remove(name), namespaced per Gift.
Use accessible labels and data-testid attributes for important controls. Keep styling in src/styles.css.
After writing or changing code, call build_gift, inspect_preview and screenshot_preview. Test the main flow with click_preview/input_preview and logs. Never claim a test passed without tool evidence.
Prefer edit_file for targeted changes and write_file for new files or full rewrites. read_file supports offset/limit line ranges.
When earlier context was compacted into page images, fine detail may live in JSONL archives: list_context_archives and read_context_archive recover it.
For a focused independent subtask (a self-contained module, or an isolated build/test/fix cycle) you may call delegate_task. A subagent works in its own context on the same Gift and returns a report. Do not delegate the whole request.
Do not publish until the build and main-flow test succeed. Publishing commits the workspace to the Gift's git repository and requires user confirmation.
Keep responses concise and in the user's language.`

const subagentPrompt = `You are a Craft subagent. The main agent delegated a focused subtask in the current Gift (a feature module inside Craft).
Work autonomously with the file, build and preview tools. You cannot publish, create Gifts or delegate further.
The module entry is src/main.tsx. Available imports: react, react-dom/client, react/jsx-runtime, @craft/sdk.
Every module must mount with createRoot(document.getElementById('root')!).render(<App />).
@craft/sdk exposes storage.get(name, fallback), storage.set(name, value), and storage.remove(name).
Use accessible labels and data-testid attributes for important controls. Keep styling in src/styles.css.
Never claim a test passed without tool evidence.
Finish with a concise report for the main agent: files changed, build/test evidence, remaining issues.`

const toolDefinitions = [
  { name: 'create_gift', description: 'Create the Gift (feature module) for this conversation. Only available before a Gift is bound.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'list_files', description: 'List source files in the current Gift', parameters: { type: 'object', properties: {} } },
  { name: 'read_file', description: 'Read a source file. Use offset/limit (1-based line numbers) to page through large files.', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1 } }, required: ['path'] } },
  { name: 'write_file', description: 'Create or completely replace a source file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: 'Replace an exact string in a source file. old_string must match exactly once unless replace_all is true. Prefer this over write_file for targeted changes.', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['path', 'old_string', 'new_string'] } },
  { name: 'build_gift', description: 'Compile the multi-file TSX project, save a draft and open its real preview', parameters: { type: 'object', properties: {} } },
  { name: 'inspect_preview', description: 'Read the rendered app semantic UI tree', parameters: { type: 'object', properties: {} } },
  { name: 'screenshot_preview', description: 'Capture the actual native preview screen for visual inspection', parameters: { type: 'object', properties: {} } },
  { name: 'click_preview', description: 'Click a preview control by testId or visible text', parameters: { type: 'object', properties: { testId: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'input_preview', description: 'Enter text into a preview input by testId or label', parameters: { type: 'object', properties: { testId: { type: 'string' }, label: { type: 'string' }, value: { type: 'string' } }, required: ['value'] } },
  { name: 'preview_logs', description: 'Read preview console messages and runtime errors', parameters: { type: 'object', properties: {} } },
  { name: 'list_context_archives', description: 'List archived pre-compaction transcripts (full-fidelity JSONL) for this project', parameters: { type: 'object', properties: {} } },
  { name: 'read_context_archive', description: 'Recover earlier conversation/tool detail from a compaction archive. Lines are JSONL messages; use offset/limit to page.', parameters: { type: 'object', properties: { file: { type: 'string' }, offset: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1 } }, required: ['file'] } },
  { name: 'delegate_task', description: 'Delegate a focused implementation or verification subtask to a subagent with its own context. The subagent shares the current project but cannot publish or delegate.', parameters: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] } },
  { name: 'publish_gift', description: 'Snapshot and publish the tested draft after user confirmation', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
] as const
const tools = toolDefinitions.map((definition) => ({ type: 'function', function: definition }))

const PREVIEW_TOOL_NAMES = ['list_files', 'read_file', 'write_file', 'edit_file', 'build_gift', 'inspect_preview', 'screenshot_preview', 'click_preview', 'input_preview', 'preview_logs']
const ARCHIVE_TOOL_NAMES = ['list_context_archives', 'read_context_archive']
const PROJECT_TOOL_NAMES = [...PREVIEW_TOOL_NAMES, ...ARCHIVE_TOOL_NAMES, 'delegate_task', 'publish_gift']
const SUBAGENT_TOOL_NAMES = [...PREVIEW_TOOL_NAMES, ...ARCHIVE_TOOL_NAMES]

function toolsNamed(names: readonly string[]) {
  return tools.filter((tool) => names.includes(tool.function.name))
}

const unboundTools = toolsNamed(['create_gift'])
const projectTools = toolsNamed(PROJECT_TOOL_NAMES)
const subagentTools = toolsNamed(SUBAGENT_TOOL_NAMES)

/** Serialized-size trigger and verbatim recent tail for image compaction. */
const CONTEXT_CHAR_LIMIT = 60_000
const RECENT_CHAR_LIMIT = 20_000

export class AgentRuntime {
  private messages: ModelMessage[] = [{ role: 'system', content: systemPrompt }]
  private currentGiftId: string | undefined
  private currentGiftName = ''
  private lastBuild: { giftId: string; artifact: BuildArtifact } | undefined
  private running = false

  constructor(private readonly hooks: AgentHooks, gift?: Gift) {
    if (gift) {
      this.currentGiftId = gift.id
      this.currentGiftName = gift.name
      this.messages[0] = {
        role: 'system',
        content: `${systemPrompt}\nThis conversation is bound to Gift "${gift.name}" (id: ${gift.id}). Work only on this Gift.`,
      }
    }
  }

  /** Rebuild model context from the persisted chat history after a cold start. Call before the first run. */
  seedHistory(history: ChatMessage[]): void {
    for (const message of history) {
      if (message.role === 'user' || message.role === 'assistant') {
        this.messages.push({ role: message.role, content: message.text })
      }
    }
  }

  /** Full-fidelity JSONL of the live model context (tool calls and reasoning included). */
  serializeContext(): string {
    return encodeContextJsonl(this.messages)
  }

  /** Lossless cold-start restore; falls back to seedHistory only for legacy conversations. */
  restoreContext(jsonl: string): void {
    const restored = decodeContextJsonl(jsonl)
    if (restored.length) this.messages = restored
  }

  async run(prompt: string): Promise<void> {
    if (this.running) throw new Error('Craft is already working')
    const config = await giftStore.getAgentConfig()
    if (!config.apiKey) throw new Error('Add a model API key in Craft settings first')
    this.running = true
    this.messages.push({ role: 'user', content: prompt })
    try {
      const text = await this.runLoop(config, this.messages, this.currentGiftId ? projectTools : unboundTools, 18)
      this.hooks.onAssistant(text)
    } finally {
      this.running = false
      await this.hooks.onContext?.(this.serializeContext())
    }
  }

  /** Shared main/subagent loop: model rounds, tool execution and deferred screenshot attachment. */
  private async runLoop(config: AgentConfig, messages: ModelMessage[], activeTools: typeof tools, maxRounds: number, statusPrefix = ''): Promise<string> {
    let pendingScreenshot: string | undefined
    let screenshotMessage: ModelMessage | undefined
    for (let round = 0; round < maxRounds; round++) {
      await this.compactIfNeeded(messages)
      this.hooks.onStatus(`${statusPrefix}Agent round ${round + 1}: reasoning`)
      const assistant = await this.requestAssistant(config, messages, activeTools)
      if (screenshotMessage) {
        // Only the newest screenshot stays in context; drop the previous one (if not archived already).
        const index = messages.indexOf(screenshotMessage)
        if (index >= 0) messages[index] = { role: 'user', content: '[Previous preview screenshot omitted]' }
        screenshotMessage = undefined
      }
      messages.push(assistant)
      if (!assistant.tool_calls?.length) {
        return assistant.content ?? 'Done'
      }
      for (const call of assistant.tool_calls) {
        this.hooks.onStatus(`${statusPrefix}${call.function.name}`)
        let output: unknown
        try {
          output = await this.executeTool(
            call.function.name,
            ToolArgumentsSchema.parse(JSON.parse(call.function.arguments || '{}')),
            config,
          )
          if (call.function.name === 'screenshot_preview' && typeof output === 'string') pendingScreenshot = output
        } catch (error) {
          output = { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
        messages.push({
          role: 'tool', tool_call_id: call.id,
          content: JSON.stringify(call.function.name === 'screenshot_preview' ? { ok: true, note: 'Screenshot follows' } : output),
        })
      }
      if (pendingScreenshot) {
        const message: ModelMessage = {
          role: 'user',
          content: [
            { type: 'text', text: 'Latest real Craft preview screenshot. Use it to verify layout, then continue testing.' },
            { type: 'image_url', image_url: { url: pendingScreenshot } },
          ],
        }
        messages.push(message)
        screenshotMessage = message
        pendingScreenshot = undefined
      }
    }
    throw new Error(`Agent reached the ${maxRounds}-round safety limit`)
  }

  /**
   * Snapcompact-style maintenance: once the transcript grows past CONTEXT_CHAR_LIMIT,
   * the oldest messages become paged PNG archives (oldest pages dropped past the frame
   * budget); raw JSONL is archived on disk first, so detail stays recoverable.
   */
  private async compactIfNeeded(messages: ModelMessage[]): Promise<void> {
    if (contextChars(messages) < CONTEXT_CHAR_LIMIT) return
    const cut = findCompactionCut(messages, RECENT_CHAR_LIMIT)
    const archived = messages.slice(1, cut)
    if (!archived.length) return
    this.hooks.onStatus('Compacting earlier context into archive pages')
    await this.hooks.onArchive?.(encodeContextJsonl(archived))
    const { images, droppedPages } = renderContextImages(archived)
    const note = `[Context compacted] ${archived.length} earlier messages are rendered in the attached ${images.length} archive page image(s).`
      + (droppedPages ? ` ${droppedPages} oldest page(s) did not fit the frame budget and are only in the JSONL archive.` : '')
      + ' Full raw JSONL was archived on device; use list_context_archives/read_context_archive to recover details.'
    const replacement: ModelMessage = {
      role: 'user',
      content: [
        { type: 'text', text: note },
        ...images.map((url): ContentPart => ({ type: 'image_url', image_url: { url } })),
      ],
    }
    messages.splice(1, cut - 1, replacement)
  }

  private async runSubagent(task: string, config: AgentConfig): Promise<unknown> {
    const messages: ModelMessage[] = [
      { role: 'system', content: `${subagentPrompt}\nCurrent Gift: "${this.currentGiftName}" (id: ${this.currentGiftId}).` },
      { role: 'user', content: task },
    ]
    const report = await this.runLoop(config, messages, subagentTools, 8, 'Subagent: ')
    return { ok: true, report }
  }

  private async requestAssistant(config: AgentConfig, messages: ModelMessage[], activeTools: typeof tools): Promise<AssistantMessage> {
    const { baseUrl, apiKey, model, reasoningEffort } = config
    if (!baseUrl.startsWith('https://')) throw new Error('Model endpoint must use HTTPS')
    const body = { model, messages, tools: activeTools, tool_choice: 'auto', reasoning_effort: reasoningEffort }
    // CapacitorHttp bypasses WebView CORS and keeps all traffic on the native stack.
    const response = await CapacitorHttp.post({
      url: baseUrl,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      data: body,
    })
    const status = response.status
    const payload: unknown = response.data
    if (status < 200 || status >= 300) {
      const apiError = ModelErrorSchema.safeParse(payload)
      throw new Error(apiError.success ? apiError.data.error.message : `Model request failed (${status})`)
    }
    return parseAssistantMessage(payload)
  }

  private async executeTool(name: string, args: ToolArguments, config: AgentConfig): Promise<unknown> {
    switch (name) {
      case 'create_gift': {
        if (this.currentGiftId) throw new Error('This conversation already belongs to a Gift')
        const gift = await giftStore.createGift(stringArgument(args, 'name').trim())
        this.selectGift(gift)
        await giftStore.writeFile(gift.id, 'gift.json', JSON.stringify({
          id: gift.id, name: gift.name, runtimeVersion: 1, entry: 'src/main.tsx', permissions: ['storage'],
        }, null, 2))
        await this.hooks.onGiftsChanged()
        return { ok: true, gift }
      }
      case 'list_files':
        return { files: await giftStore.listFiles(this.giftId()) }
      case 'read_file': {
        const path = stringArgument(args, 'path')
        const content = await giftStore.readFile(this.giftId(), path)
        return { path, ...sliceFileLines(content, optionalNumber(args, 'offset'), optionalNumber(args, 'limit')) }
      }
      case 'write_file': {
        const path = stringArgument(args, 'path')
        await giftStore.writeFile(this.giftId(), path, stringArgument(args, 'content', true))
        return { ok: true, path }
      }
      case 'edit_file': {
        const path = stringArgument(args, 'path')
        const current = await giftStore.readFile(this.giftId(), path)
        const edit = applyFileEdit(current, stringArgument(args, 'old_string'), stringArgument(args, 'new_string', true), args.replace_all === true)
        await giftStore.writeFile(this.giftId(), path, edit.content)
        return { ok: true, path, replacements: edit.replacements }
      }
      case 'build_gift':
        return this.buildCurrentGift()
      case 'inspect_preview':
        return runtime.inspect()
      case 'screenshot_preview':
        return runtime.screenshot()
      case 'click_preview':
        await runtime.click({ testId: optionalString(args, 'testId'), text: optionalString(args, 'text') })
        return { ok: true }
      case 'input_preview':
        await runtime.input({
          testId: optionalString(args, 'testId'),
          label: optionalString(args, 'label'),
          value: stringArgument(args, 'value', true),
        })
        return { ok: true }
      case 'preview_logs':
        return { logs: await runtime.logs() }
      case 'list_context_archives':
        return { files: await giftStore.listContextArchives(this.giftId()) }
      case 'read_context_archive': {
        const file = stringArgument(args, 'file')
        const jsonl = await giftStore.readContextArchive(this.giftId(), file)
        return { file, ...sliceFileLines(jsonl, optionalNumber(args, 'offset'), optionalNumber(args, 'limit') ?? 40) }
      }
      case 'delegate_task':
        return this.runSubagent(stringArgument(args, 'task'), config)
      case 'publish_gift': {
        if (!this.lastBuild || this.lastBuild.giftId !== this.giftId()) throw new Error('Build the Gift before publishing')
        if (!await this.hooks.confirm(`Publish ${this.currentGiftName}?`)) return { ok: false, error: 'User did not approve publishing' }
        const snapshot = await giftStore.createSnapshot(this.giftId(), stringArgument(args, 'message'))
        await giftStore.saveBuild(this.giftId(), snapshot.id, this.lastBuild.artifact.js, this.lastBuild.artifact.css, false)
        const gift = await giftStore.publish(this.giftId(), snapshot.id)
        await this.hooks.onGiftsChanged()
        return { ok: true, gift, snapshot }
      }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  private giftId(): string {
    if (!this.currentGiftId) throw new Error('Create a Gift first')
    return this.currentGiftId
  }

  private selectGift(gift: Gift): void {
    this.currentGiftId = gift.id
    this.currentGiftName = gift.name
    this.messages[0] = {
      role: 'system',
      content: `${systemPrompt}\nThis conversation is bound to Gift "${gift.name}" (id: ${gift.id}). Work only on this Gift.`,
    }
    this.hooks.onGiftSelected(gift)
  }

  private async buildCurrentGift(): Promise<unknown> {
    const giftId = this.giftId()
    const workspace = await giftStore.getWorkspace(giftId)
    this.hooks.onStatus(`Compiling ${workspace.gift.name}`)
    const result = await compileProject(workspace.files)
    if (result.diagnostics.length || !result.js) return { ok: false, diagnostics: result.diagnostics }
    const buildId = await giftStore.saveBuild(giftId, undefined, result.js, result.css, true)
    this.lastBuild = { giftId, artifact: { buildId, js: result.js, css: result.css } }
    await runtime.openDraft(giftId, workspace.gift.name)
    return { ok: true, buildId, diagnostics: [] }
  }
}
