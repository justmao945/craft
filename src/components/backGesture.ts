import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'

/** Back handlers of the open pages and overlays, bottom layer first. */
const layers: (() => void)[] = []
let listening = false

function dispatch(): void {
  const top = layers.at(-1)
  // With nothing to close the app leaves the foreground (web builds have no such action).
  if (top) top()
  else void App.minimizeApp().catch(() => {})
}

/**
 * Runs `onBack` on the system back gesture while `enabled`. The layer enabled most recently is
 * handled first (an overlay above its page, a page above the tabs); `onBack` may change every
 * render without re-registering.
 */
export function useBackGesture(enabled: boolean, onBack: () => void): void {
  const handler = useRef(onBack)
  useEffect(() => {
    handler.current = onBack
  })
  useEffect(() => {
    if (!enabled) return
    if (!listening) {
      listening = true
      void App.addListener('backButton', dispatch)
    }
    const layer = () => handler.current()
    layers.push(layer)
    return () => {
      layers.splice(layers.indexOf(layer), 1)
    }
  }, [enabled])
}
