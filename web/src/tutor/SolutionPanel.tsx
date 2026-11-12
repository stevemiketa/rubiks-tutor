import type { Solution, SolveStatus } from '../session/index.ts'

/**
 * The Solve button and, once a Solution is loaded, its Stages by name and
 * the Playback controls. Also says when the Cube is already solved, and
 * offers a retry when Solve fails.
 */
export function SolutionPanel({
  solution,
  position,
  playing,
  status,
  disabled,
  onSolve,
  onPlay,
  onPause,
}: {
  solution: Solution | undefined
  /** How many of the Solution's Moves have been played. */
  position: number
  playing: boolean
  status: SolveStatus
  /** Whether Solve must wait, as it does while the Scramble plays. */
  disabled: boolean
  onSolve: () => void
  onPlay: () => void
  onPause: () => void
}) {
  const total = solution?.moves.length ?? 0

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
          <ol className="stage-list" aria-label="Stages">
            {solution.stages.map((stage) => (
              <li key={stage.id}>{stage.name}</li>
            ))}
          </ol>
          <div className="playback" role="group" aria-label="Playback">
            <button
              type="button"
              className="action-button"
              disabled={!playing && position === total}
              onClick={playing ? onPause : onPlay}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <p className="muted">
              {position} of {total} Moves played
            </p>
          </div>
        </>
      )}
    </section>
  )
}
