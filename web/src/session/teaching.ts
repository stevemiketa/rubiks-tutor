// What Playback teaches at a position in a Solution: the Stage it is in,
// the Move it has reached with that Move's note, and the Algorithm being
// performed. Worked out from the position alone, so it follows whatever
// moves the position: Play, Reverse, a step, the scrubber or a Stage jump.
import type { Move } from '../cube/index.ts'
import { stageStarts, type Solution, type SolutionMove, type Stage } from './solution.ts'

/** What Playback teaches at one position in a Solution. */
export interface Teaching {
  /**
   * The Stage Playback is in: the Stage of the last Move played, or the
   * first Stage before any Move is played. Its Pieces are the ones to
   * highlight.
   */
  readonly stage: Stage
  /**
   * The Move Playback has reached: the last one played, which the Cube is
   * showing, with its note if it has one. Undefined before any is played.
   */
  readonly move: SolutionMove | undefined
  /** The Algorithm being performed, if that Move is part of one. */
  readonly algorithm: PerformedAlgorithm | undefined
}

/** An Algorithm as a Stage's card shows it: its name and its Moves. */
export interface Algorithm {
  readonly name: string
  readonly moves: readonly Move[]
}

/** The Algorithm being performed, and how far into it Playback is. */
export interface PerformedAlgorithm extends Algorithm {
  /** Which of its Moves the Cube made last: 0 for the first. */
  readonly moveIndex: number
}

/**
 * The Algorithms a Stage uses, one card each, in the order the Stage first
 * uses them. An Algorithm used again and again, like the Corner trigger, is
 * one card.
 */
export function algorithmsOf(stage: Stage): readonly Algorithm[] {
  const byName = new Map<string, Algorithm>()
  for (const { name, moves } of stage.algorithms) if (!byName.has(name)) byName.set(name, { name, moves })
  return [...byName.values()]
}

/** What Playback teaches once position Moves of a Solution are played, or undefined if it has no Stages. */
export function teachingAt(solution: Solution, position: number): Teaching | undefined {
  const first = solution.stages[0]
  if (first === undefined) return undefined
  if (position <= 0) return { stage: first, move: undefined, algorithm: undefined }
  // The last Move played is in the last Stage that starts before it. A
  // Stage with no Moves starts where the next one does, so it is never it.
  const reached = position - 1
  const starts = stageStarts(solution)
  for (let i = solution.stages.length - 1; i >= 0; i--) {
    const stage = solution.stages[i]
    const start = starts[i]
    if (stage === undefined || start === undefined || start > reached) continue
    const index = reached - start
    const move = stage.moves[index]
    if (move === undefined) continue
    const use = stage.algorithms.find((a) => a.start <= index && index < a.start + a.moves.length)
    const algorithm = use && { name: use.name, moves: use.moves, moveIndex: index - use.start }
    return { stage, move, algorithm }
  }
  return { stage: first, move: undefined, algorithm: undefined }
}
