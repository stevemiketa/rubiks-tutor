import { useEffect, useRef } from 'react'
import { formatMove } from '../cube/index.ts'
import { stageStarts, type Session, type Solution, type SolveStatus, type Teaching } from '../session/index.ts'
import { PlaybackControls, type Playback } from './PlaybackControls.tsx'
import { AlgorithmCards, ReachedMove } from './Teaching.tsx'

/**
 * The Solve button and, once a Solution is loaded, its Stages, each with its
 * goal, its Algorithm cards and its Moves in notation, the Move Playback has
 * reached with its note, the Playback controls, and a button that closes it.
 * Also says when the Cube is already solved, offers a retry when Solve fails,
 * and offers to solve again once a Turn has made the Solution stale.
 */
export function SolutionPanel({
  session,
  status,
  disabled,
  onSolve,
  onClose,
  playback,
}: {
  /** The Session, with its loaded Solution, if any, and where Playback is in it. */
  session: Session
  status: SolveStatus
  /** Whether Solve must wait, as it does while the Scramble plays. */
  disabled: boolean
  onSolve: () => void
  /** Closes the loaded Solution, keeping the Cube as it is. */
  onClose: () => void
  playback: Playback
}) {
  const { solution, stale } = session
  const cantSolve = disabled || status === 'solving'

  return (
    <section className="panel" aria-labelledby="solution-heading">
      <div className="panel-heading">
        <h2 id="solution-heading">Solution</h2>
        <div className="panel-actions">
          {solution !== undefined && (
            <button
              type="button"
              className="action-button"
              title="Close the Solution. Its Moves played stay in the Move history."
              onClick={onClose}
            >
              Close Solution
            </button>
          )}
          <button type="button" className="action-button" disabled={cantSolve} onClick={onSolve}>
            Solve
          </button>
        </div>
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

      {stale && (
        <div className="stale-solution" role="alert">
          <p>You turned a Layer, so this Solution no longer fits the Cube. Its Moves played are in the Move history.</p>
          <button type="button" className="action-button" disabled={cantSolve} onClick={onSolve}>
            Solve again
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
            teaching={session.teaching}
            stale={stale}
            onJump={(index) => playback.jumpToStage(index)}
          />
          {/* A stale Solution is only there to look back on: nothing in it can be played. */}
          {!stale && <ReachedMove teaching={session.teaching} />}
          {!stale && <PlaybackControls session={session} playback={playback} />}
        </>
      )}
    </section>
  )
}

/**
 * The Solution's Stages by name, each a button that jumps to its first
 * Move, with its goal, its Algorithm cards and its Moves in notation below.
 * The Stage Playback is in, the Algorithm being performed and the Move the
 * Cube made last are highlighted, and kept in view as Playback goes. A stale
 * Solution's Stages are dimmed, and jump nowhere.
 */
function StageList({
  solution,
  position,
  teaching,
  stale,
  onJump,
}: {
  solution: Solution
  position: number
  teaching: Teaching | undefined
  stale: boolean
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
    <ol ref={list} className={stale ? 'stage-list stale' : 'stage-list'} aria-label="Stages">
      {solution.stages.map((stage, i) => {
        const start = starts[i] ?? 0
        return (
          <li key={stage.id} aria-current={stage.id === teaching?.stage.id ? 'true' : undefined}>
            <button
              type="button"
              className="stage-name"
              title="Jump to this Stage’s first Move"
              disabled={stale}
              onClick={() => onJump(i)}
            >
              {stage.name}
            </button>
            <p className="stage-goal">{stage.goal}</p>
            <AlgorithmCards stage={stage} teaching={teaching} />
            {stage.moves.length === 0 ? (
              <p className="muted">Already finished.</p>
            ) : (
              <ol className="notation stage-moves" aria-label={`${stage.name} Moves`}>
                {stage.moves.map(({ move }, j) => (
                  // Each item is only its Move's notation, so the index is a fine key,
                  // even once a Cube rotation goes into the Stage.
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
