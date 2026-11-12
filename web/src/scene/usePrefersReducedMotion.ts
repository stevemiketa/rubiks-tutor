// Whether the visitor has asked for reduced motion: the one place the app
// reads the setting.
import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/** Whether the visitor has asked for reduced motion, right now. False where the browser can't say. */
export const prefersReducedMotion = (): boolean => window.matchMedia?.(QUERY).matches ?? false

/**
 * Whether the visitor has asked for reduced motion, kept current if they
 * change the setting while the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion)
}
