import * as esbuild from 'esbuild-wasm'
import { projectBuildOptions, projectPlugin, splitBuildOutput } from './project'

interface CompileRequest {
  id: string
  files: Record<string, string>
  entry: string
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CompileRequest>) => void) | null
  postMessage: (value: unknown) => void
}

let initialization: Promise<void> | undefined

scope.onmessage = async ({ data }) => {
  try {
    initialization ??= esbuild.initialize({ wasmURL: '/esbuild.wasm', worker: false })
    await initialization
    const result = await esbuild.build({
      ...projectBuildOptions,
      entryPoints: [data.entry],
      sourcemap: 'inline',
      minify: false,
      plugins: [projectPlugin(data.files)],
    })
    scope.postMessage({ id: data.id, result: { ...splitBuildOutput(result.outputFiles), diagnostics: [] } })
  } catch (error) {
    const failure = error as { errors?: Array<{ text: string; location?: { file: string; line: number } }>; message?: string }
    const diagnostics = failure.errors?.map((item) =>
      item.location ? `${item.location.file}:${item.location.line}: ${item.text}` : item.text,
    ) ?? [failure.message ?? String(error)]
    scope.postMessage({ id: data.id, result: { js: '', css: '', diagnostics } })
  }
}
