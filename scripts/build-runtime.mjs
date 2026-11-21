import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'

await mkdir('public', { recursive: true })
await copyFile('node_modules/esbuild-wasm/esbuild.wasm', 'public/esbuild.wasm')
await build({
  entryPoints: ['src/runtime/runtime.tsx'],
  outfile: 'public/craft-runtime.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
})
