import type { CompileResult } from '../types'

interface PendingBuild {
  resolve: (result: CompileResult) => void
  reject: (error: Error) => void
  timer: number
}

let worker: Worker | undefined
let sequence = 0
const pending = new Map<string, PendingBuild>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(data.id)
    request.resolve(data.result)
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Compiler worker failed')
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
    worker?.terminate()
    worker = undefined
  }
  return worker
}

export async function compileProject(files: Record<string, string>, entry = 'src/main.tsx'): Promise<CompileResult> {
  const id = `build-${++sequence}`
  const { promise, resolve, reject } = Promise.withResolvers<CompileResult>()
  const timer = setTimeout(() => {
    pending.delete(id)
    reject(new Error('TypeScript build timed out'))
  }, 45_000)
  pending.set(id, { resolve, reject, timer })
  getWorker().postMessage({ id, files, entry })
  return promise
}
