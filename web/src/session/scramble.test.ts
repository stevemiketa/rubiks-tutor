import { describe, expect, it } from 'vitest'
import { Cube, formatMove, formatMoves, type Move } from '../cube/index.ts'
import { generatePocketScramble, generateScramble } from './index.ts'

// The axis each outer Layer turns about.
const AXIS: Readonly<Record<string, string>> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' }

// A seeded source of random numbers in [0, 1) (mulberry32), so a failing
// Scramble can be reproduced from its seed.
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Every way a Scramble breaks the rules in spec #3, as readable messages.
function brokenRules(scramble: readonly Move[]): string[] {
  const broken: string[] = []
  if (scramble.length !== 25) broken.push(`has ${scramble.length} Turns, not 25`)
  scramble.forEach((move, i) => {
    const axis = AXIS[move.letter]
    if (axis === undefined) broken.push(`Turn ${i + 1} (${formatMove(move)}) isn't an outer-Layer Turn`)
    const previous = scramble[i - 1]
    if (previous?.letter === move.letter) broken.push(`Turns ${i} and ${i + 1} turn the same face`)
    const before = scramble[i - 2]
    if (previous && before && AXIS[before.letter] === axis && AXIS[previous.letter] === axis)
      broken.push(`Turns ${i - 1} to ${i + 1} share an axis`)
  })
  return broken
}

describe('generateScramble', () => {
  it('makes 25 outer-Layer Turns, never the same face twice in a row or three on one axis', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const scramble = generateScramble(seeded(seed))
      expect(brokenRules(scramble), `seed ${seed}: ${formatMoves(scramble)}`).toEqual([])
    }
  })

  it('keeps to the rules with the browser’s own random numbers', () => {
    for (let i = 0; i < 500; i++) {
      const scramble = generateScramble()
      expect(brokenRules(scramble), formatMoves(scramble)).toEqual([])
    }
  })

  it('uses every outer Layer and every amount of Turn', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 50; seed++) for (const move of generateScramble(seeded(seed))) seen.add(formatMove(move))
    expect([...seen].sort()).toEqual(
      ['B', "B'", 'B2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'L', "L'", 'L2', 'R', "R'", 'R2', 'U', "U'", 'U2'].sort(),
    )
  })

  it('makes a different Scramble each time it is asked', () => {
    const scrambles = new Set(Array.from({ length: 20 }, () => formatMoves(generateScramble())))
    expect(scrambles.size).toBe(20)
  })

  it('makes the same Scramble from the same random numbers', () => {
    expect(formatMoves(generateScramble(seeded(42)))).toBe(formatMoves(generateScramble(seeded(42))))
  })
})

// The faces a Pocket Cube Scramble is allowed to turn: the outer Layers only,
// never the middle Layers (M, E, S) or Cube rotations (x, y, z).
const CORNER_FACES = new Set(['R', 'L', 'U', 'D', 'F', 'B'])

// Every way a Pocket Scramble breaks its rules, as readable messages.
function brokenPocketRules(scramble: readonly Move[]): string[] {
  const broken: string[] = []
  if (scramble.length !== 15) broken.push(`has ${scramble.length} Turns, not 15`)
  scramble.forEach((move, i) => {
    if (!CORNER_FACES.has(move.letter)) broken.push(`Turn ${i + 1} (${formatMove(move)}) turns no corner face`)
    // No immediate self-cancellation: the same face never turns twice in a row.
    if (scramble[i - 1]?.letter === move.letter) broken.push(`Turns ${i} and ${i + 1} turn the same face`)
  })
  return broken
}

describe('generatePocketScramble', () => {
  it('makes 15 corner-only Turns, never the same face twice in a row', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const scramble = generatePocketScramble(seeded(seed))
      expect(brokenPocketRules(scramble), `seed ${seed}: ${formatMoves(scramble)}`).toEqual([])
    }
  })

  it('keeps to the rules with the browser’s own random numbers', () => {
    for (let i = 0; i < 500; i++) {
      const scramble = generatePocketScramble()
      expect(brokenPocketRules(scramble), formatMoves(scramble)).toEqual([])
    }
  })

  it('leaves the 30 Phantom Stickers solved, since every Move is corner-only', () => {
    const solved = Cube.solved().toString()
    const phantomsOf = (state: string): string =>
      // Keep only the non-corner Stickers: on each 3x3 face, indices 1,3,4,5,7
      // are edges and the center; the four corners are 0,2,6,8.
      state
        .split(' ')
        .map((face) => [...face].filter((_, i) => ![0, 2, 6, 8].includes(i)).join(''))
        .join(' ')
    for (let seed = 1; seed <= 200; seed++) {
      const cube = Cube.solved().applyPocket(generatePocketScramble(seeded(seed)))
      expect(phantomsOf(cube.toString()), `seed ${seed}`).toBe(phantomsOf(solved))
    }
  })

  it('uses every corner face and every amount of Turn', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 50; seed++) for (const move of generatePocketScramble(seeded(seed))) seen.add(formatMove(move))
    expect([...seen].sort()).toEqual(
      ['B', "B'", 'B2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'L', "L'", 'L2', 'R', "R'", 'R2', 'U', "U'", 'U2'].sort(),
    )
  })

  it('makes a different Scramble each time it is asked', () => {
    const scrambles = new Set(Array.from({ length: 20 }, () => formatMoves(generatePocketScramble())))
    expect(scrambles.size).toBe(20)
  })

  it('makes the same Scramble from the same random numbers', () => {
    expect(formatMoves(generatePocketScramble(seeded(42)))).toBe(formatMoves(generatePocketScramble(seeded(42))))
  })
})
