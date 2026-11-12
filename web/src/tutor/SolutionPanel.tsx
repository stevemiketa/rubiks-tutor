import { useEffect, useRef } from 'react'
import { formatMove } from '../cube/index.ts'
import { stageStarts, type Session, type Solution, type SolveStatus } from '../session/index.ts'
import { PlaybackControls, type Playback } from './PlaybackControls.tsx'

/**
 * The Solve button and, once a Solution is loaded, its Stages, each with its
 * Moves in notation, and the Playback controls. Also says when the Cube is
 * already solved, and offers a retry when Solve fails.
 */
export function SolutionPanel({
  session,
  status,
  disabled,
  onSolve,
  playback,
}: {
  /** The Session, with its loaded Solution, if any, and where Playback is in it. */
  session: Session
  status: SolveStatus
  /** Whether Solve must wait, as it does while the Scramble plays. */
  disabled: boolean
  onSolve: () => void
  playback: Playback
}) {
  const { solution } = session

  return (
    <section className="panel" aria-labelledby="solution-heading">
      <div className="panel-heading">
        <h2 id="solution-heading">Solution</h2>
        <button
          type="button"
          className="action-button"
          disabled={disabled || status === 'solving'}
          onClick={onSolve}
        >
          Solve
        </button>
      </div>

      <p role="status" className="solve-status">
        {status === 'solving' && 'Solving…'}
        {status === 'already-solved' && 'The Cube is already solved.'}
      </p>
      {status === 'failed' && (
        <div className="solve-error" role="alert">
          <p>Solve couldn’t get a Solution. Check your connection, then try again.</p>
          <button type="button" className="action-button" onClick={onSolve}>
            Retry
          </button>
        </div>
      )}

      {solution === undefined ? (
        status === 'idle' && <p className="muted">Stuck? Solve shows you the rest of the way, one Stage at a time.</p>
      ) : solution.stages.length === 0 ? (
        <p>Every Stage that Solve can show so far is already finished.</p>
      ) : (
        <>
          <StageList
            solution={solution}
            position={session.position}
            onJump={(index) => playback.jumpToStage(index)}
          />
          <PlaybackControls session={session} playback={playback} />
        </>
      )}
    </section>
  )
}

/**
 * The Solution's Stages by name, each a button that jumps to its first
 * Move, with its Moves in notation below. The Move the Cube made last is
 * highlighted, and kept in view as Playback goes.
 */
function StageList({
  solution,
  position,
  onJump,
}: {
  solution: Solution
  position: number
  onJump: (index: number) => void
}) {
  const list = useRef<HTMLOListElement>(null)
  const starts = stageStarts(solution)

  // Scroll the list, not the page, so the 3D view stays where it is.
  useEffect(() => {
    const el = list.current
    const current = el?.querySelector('[aria-current="step"]')
    if (!el || !current) return
    const box = el.getBoundingClientRect()
    const item = current.getBoundingClientRect()
    if (item.top < box.top) el.scrollTop -= box.top - item.top
    else if (item.bottom > box.bottom) el.scrollTop += item.bottom - box.bottom
  }, [position])

  return (
    <ol ref={list} className="stage-list" aria-label="Stages">
      {solution.stages.map((stage, i) => {
        const start = starts[i] ?? 0
        return (
          <li key={stage.id}>
            <button type="button" className="stage-name" title="Jump to this Stage’s first Move" onClick={() => onJump(i)}>
              {stage.name}
            </button>
            {stage.moves.length === 0 ? (
              <p className="muted">Already finished.</p>
            ) : (
              <ol className="notation stage-moves" aria-label={`${stage.name} Moves`}>
                {stage.moves.map(({ move }, j) => (
                  // A Solution never changes once loaded, so the index is a stable key.
                  <li key={j} aria-current={start + j === position - 1 ? 'step' : undefined}>
                    {formatMove(move)}
                  </li>
                ))}
              </ol>
            )}
          </li>
        )
      })}
    </ol>
  )
}
