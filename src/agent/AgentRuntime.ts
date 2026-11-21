import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { z } from 'zod'
import { compileProject } from '../compiler/compiler'
import { projectStore, runtime } from '../native/craft'
import type { AgentConfig, AppDescriptor, BuildArtifact } from '../types'

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

type AssistantMessage = { role: 'assistant'; content?: string | null; reasoning_content?: string | null; tool_calls?: ToolCall[] }

type ModelMessage =
  | { role: 'system' | 'user'; content: string | ContentPart[] }
  | AssistantMessage
  | { role: 'tool'; content: string; tool_call_id: string }

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

interface AgentHooks {
  onStatus: (text: string) => void
  onAssistant: (text: string) => void
  onAppsChanged: () => Promise<void>
  onAppSelected: (app: AppDescriptor) => void
  confirm: (action: string) => Promise<boolean>
}

const systemPrompt = `You are Craft, a self-developed mobile coding agent running on Android.
Use tools to create and modify real applications. Never substitute printed code for tool execution.
The project entry is src/main.tsx. Available imports: react, react-dom/client, react/jsx-runtime, @craft/sdk.
Every app must mount with createRoot(document.getElementById('root')!).render(<App />).
@craft/sdk exposes storage.get(name, fallback), storage.set(name, value), and storage.remove(name).
Use accessible labels and data-testid attributes for important controls. Keep styling in src/styles.css.
After writing or changing code, call build_app, inspect_preview and screenshot_preview. Test the main flow with click_preview/input_preview and logs. Never claim a test passed without tool evidence.
To modify an existing app, call list_apps and select_app. To create one, call create_app first.
Do not publish until the build and main-flow test succeed. Publishing requires user confirmation.
Keep responses concise and in the user's language.`

