# Square work contract (Craft)

## Goal
Author ONE finished Gift ("work") that ships inside Craft's 广场 (Square). Users tap it to run it
as-is, or build on it with the coding agent. It must be a polished, complete, real app — not a demo stub.

## Files (create only these; never touch anything else in the repo)
```
square/<id>/workspace/src/main.tsx      entry; must contain `import './styles.css'`
square/<id>/workspace/src/styles.css    all styles
square/<id>/workspace/src/*.ts(x)       optional extra modules (data, helpers) in the same folder
```
No files outside `square/<id>/workspace/src/`. `square/<id>/dist/`, `src/square/works/` and the
catalog / i18n entries are generated or maintained by the host, not by the work's author.

## Runtime (fixed by the host — violating any rule fails the build or the app)
- Entry ends with `createRoot(document.getElementById('root')!).render(<App />)`.
- Allowed imports ONLY: `'react'`, `'react-dom/client'`, `'react/jsx-runtime'`, `'@craft/sdk'`
  (plus relative imports inside `src/`). Anything else fails the build.
- `import { storage } from '@craft/sdk'`:
  `storage.get<T>(name, fallback): Promise<T>`, `storage.set(name, value): Promise<void>`,
  `storage.remove(name): Promise<void>`. JSON values only. The host namespaces keys per gift and
  per environment (Draft and Release never share data). All persistent data MUST go through it
  (no localStorage/indexedDB).
- No network requests, no external fonts/images/CDNs, no other npm packages. Icons = inline SVG.
- React 19 + TypeScript. `tsc` enforces `noUnusedLocals` and `noUnusedParameters`.
- Host page: `<div id="root"></div>`, base CSS `html,body{margin:0;min-height:100%}` and
  `#root{min-height:100vh}`. The page is drawn edge-to-edge under transparent system bars on
  Android, so the app container applies safe-area padding itself, e.g.
  `padding: calc(12px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))`,
  and any sticky bottom bar adds `env(safe-area-inset-bottom)`. Viewport meta is
  `width=device-width, initial-scale=1, viewport-fit=cover`.

## Behaviour rules
- UI language follows the system: `navigator.language.toLowerCase().startsWith('zh')` →
  Simplified Chinese, otherwise English. Every user-visible string exists in both languages
  through one small dictionary (empty states, validation messages, aria-labels included).
- Theme follows the system: colours are defined ONLY as CSS custom properties on `:root` and
  overridden inside `@media (prefers-color-scheme: dark)`. No colour literals elsewhere in the
  CSS and no colour literals in TSX. Text contrast ≥ 4.5:1 in both themes (secondary text too).
- Persistence is async: load on mount (neutral loading/empty state, never garbage), write on
  every change, fall back cleanly on missing or corrupt stored data. State survives restarts.
  Keys/values are versioned or defensive so bad data never crashes the app.
- Accessible and testable: every interactive control has a unique
  `data-testid="<id>-<thing>"` (kebab-case) and an `aria-label` when it has no visible text.
  Tap targets ≥ 44px. Input font-size ≥ 16px.
- Mobile only: 360–430 CSS px wide, no horizontal scrolling, long Chinese AND English strings
  both fit (English is longer — wrap or ellipsize, never overflow). No layout jump on load.
- UX: clear empty states, two-step inline confirmation for destructive actions (no
  `window.confirm`), disabled state for invalid input, immediate visual feedback, no dead buttons.
- Code: small focused components, no dead code, no TODOs, no console logging. ~150–300 lines of
  TSX is the target — tight, readable, no over-abstraction.

## Design language (identical across the six works)
- Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans CJK SC', Roboto, sans-serif`
- Radii: 16px cards, 12px inputs/buttons, 999px pills. Card = surface + 1px border + shadow
  `0 2px 8px rgba(0,0,0,.04)` (light) / none (dark).
- Type: 28px page title (weight 600), 16px section titles (600), 14–15px body, 12px secondary,
  `font-variant-numeric: tabular-nums` on numbers.
- Spacing: 4px grid, 16px page gutter, 14–16px card padding, 10–12px gaps.
- One accent per work (given in the task) for primary buttons, highlights and progress.
- Inline SVG icons: 20px, stroke 1.8, round caps/joins, `aria-hidden="true"`.

## Verification — run at the END, then fix and re-verify until clean
1. Type-check your own folder (other `square/<other>/` errors are not yours):
   ```
   cd /home/just/Projects/craft && npx tsc -p tsconfig.square.json --noEmit 2>&1 | grep -F "square/<id>/" || echo "square/<id>: typecheck clean"
   ```
2. A Vite dev server is already running and rebuilds your work ~1s after every save.
   Preview it in the JS eval tool with omp's headless browser (read `help://eval/browser` first):
   ```js
   const tab = await browser.open({ name: 'square-<id>-a', url: 'http://127.0.0.1:5173/preview.html?work=<id>', app: 'own', viewport: { width: 390, height: 844 } });
   await tab.emulate({ locale: 'zh-CN', colorScheme: 'light' });   // also check 'en-US' and colorScheme 'dark'
   await tab.reload();                                               // language is read at startup
   await tab.screenshot();                                           // surfaces as an image
   console.log(JSON.stringify((await tab.console()).entries));      // runtime errors
   ```
   Use tab names prefixed `square-<id>-`, and `await browser.close({ name })` when done.
   Drive every flow with real clicks/typing (`tab.click`, `tab.fill`, `tab.press`), reload to
   prove persistence, and screenshot both languages and both themes. Look at every screenshot
   critically: broken layout, clipped text, misalignment, invisible text or unstyled elements
   must be fixed.
   Headless Chromium ignores `emulate({ locale })` for `navigator.language`: there, override it
   with an init script and reload (the headless WebKit browser honours `locale`).
3. Done = step 1 prints clean, no console errors, and every feature of the task works in the
   preview in both languages and both themes.

## Non-goals
- Do not modify anything outside `square/<id>/workspace/` (no configs, scripts, package.json,
  other works, `square/craft-sdk.d.ts`, `src/`).
- Do not run `npm install`, `npm run build`, gradle or adb; do not start, restart or stop the
  dev server (if `http://127.0.0.1:5173/preview.html?work=<id>` does not answer, report it).
- No tests, README or changelog. No placeholder content presented as real data: sample data may
  only be shown when the user has none (e.g. a built-in word list), never fake user records.
