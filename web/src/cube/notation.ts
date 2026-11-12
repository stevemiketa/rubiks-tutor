// Move notation: outer Layers R L U D F B, middle Layers M E S, Cube
// rotations x y z, each with an optional suffix: ' for counterclockwise or 2
// for a half Turn. Matches internal/cube/move.go.

/** What a Move turns: an outer Layer, a middle Layer, or the whole Cube. */
export type Letter = 'R' | 'L' | 'U' | 'D' | 'F' | 'B' | 'M' | 'E' | 'S' | 'x' | 'y' | 'z'

/** Every Letter, in notation order. */
export const LETTERS: readonly Letter[] = ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z']

/**
 * How far a Move turns, in quarter turns clockwise as seen looking at the
 * Layer's face (for M, E and S: the face of L, D and F; for x, y and z: the
 * face of R, U and F). 1 is no suffix, 2 is suffix 2, -1 is suffix '.
 */
export type Amount = 1 | 2 | -1

/** A single Turn or Cube rotation. */
export interface Move {
  readonly letter: Letter
  readonly amount: Amount
}

/** The first invalid token in a Move sequence. */
export class ParseError extends Error {
  /** The invalid token's text. */
  readonly token: string
  /** The 0-based character offset where the token starts. */
  readonly offset: number

  constructor(token: string, offset: number) {
    super(`invalid Move "${token}" at offset ${offset}`)
    this.name = 'ParseError'
    this.token = token
    this.offset = offset
  }
}

function parseToken(token: string): Move | undefined {
  const letter = LETTERS.find((l) => l === token[0])
  if (letter === undefined || token.length > 2) return undefined
  if (token.length === 1) return { letter, amount: 1 }
  if (token[1] === "'") return { letter, amount: -1 }
  if (token[1] === '2') return { letter, amount: 2 }
  return undefined
}

/** Parses one Move token, such as R, M' or x2. Throws a ParseError. */
export function parseMove(token: string): Move {
  const move = parseToken(token)
  if (move === undefined) throw new ParseError(token, 0)
  return move
}

// Only ASCII whitespace separates tokens, as in the Go model.
const TOKEN = /[^ \t\n\r]+/g

/**
 * Parses a whitespace-separated Move sequence, such as "R U R' U'". An empty
 * or all-whitespace string is an empty sequence. Wide Turns (r, Rw) and
 * anything else outside the notation throw a ParseError for the first
 * invalid token.
 */
export function parseMoves(notation: string): Move[] {
  const moves: Move[] = []
  for (const match of notation.matchAll(TOKEN)) {
    const move = parseToken(match[0])
    // Everything before an invalid token is ASCII, so the UTF-16 index is
    // also the character offset.
    if (move === undefined) throw new ParseError(match[0], match.index)
    moves.push(move)
  }
  return moves
}

/** The Move that undoes a Move: R' for R, R for R', and R2 for R2. */
export function inverse(move: Move): Move {
  return move.amount === 2 ? move : { letter: move.letter, amount: move.amount === 1 ? -1 : 1 }
}

/** The sequence that undoes a sequence: each Move inverted, in reverse order. */
export function invert(moves: readonly Move[]): Move[] {
  return moves.map(inverse).reverse()
}

/** Whether a Move is a Cube rotation (x, y or z) rather than a Turn. */
export function isRotation(move: Move): boolean {
  return move.letter === 'x' || move.letter === 'y' || move.letter === 'z'
}

/** Prints a Move in standard notation, such as R, R' or R2. */
export function formatMove(move: Move): string {
  if (move.amount === -1) return `${move.letter}'`
  if (move.amount === 2) return `${move.letter}2`
  return move.letter
}

/** Prints a Move sequence in standard notation, separated by single spaces. */
export function formatMoves(moves: readonly Move[]): string {
  return moves.map(formatMove).join(' ')
}