const toolDefinitions = [
  { name: 'list_apps', description: 'List existing Craft apps', parameters: { type: 'object', properties: {} } },
  { name: 'select_app', description: 'Select an app to inspect or modify', parameters: { type: 'object', properties: { appId: { type: 'string' } }, required: ['appId'] } },
  { name: 'create_app', description: 'Create a new app project', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'list_files', description: 'List source files in the selected app', parameters: { type: 'object', properties: {} } },
  { name: 'read_file', description: 'Read a source file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Create or completely replace a source file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'build_app', description: 'Compile the selected multi-file TSX project, save a draft and open its real preview', parameters: { type: 'object', properties: {} } },
  { name: 'inspect_preview', description: 'Read the rendered app semantic UI tree', parameters: { type: 'object', properties: {} } },
  { name: 'screenshot_preview', description: 'Capture the actual native preview screen for visual inspection', parameters: { type: 'object', properties: {} } },
  { name: 'click_preview', description: 'Click a preview control by testId or visible text', parameters: { type: 'object', properties: { testId: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'input_preview', description: 'Enter text into a preview input by testId or label', parameters: { type: 'object', properties: { testId: { type: 'string' }, label: { type: 'string' }, value: { type: 'string' } }, required: ['value'] } },
  { name: 'preview_logs', description: 'Read preview console messages and runtime errors', parameters: { type: 'object', properties: {} } },
  { name: 'publish_app', description: 'Snapshot and publish the tested draft after user confirmation', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
] as const
const tools = toolDefinitions.map((definition) => ({ type: 'function', function: definition }))

export class AgentRuntime {
  private messages: ModelMessage[] = [{ role: 'system', content: systemPrompt }]
  private currentAppId: string | undefined
  private currentAppName = ''
  private lastBuild: { appId: string; artifact: BuildArtifact } | undefined
  private running = false

  constructor(private readonly hooks: AgentHooks) {}

  async run(prompt: string): Promise<void> {
    if (this.running) throw new Error('Craft is already working')
    const config = await projectStore.getAgentConfig()
    if (!config.apiKey) throw new Error('Add a model API key in Craft settings first')
    this.running = true
    this.messages.push({ role: 'user', content: prompt })
    let pendingScreenshot: string | undefined
    let screenshotMessageIndex: number | undefined
    try {
      for (let round = 0; round < 18; round++) {
        this.hooks.onStatus(`Agent round ${round + 1}: reasoning`)
        const assistant = await this.requestAssistant(config.baseUrl, config.apiKey, config.model, config.reasoningEffort)
        if (screenshotMessageIndex !== undefined) {
          this.messages[screenshotMessageIndex] = { role: 'user', content: '[Previous preview screenshot omitted]' }
          screenshotMessageIndex = undefined
        }
        this.messages.push(assistant)
        if (!assistant.tool_calls?.length) {
          const text = assistant.content ?? 'Done'
          this.hooks.onAssistant(text)
          return
        }
        for (const call of assistant.tool_calls) {
          this.hooks.onStatus(call.function.name)
          let output: unknown
          try {
            output = await this.executeTool(
              call.function.name,
              ToolArgumentsSchema.parse(JSON.parse(call.function.arguments || '{}')),
            )
            if (call.function.name === 'screenshot_preview' && typeof output === 'string') pendingScreenshot = output
          } catch (error) {
            output = { ok: false, error: error instanceof Error ? error.message : String(error) }
          }
          this.messages.push({
            role: 'tool', tool_call_id: call.id,
            content: JSON.stringify(call.function.name === 'screenshot_preview' ? { ok: true, note: 'Screenshot follows' } : output),
          })
        }
        if (pendingScreenshot) {
          this.messages.push({
            role: 'user',
            content: [
              { type: 'text', text: 'Latest real Craft preview screenshot. Use it to verify layout, then continue testing.' },
              { type: 'image_url', image_url: { url: pendingScreenshot } },
            ],
          })
          screenshotMessageIndex = this.messages.length - 1
          pendingScreenshot = undefined
        }
      }
      throw new Error('Agent reached the 18-round safety limit')
    } finally {
      this.running = false
    }
  }

  private async requestAssistant(baseUrl: string, apiKey: string, model: string, reasoningEffort: AgentConfig['reasoningEffort']): Promise<AssistantMessage> {
    if (!baseUrl.startsWith('https://')) throw new Error('Model endpoint must use HTTPS')
    const body = { model, messages: this.messages, tools, tool_choice: 'auto', reasoning_effort: reasoningEffort }
    let status: number
    let payload: unknown
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.post({
        url: baseUrl,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        data: body,
      })
      status = response.status
      payload = response.data
    } else {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      status = response.status
      payload = await response.json()
    }
    if (status < 200 || status >= 300) {
      const apiError = ModelErrorSchema.safeParse(payload)
      throw new Error(apiError.success ? apiError.data.error.message : `Model request failed (${status})`)
    }
    return parseAssistantMessage(payload)
  }

  private async executeTool(name: string, args: ToolArguments): Promise<unknown> {
    switch (name) {
      case 'list_apps':
        return { apps: await projectStore.listApps() }
      case 'select_app': {
        const requestedId = stringArgument(args, 'appId')
        const apps = await projectStore.listApps()
        const app = apps.find((item) => item.id === requestedId || item.name === requestedId)
        if (!app) throw new Error('App not found')
        this.selectApp(app)
        return { ok: true, app }
      }
      case 'create_app': {
        const app = await projectStore.createApp(stringArgument(args, 'name').trim())
        this.selectApp(app)
        await projectStore.writeFile(app.id, 'app.json', JSON.stringify({
          id: app.id, name: app.name, runtimeVersion: 1, entry: 'src/main.tsx', permissions: ['storage'],
        }, null, 2))
        await this.hooks.onAppsChanged()
        return { ok: true, app }
      }
      case 'list_files':
        return { files: await projectStore.listFiles(this.appId()) }
      case 'read_file': {
        const path = stringArgument(args, 'path')
        return { path, content: await projectStore.readFile(this.appId(), path) }
      }
      case 'write_file': {
        const path = stringArgument(args, 'path')
        await projectStore.writeFile(this.appId(), path, stringArgument(args, 'content', true))
        return { ok: true, path }
      }
      case 'build_app':
        return this.buildCurrentApp()
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
      case 'publish_app': {
        if (!this.lastBuild || this.lastBuild.appId !== this.appId()) throw new Error('Build the app before publishing')
        if (!await this.hooks.confirm(`Publish ${this.currentAppName}?`)) return { ok: false, error: 'User did not approve publishing' }
        const snapshot = await projectStore.createSnapshot(this.appId(), stringArgument(args, 'message'))
        await projectStore.saveBuild(this.appId(), snapshot.id, this.lastBuild.artifact.js, this.lastBuild.artifact.css, false)
        const app = await projectStore.publish(this.appId(), snapshot.id)
        await this.hooks.onAppsChanged()
        return { ok: true, app, snapshot }
      }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  private appId(): string {
    if (!this.currentAppId) throw new Error('Select or create an app first')
    return this.currentAppId
  }

  private selectApp(app: AppDescriptor): void {
    this.currentAppId = app.id
    this.currentAppName = app.name
    this.hooks.onAppSelected(app)
  }

  private async buildCurrentApp(): Promise<unknown> {
    const appId = this.appId()
    const workspace = await projectStore.getWorkspace(appId)
    this.hooks.onStatus(`Compiling ${workspace.app.name}`)
    const result = await compileProject(workspace.files)
    if (result.diagnostics.length || !result.js) return { ok: false, diagnostics: result.diagnostics }
    const buildId = await projectStore.saveBuild(appId, undefined, result.js, result.css, true)
    this.lastBuild = { appId, artifact: { buildId, js: result.js, css: result.css } }
    await runtime.openDraft(appId, workspace.app.name)
    return { ok: true, buildId, diagnostics: [] }
  }
}
