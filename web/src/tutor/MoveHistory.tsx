import { useEffect, useRef } from 'react'
import { formatMove, type Move } from '../cube/index.ts'

/**
 * Every Move in the Move history, in standard notation, as a list that
 * screen readers read and announce as it grows.
 */
export function MoveHistory({ moves }: { moves: readonly Move[] }) {
  const list = useRef<HTMLOListElement>(null)

  // Keep the newest Move in view.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [moves.length])

  return (
    <section className="panel" aria-labelledby="history-heading">
      <h2 id="history-heading">Move history</h2>
      {moves.length === 0 && <p className="muted">No Moves yet.</p>}
      <ol ref={list} className="move-history" aria-labelledby="history-heading" aria-live="polite">
        {moves.map((move, i) => (
          // The history only grows at the end, so the index is a stable key.
          <li key={i} className="notation">
            {formatMove(move)}
          </li>
        ))}
      </ol>
    </section>
  )
}
