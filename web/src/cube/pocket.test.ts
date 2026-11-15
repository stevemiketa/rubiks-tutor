// Property-style tests for the 2x2 Pocket Cube corner-only Move engine
// (ADR 0005), mirroring internal/cube/pocket_test.go: over many random
// sequences of face Turns, applyPocket must leave every Phantom Sticker (edge
// or center) frozen at its solved color, and must agree with the full 3x3 on
// every corner Sticker.
import { describe, expect, it } from 'vitest'
import { Cube, parseMoves, type Move, type Sticker } from './index.ts'

const EVERY_FACE_TURN = "R R' R2 L L' L2 U U' U2 D D' D2 F F' F2 B B' B2"
const FACE_TURNS = parseMoves(EVERY_FACE_TURN)

const isCornerSticker = (s: Sticker): boolean => [0, 2, 6, 8].includes(s % 9)

// A small deterministic generator so the property runs the same every time.
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function randomPocketMoves(rand: () => number, n: number): Move[] {
  const moves: Move[] = []
  for (let i = 0; i < n; i++) {
    const move = FACE_TURNS[Math.floor(rand() * FACE_TURNS.length)]
    if (move !== undefined) moves.push(move)
  }
  return moves
}

describe('applyPocket', () => {
  it('leaves every Phantom Sticker frozen over random face Turns', () => {
    const rand = makeRandom(43)
    const solved = Cube.solved()
    for (let trial = 0; trial < 2000; trial++) {
      const moves = randomPocketMoves(rand, Math.floor(rand() * 40))
      const got = solved.applyPocket(moves)
      for (let s = 0; s < 54; s++) {
        if (!isCornerSticker(s)) expect(got.at(s)).toBe(solved.at(s))
      }
    }
  })

  it('agrees with the full 3x3 on every corner Sticker', () => {
    const rand = makeRandom(430)
    const solved = Cube.solved()
    for (let trial = 0; trial < 2000; trial++) {
      const moves = randomPocketMoves(rand, Math.floor(rand() * 40))
      const full = solved.apply(moves)
      const pocket = solved.applyPocket(moves)
      for (let s = 0; s < 54; s++) {
        if (isCornerSticker(s)) expect(pocket.at(s)).toBe(full.at(s))
      }
    }
  })
})
