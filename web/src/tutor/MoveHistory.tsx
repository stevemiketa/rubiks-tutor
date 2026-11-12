import { useEffect, useRef } from 'react'
import { formatMove, type Move } from '../cube/index.ts'

/**
 * Every Move in the Move history, in standard notation, as a list that
 * screen readers read and announce as it changes, with undo and redo.
 */
export function MoveHistory({
  moves,
  canUndo,
  canRedo,
  stepsSolution,
  onUndo,
  onRedo,
}: {
  moves: readonly Move[]
  canUndo: boolean
  canRedo: boolean
  /** Whether undo and redo are Step back and Step forward through a loaded Solution. */
  stepsSolution: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const list = useRef<HTMLOListElement>(null)

  // Keep the newest Move in view.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [moves.length])

  return (
    <section className="panel" aria-labelledby="history-heading">
      <div className="panel-heading">
        <h2 id="history-heading">Move history</h2>
        <div className="history-actions">
          <button
            type="button"
            className="action-button"
            disabled={!canUndo}
            aria-keyshortcuts="Control+Z Meta+Z"
            title={stepsSolution ? 'Step back through the Solution (Ctrl+Z or ⌘Z)' : 'Undo (Ctrl+Z or ⌘Z)'}
            onClick={onUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="action-button"
            disabled={!canRedo}
            aria-keyshortcuts="Shift+Control+Z Shift+Meta+Z"
            title={stepsSolution ? 'Step forward through the Solution (Shift+Ctrl+Z or Shift+⌘Z)' : 'Redo (Shift+Ctrl+Z or Shift+⌘Z)'}
            onClick={onRedo}
          >
            Redo
          </button>
        </div>
      </div>
      {moves.length === 0 && <p className="muted">No Moves yet.</p>}
      <ol ref={list} className="move-history" aria-labelledby="history-heading" aria-live="polite">
        {moves.map((move, i) => (
          // The history only changes at its end, so the index is a stable key.
          <li key={i} className="notation">
            {formatMove(move)}
          </li>
        ))}
      </ol>
    </section>
  )
}
