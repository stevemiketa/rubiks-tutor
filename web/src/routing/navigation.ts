import { useMemo, useSyncExternalStore } from 'react'
import { parseRoute, type Route } from './route.ts'

// The browser's address is the source of truth for the current Route.
// navigate() changes it without a page load and tells subscribers, and so
// does the back button through popstate.

const navigateEvent = 'cubular:navigate'

export function navigate(path: string, { replace = false } = {}): void {
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new Event(navigateEvent))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  window.addEventListener(navigateEvent, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(navigateEvent, onChange)
  }
}

function currentPathname(): string {
  return window.location.pathname
}

/** The page the address bar points at, or undefined for a path no page has: see parseRoute. */
export function useRoute(): Route | undefined {
  const pathname = useSyncExternalStore(subscribe, currentPathname)
  return useMemo(() => parseRoute(pathname), [pathname])
}
