// Scrambles: the random Turns that start a Session, generated in the browser.
import type { Amount, Letter, Move } from '../cube/index.ts'

/** How many Turns a Scramble has. */
const SCRAMBLE_LENGTH = 25

/** How long a new Session's Scramble takes to play, in ms. */
const SCRAMBLE_MS = 2000

/** How long each Turn of a Scramble takes to play, in ms: about two seconds for all of them. */
export const SCRAMBLE_TURN_MS = SCRAMBLE_MS / SCRAMBLE_LENGTH

// The outer Layers, by the axis they turn about. Opposite faces share an axis.
const AXES: readonly (readonly Letter[])[] = [
  ['R', 'L'],
  ['U', 'D'],
  ['F', 'B'],
]
const AMOUNTS: readonly Amount[] = [1, 2, -1]

const axisOf = (letter: Letter): number => AXES.findIndex((faces) => faces.includes(letter))

/**
 * How many Turns a Pocket Cube Scramble has. Shorter than the 3x3's: a 2x2 has
 * only its eight corners, so fewer Turns reach every position.
 */
const POCKET_SCRAMBLE_LENGTH = 15

/** The outer faces a Pocket Cube Scramble turns, flattened: no middle Layers, no rotations. */
const CORNER_FACES: readonly Letter[] = AXES.flat()

/**
 * A new Scramble: 25 random outer-Layer Turns. The same face never turns
 * twice in a row, and no three Turns in a row share an axis (no `R L R`), so
 * no Turn cancels or merges with another. random returns numbers in [0, 1),
 * like Math.random; tests pass a seeded one.
 */
export function generateScramble(random: () => number = Math.random): Move[] {
  const scramble: Move[] = []
  while (scramble.length < SCRAMBLE_LENGTH) {
    const last = scramble.at(-1)
    const beforeLast = scramble.at(-2)
    // After two Turns on one axis, the third must turn about another.
    const blockedAxis =
      last && beforeLast && axisOf(last.letter) === axisOf(beforeLast.letter) ? axisOf(last.letter) : -1
    const faces = AXES.flatMap((faces, axis) => (axis === blockedAxis ? [] : faces)).filter((f) => f !== last?.letter)
    scramble.push({ letter: pick(faces, random), amount: pick(AMOUNTS, random) })
  }
  return scramble
}

/**
 * A new Pocket Cube Scramble: 15 random corner-only face Turns (R L U D F B
 * and their primes and doubles), applied with Cube.applyPocket. No middle
 * Layers (M, E, S) or Cube rotations (x, y, z), since a 2x2 has no middles,
 * and the same face never turns twice in a row, so no Turn cancels the one
 * before it. random returns numbers in [0, 1), like Math.random; tests pass a
 * seeded one.
 */
export function generatePocketScramble(random: () => number = Math.random): Move[] {
  const scramble: Move[] = []
  while (scramble.length < POCKET_SCRAMBLE_LENGTH) {
    const last = scramble.at(-1)
    const faces = CORNER_FACES.filter((f) => f !== last?.letter)
    scramble.push({ letter: pick(faces, random), amount: pick(AMOUNTS, random) })
  }
  return scramble
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) throw new RangeError('random() must return a number in [0, 1)')
  return item
}
