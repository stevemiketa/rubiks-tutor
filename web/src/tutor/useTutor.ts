import { useEffect, useState, useSyncExternalStore } from 'react'
import { prefersReducedMotion } from '../scene/usePrefersReducedMotion.ts'
import { canRenderWebGL } from '../scene/webgl.tsx'
import { SessionStore, Tutor, browserStorage, type TutorState } from '../session/index.ts'

/**
 * The page's Tutor and its current state. The Tutor lives as long as the
 * component, and the tutor's keys anywhere on the page go to it, except the
 * keys a focused control keeps for itself (see keepsKey), and while a modal
 * dialog (such as the notation cheat sheet) is open, which keeps Esc and the
 * arrows for itself. While a Solution is loaded, Space plays and pauses even
 * on a focused button, which it then doesn't press. It restores the Session
 * saved in browser storage, or starts a new one, and saves the Session after
 * every change. Opened from a share link, it opens that link's Snapshot
 * instead; snapshotId is read only when the page first appears.
 */
export function useTutor(snapshotId?: string): { tutor: Tutor; state: TutorState } {
  // StrictMode calls this twice in development and keeps the first Tutor. The
  // second finds the Session the first saved, or loads the same Snapshot, so
  // the two agree.
  const [tutor] = useState(() =>
    Tutor.open(
      {
        store: new SessionStore(browserStorage()),
        // Without WebGL nothing animates the queue, so the Scramble is applied
        // at once, and so is every Move after it.
        reducedMotion: () => prefersReducedMotion() || !canRenderWebGL(),
        animates: canRenderWebGL,
      },
      snapshotId,
    ),
  )
  const state = useSyncExternalStore(tutor.subscribe, tutor.getState)

  useEffect(() => {
    // Whether the tutor took the Space key that is down now.
    let tookSpace = false
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keepsKey(event.target, event.key) || document.querySelector('dialog:modal')) return
      const command = tutor.commandFor(event)
      if (command === undefined) return
      event.preventDefault()
      if (event.key === ' ') tookSpace = true
      // A held key repeats; only deliberate presses make Moves.
      if (!event.repeat) tutor.run(command)
    }
    // Some browsers press a focused button when Space comes back up, even
    // though its keydown was taken.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !tookSpace) return
      tookSpace = false
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [tutor])

  return { tutor, state }
}

// The keys a slider, such as Playback's scrubber, moves itself with.
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

/**
 * Whether the focused element keeps a key for itself rather than leaving it
 * to the tutor: every key in a text field, a slider's own keys, and Space on
 * a button in an in-page dialog, which presses it as in any dialog.
 */
function keepsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement && target.type === 'range') return SLIDER_KEYS.has(key)
  if (key === ' ' && target.closest('[role="alertdialog"], [role="dialog"]') !== null) return true
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
