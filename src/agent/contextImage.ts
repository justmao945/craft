import type { ModelMessage } from './context'

/**
 * Snapcompact-style archival: dense serialization, then paginated PNG frames.
 * Frames are capped; when the archive does not fit, the OLDEST pages are dropped
 * (recent context survives verbatim in the kept tail anyway) and the raw JSONL
 * stays in the on-disk archive, recoverable through read_context_archive.
 */

const TOOL_RESULT_MAX_CHARS = 2000
const TOOL_RESULT_HEAD_RATIO = 0.6
const TOOL_ARG_MAX_CHARS = 500
const TOOL_CALL_MAX_CHARS = 2000

const FRAME_WIDTH = 1536
const FRAME_PADDING = 36
const FONT_SIZE = 26
const LINE_HEIGHT = 36
const ROWS_PER_FRAME = 48
const FRAME_FONT = `${FONT_SIZE}px ui-monospace, Menlo, Consolas, "Noto Sans Mono CJK SC", monospace`

export const ARCHIVE_MAX_FRAMES = 8

function capText(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.floor(max * TOOL_RESULT_HEAD_RATIO)
  return `${text.slice(0, head)}\n… ${text.length - max} chars elided …\n${text.slice(-(max - head))}`
}

function capToolArguments(name: string, raw: string): string {
  let printed = raw
  try {
    const args = JSON.parse(raw) as Record<string, unknown>
    const capped = Object.fromEntries(Object.entries(args).map(([key, value]) => [
      key, typeof value === 'string' && value.length > TOOL_ARG_MAX_CHARS ? `${value.slice(0, TOOL_ARG_MAX_CHARS)}…` : value,
    ]))
    printed = JSON.stringify(capped)
  } catch { /* keep raw arguments when unparseable */ }
  return `${name}(${capText(printed, TOOL_CALL_MAX_CHARS)})`
}

/** Conversation-dense text: full user/assistant text, capped tool noise, images as markers. */
export function serializeForArchive(messages: ModelMessage[], startIndex = 1): string {
  const blocks: string[] = []
  messages.forEach((message, index) => {
    const label = `#${startIndex + index}`
    if (message.role === 'assistant') {
      const lines = [`[${label} assistant]`]
      if (message.content) lines.push(message.content)
      for (const call of message.tool_calls ?? []) lines.push(`→ ${capToolArguments(call.function.name, call.function.arguments)}`)
      blocks.push(lines.join('\n'))
    } else if (message.role === 'tool') {
      blocks.push(`[${label} tool result]\n${capText(message.content, TOOL_RESULT_MAX_CHARS)}`)
    } else {
      const text = typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => part.type === 'text' ? part.text : '[image: preview screenshot]').join('\n')
      blocks.push(`[${label} ${message.role}]\n${text}`)
    }
  })
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n')
}

function wrapRows(text: string, measure: (line: string) => number, maxWidth: number): string[] {
  const rows: string[] = []
  for (const line of text.split('\n')) {
    if (!line) { rows.push(''); continue }
    let row = ''
    for (const char of line) {
      if (row && measure(row + char) > maxWidth) {
        rows.push(row)
        row = char
      } else row += char
    }
    rows.push(row)
  }
  return rows
}

export interface ArchiveRender {
  images: string[]
  totalPages: number
  droppedPages: number
}

export function renderContextImages(messages: ModelMessage[], maxFrames = ARCHIVE_MAX_FRAMES): ArchiveRender {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.font = FRAME_FONT
  const textWidth = FRAME_WIDTH - FRAME_PADDING * 2
  const rows = wrapRows(serializeForArchive(messages), (line) => context.measureText(line).width, textWidth)

  const pages: string[][] = []
  for (let start = 0; start < rows.length; start += ROWS_PER_FRAME) pages.push(rows.slice(start, start + ROWS_PER_FRAME))
  if (!pages.length) pages.push(['(empty archive)'])
  const droppedPages = Math.max(0, pages.length - maxFrames)
  const kept = pages.slice(droppedPages)

  const images = kept.map((pageRows, index) => {
    const page = document.createElement('canvas')
    page.width = FRAME_WIDTH
    page.height = FRAME_PADDING * 2 + FONT_SIZE + 12 + pageRows.length * LINE_HEIGHT
    const pen = page.getContext('2d')
    if (!pen) throw new Error('Canvas 2D is unavailable')
    pen.fillStyle = '#ffffff'
    pen.fillRect(0, 0, page.width, page.height)
    pen.font = `${FONT_SIZE - 6}px ui-monospace, monospace`
    pen.fillStyle = '#777777'
    pen.fillText(`CRAFT CONTEXT ARCHIVE · page ${droppedPages + index + 1}/${pages.length}`, FRAME_PADDING, FRAME_PADDING + FONT_SIZE - 6)
    pen.font = FRAME_FONT
    pen.fillStyle = '#111111'
    const top = FRAME_PADDING + FONT_SIZE + 12
    pageRows.forEach((row, rowIndex) => pen.fillText(row, FRAME_PADDING, top + (rowIndex + 1) * LINE_HEIGHT - 8))
    return page.toDataURL('image/png')
  })
  return { images, totalPages: pages.length, droppedPages }
}
