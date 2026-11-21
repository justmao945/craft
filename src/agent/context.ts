/** Pure model-context helpers: JSONL codec, file edits and compaction cut points. No platform imports. */

export interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export type AssistantMessage = { role: 'assistant'; content?: string | null; reasoning_content?: string | null; tool_calls?: ToolCall[] }

export type ModelMessage =
  | { role: 'system' | 'user'; content: string | ContentPart[] }
  | AssistantMessage
  | { role: 'tool'; content: string; tool_call_id: string }

export function messageText(message: ModelMessage): string {
  if (message.role === 'assistant' || message.role === 'tool') return message.content ?? ''
  return typeof message.content === 'string'
    ? message.content
    : message.content.map((part) => part.type === 'text' ? part.text : '[image]').join('\n')
}

export function encodeContextJsonl(messages: ModelMessage[]): string {
  return messages.map((message) => JSON.stringify(message)).join('\n')
}

export function decodeContextJsonl(jsonl: string): ModelMessage[] {
  const messages = jsonl.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as ModelMessage)
  if (messages.length && messages[0].role !== 'system') throw new Error('Model context must start with a system message')
  return messages
}

/** 1-based inclusive line slice; offset past EOF yields empty content. */
export function sliceFileLines(content: string, offset = 1, limit?: number): { content: string; totalLines: number; offset: number } {
  const lines = content.split('\n')
  const start = Math.max(1, Math.floor(offset))
  const count = limit === undefined ? lines.length : Math.max(1, Math.floor(limit))
  return { content: lines.slice(start - 1, start - 1 + count).join('\n'), totalLines: lines.length, offset: start }
}

export function applyFileEdit(content: string, oldString: string, newString: string, replaceAll: boolean): { content: string; replacements: number } {
  if (!oldString) throw new Error('old_string must not be empty')
  const occurrences = content.split(oldString).length - 1
  if (!occurrences) throw new Error('old_string not found in file')
  if (occurrences > 1 && !replaceAll) {
    throw new Error(`old_string matches ${occurrences} locations; add surrounding context or set replace_all`)
  }
  return {
    content: replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString),
    replacements: replaceAll ? occurrences : 1,
  }
}

export function contextChars(messages: ModelMessage[]): number {
  return messages.reduce((total, message) => total + JSON.stringify(message).length, 0)
}

/**
 * Cut index into messages: [1, cut) is archived, [cut, end) stays verbatim.
 * Hard rules (mirroring omp): never keep a leading tool result, never archive nothing,
 * always leave at least one non-system message verbatim.
 */
export function findCompactionCut(messages: ModelMessage[], recentCharLimit: number): number {
  let cut = messages.length - 1
  let kept = 0
  while (cut > 1 && kept < recentCharLimit) {
    kept += JSON.stringify(messages[cut]).length
    if (kept >= recentCharLimit) break
    cut -= 1
  }
  while (cut < messages.length - 1 && messages[cut].role === 'tool') cut += 1
  return Math.max(1, Math.min(cut, messages.length - 1))
}
