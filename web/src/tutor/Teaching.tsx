// What the Solution panel teaches as Playback goes: each Stage's Algorithm
// cards, and the Move Playback has reached with its note. Both read the
// Session's Teaching, so they follow whatever moved the position.
import { Fragment } from 'react'
import { formatMove } from '../cube/index.ts'
import { algorithmsOf, type Stage, type Teaching } from '../session/index.ts'

/**
 * A card for each Algorithm a Stage uses, with its name and notation. The
 * card for the Algorithm being performed is highlighted, and so is the Move
 * of it the Cube made last. Nothing for a Stage with no Algorithms.
 */
export function AlgorithmCards({ stage, teaching }: { stage: Stage; teaching: Teaching | undefined }) {
  const algorithms = algorithmsOf(stage)
  if (algorithms.length === 0) return null
  const performing = teaching?.stage.id === stage.id ? teaching.algorithm : undefined

  return (
    <ul className="algorithm-cards" aria-label={`${stage.name} Algorithms`}>
      {algorithms.map(({ name, moves }) => {
        const current = performing?.name === name
        return (
          <li key={name} className="algorithm-card" aria-current={current ? 'true' : undefined}>
            <span className="algorithm-name">{name}</span>{' '}
            <span className="notation algorithm-moves">
              {moves.map((move, i) => (
                // An Algorithm's Moves never change, so the index is a stable key.
                <Fragment key={i}>
                  {i > 0 && ' '}
                  <span className={current && performing.step === i ? 'performing' : undefined}>{formatMove(move)}</span>
                </Fragment>
              ))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The Move Playback has reached, the last one played: its note, or the
 * Algorithm it is part of. Screen readers hear each one as Playback goes.
 * Empty before any Move is played.
 */
export function ReachedMove({ teaching }: { teaching: Teaching | undefined }) {
  const move = teaching?.move
  const algorithm = teaching?.algorithm
  const about =
    algorithm !== undefined ? `${algorithm.name}, Move ${algorithm.step + 1} of ${algorithm.moves.length}` : move?.note
  return (
    <p className="reached-move" role="status">
      {move !== undefined && <span className="notation">{formatMove(move.move)}</span>}
      {move !== undefined && about !== undefined && `: ${about}`}
    </p>
  )
}
