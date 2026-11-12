import { useEffect, useState, useSyncExternalStore } from 'react'
import { canRenderWebGL } from '../scene/webgl.tsx'
import { SessionStore, Tutor, browserStorage, commandForKey, type TutorState } from '../session/index.ts'

/**
 * The page's Tutor and its current state. The Tutor lives as long as the
 * component, and the tutor's keys anywhere on the page go to it, except in
 * text fields and while a modal dialog (such as the notation cheat sheet) is
 * open, which keeps Esc and the arrows for itself. It restores the Session
 * saved in browser storage, or starts a new one, and saves the Session after
 * every change.
 */
export function useTutor(): { tutor: Tutor; state: TutorState } {
  // StrictMode calls this twice in development and keeps the first Tutor. The
  // second finds the Session the first saved, so the two agree.
  const [tutor] = useState(() =>
    Tutor.open({
      store: new SessionStore(browserStorage()),
      // Without WebGL nothing animates the queue, so the Scramble is applied
      // at once, and so is every Move after it.
      reducedMotion: () => prefersReducedMotion() || !canRenderWebGL(),
      animates: canRenderWebGL,
    }),
  )
  const state = useSyncExternalStore(tutor.subscribe, tutor.getState)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextEntry(event.target) || document.querySelector('dialog:modal')) return
      // A held key repeats; only deliberate presses make Moves.
      if (event.repeat) {
        if (commandForKey(event) !== undefined) event.preventDefault()
        return
      }
      if (tutor.press(event)) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tutor])

  return { tutor, state }
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
