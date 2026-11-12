// The splash page's prerecorded loop: the Cube a Scramble leaves, and a
// Solution for it by the beginner's layer-by-layer Method. The splash page
// starts on that scrambled Cube and plays only the Solution, so it never
// animates the Scramble. Recorded once, so the splash page needs no server;
// recording.test.ts checks it with the cube model.
import { Cube, parseMoves, type Move } from '../cube/index.ts'

/** 25 outer-layer Turns, following the tutor's Scramble rules. */
export const SPLASH_SCRAMBLE: readonly Move[] = parseMoves(
  "U R2 D' B2 D2 R' D2 L' R B2 U2 R2 D' B2 F U2 D R B D2 B L' F L2 R'",
)

// The Solution's Moves, one entry per Stage, using the Method's Algorithms.
// White starts on top; the middle layer starts by rotating the Cube so white
// is on the bottom, so the Cube ends solved with yellow on top, as the
// tutor's Solutions do.
const SOLUTION_BY_STAGE: readonly (readonly [stage: string, notation: string])[] = [
  ['white-cross', "F2 R' U2 F' U2 D' L2"],
  ['white-corners', "L' D' L D2 F' D' F D B' D' B D L' D' L B' D' B D"],
  ['middle-edges', "x2 U B U' B' U' R' U R U2 L' U L U F U' F' U2 L U' L' U' B' U B"],
  ['yellow-cross', "F R U R' U' F' U2 F R U R' U' F' U2 F R U R' U' F'"],
  ['yellow-face', "R U R' U R U2 R'"],
  ['yellow-corners', 'U'],
  ['yellow-edges', "U R U' R U R U R U' R' U' R2 U' R U' R U R U R U' R' U' R2"],
]

const movesThrough = (stage: string): Move[] =>
  SOLUTION_BY_STAGE.slice(0, SOLUTION_BY_STAGE.findIndex(([name]) => name === stage) + 1).flatMap(([, notation]) =>
    parseMoves(notation),
  )

/** The Cube every pass of the loop starts from: the one SPLASH_SCRAMBLE leaves. */
export const SPLASH_START: Cube = Cube.solved().apply(SPLASH_SCRAMBLE)

/** The Solution for SPLASH_START. */
export const SPLASH_SOLUTION: readonly Move[] = movesThrough('yellow-edges')

/** The still Cube shown under reduced motion: partway through the Solution, its white layer finished on top. */
export const SPLASH_STILL: Cube = SPLASH_START.apply(movesThrough('white-corners'))
