import type { BuildOptions, Loader, OutputFile, Plugin } from 'esbuild'

/**
 * Gift project compile core, shared by the in-app compiler worker (esbuild-wasm) and the
 * build-time bundler for Square works (esbuild). Pure: no platform imports.
 */

/** Modules every Gift may import; resolved from the page-level runtime instead of bundled. */
const virtualModules: Record<string, string> = {
  react: 'module.exports = window.CraftRuntime.React',
  'react/jsx-runtime': 'module.exports = window.CraftRuntime.jsxRuntime',
  'react-dom/client': 'module.exports = window.CraftRuntime.createRootModule',
  '@craft/sdk': 'module.exports = window.CraftRuntime.sdk',
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function resolveFile(path: string, files: Record<string, string>): string | undefined {
  const normalized = normalize(path)
  const candidates = [
    normalized,
    ...['.tsx', '.ts', '.jsx', '.js', '.json', '.css'].map((extension) => normalized + extension),
    ...['/index.tsx', '/index.ts', '/index.jsx', '/index.js'].map((suffix) => normalized + suffix),
  ]
  return candidates.find((candidate) => Object.hasOwn(files, candidate))
}

function loaderFor(path: string): Loader {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.ts')) return 'ts'
  if (path.endsWith('.jsx')) return 'jsx'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.css')) return 'css'
  return 'js'
}

/** Resolves a Gift's in-memory files plus the runtime modules; rejects every other package. */
export function projectPlugin(files: Record<string, string>): Plugin {
  return {
    name: 'craft-project',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (Object.hasOwn(virtualModules, args.path)) {
          return { path: args.path, namespace: 'craft-runtime' }
        }
        if (args.path.startsWith('.') || args.path.startsWith('/') || args.path.startsWith('src/')) {
          const base = args.path.startsWith('.') ? args.importer.split('/').slice(0, -1).join('/') : ''
          const resolved = resolveFile(base ? `${base}/${args.path}` : args.path, files)
          if (!resolved) {
            return { errors: [{ text: `Cannot resolve ${args.path} from ${args.importer || 'project root'}` }] }
          }
          return { path: resolved, namespace: 'craft-file' }
        }
        return { errors: [{ text: `Package "${args.path}" is not included in this Craft runtime` }] }
      })
      build.onLoad({ filter: /.*/, namespace: 'craft-runtime' }, (args) => ({
        contents: virtualModules[args.path],
        loader: 'js',
      }))
      build.onLoad({ filter: /.*/, namespace: 'craft-file' }, (args) => ({
        contents: files[args.path],
        loader: loaderFor(args.path),
        resolveDir: args.path.split('/').slice(0, -1).join('/'),
      }))
    },
  }
}

/** Options shared by every Gift bundle; callers add entryPoints and plugins. */
export const projectBuildOptions: BuildOptions = {
  bundle: true,
  write: false,
  outfile: 'app.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  logLevel: 'silent',
}

/** Script and stylesheet text of a finished build; css is '' when the project imports no CSS. */
export function splitBuildOutput(outputFiles: OutputFile[] | undefined): { js: string; css: string } {
  const js = outputFiles?.find((file) => file.path.endsWith('.js'))?.text ?? ''
  const css = outputFiles?.find((file) => file.path.endsWith('.css'))?.text ?? ''
  return { js, css }
}
