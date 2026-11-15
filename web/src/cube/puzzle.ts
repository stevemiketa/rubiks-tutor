// The Puzzle a Session solves. Both are modes of the one 3x3 engine (ADR
// 0005): 'cube' is the ordinary 3x3, 'pocket' is the 2x2 Pocket Cube, a
// corners-only 3x3 whose Moves permute only the 24 corner Stickers
// (Cube.applyPocket) and whose look enlarges the eight corner Pieces into a
// true 2x2x2.
export type Puzzle = 'cube' | 'pocket'

/** The default Puzzle: the ordinary 3x3, which a missing type always means. */
export const DEFAULT_PUZZLE: Puzzle = 'cube'

/** Whether a value is a Puzzle, for reading it back from saved or shared data. */
export function isPuzzle(value: unknown): value is Puzzle {
  return value === 'cube' || value === 'pocket'
}

/**
 * The puzzle type as the server's wire contract names it: '3x3' for the
 * 3x3 and '2x2' for the Pocket Cube. The solve request and the Snapshot body
 * both carry it, and a missing one reads as '3x3' (ADR 0005).
 */
export type PuzzleWireType = '3x3' | '2x2'

/** The wire type for a Puzzle: what the solve request and Snapshot body send. */
export function puzzleWireType(puzzle: Puzzle): PuzzleWireType {
  return puzzle === 'pocket' ? '2x2' : '3x3'
}

/** The Puzzle a wire type names; a missing or unknown one reads as the 3x3 (ADR 0005). */
export function puzzleFromWireType(type: unknown): Puzzle {
  return type === '2x2' ? 'pocket' : 'cube'
}
