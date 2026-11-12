import { useRef, type KeyboardEvent } from 'react'
import { formatMoves, type Move } from '../cube/index.ts'

/**
 * The Session's Scramble in standard notation, so the learner can copy it
 * onto a physical Cube, and the "New scramble" button. When the tutor asks
 * before replacing the Session, the question appears here, in the page.
 */
export function ScramblePanel({
  scramble,
  confirming,
  movesMade,
  onNewScramble,
  onConfirm,
  onCancel,
}: {
  scramble: readonly Move[]
  /** Whether the tutor is asking to confirm a new Scramble. */
  confirming: boolean
  /** How many Moves the learner would lose. */
  movesMade: number
  onNewScramble: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const newScrambleButton = useRef<HTMLButtonElement>(null)

  // Once the question is answered it disappears, so put the focus back where
  // the learner started.
  const answer = (choice: () => void) => () => {
    choice()
    newScrambleButton.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    // The tutor's own keys mustn't see this Escape.
    event.preventDefault()
    answer(onCancel)()
  }

  return (
    <section className="panel" aria-labelledby="scramble-heading">
      <div className="panel-heading">
        <h2 id="scramble-heading">Scramble</h2>
        <button ref={newScrambleButton} type="button" className="action-button" onClick={onNewScramble}>
          New scramble
        </button>
      </div>
      <p className="notation scramble">{formatMoves(scramble)}</p>

      {confirming && (
        <div
          className="confirm"
          role="alertdialog"
          aria-labelledby="new-scramble-question"
          aria-describedby="new-scramble-detail"
          onKeyDown={onKeyDown}
        >
          <p id="new-scramble-question" className="confirm-question">
            Start a new scramble?
          </p>
          <p id="new-scramble-detail">
            This Cube and the {movesMade === 1 ? 'Move' : `${movesMade} Moves`} you made on it will be lost.
          </p>
          <div className="confirm-actions">
            <button type="button" className="action-button danger" onClick={answer(onConfirm)}>
              Start a new scramble
            </button>
            {/* The safe answer has the focus, so Enter can't lose work by accident. */}
            <button type="button" className="action-button" onClick={answer(onCancel)} autoFocus>
              Keep this Cube
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
