import { describe, expect, it } from 'vitest'
import { Cube, formatMoves, invert, isRotation, type Move } from '../cube/index.ts'
import { SPLASH_SCRAMBLE, SPLASH_SOLUTION } from './recording.ts'

const SOLVED = 'WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB'
const OUTER = new Set(['R', 'L', 'U', 'D', 'F', 'B'])
const AXIS: Readonly<Record<string, string>> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' }
const axisOf = (m: Move): string => AXIS[m.letter] ?? m.letter

describe('the splash page recording', () => {
  it('scrambles with outer-layer Turns only, as a Scramble does', () => {
    expect(SPLASH_SCRAMBLE.length).toBeGreaterThanOrEqual(20)
    expect(SPLASH_SCRAMBLE.filter((m) => !OUTER.has(m.letter))).toEqual([])
  })

  it('never turns the same face twice in a row, or one axis three times in a row', () => {
    SPLASH_SCRAMBLE.forEach((move, i) => {
      const before = SPLASH_SCRAMBLE[i - 1]
      const twoBefore = SPLASH_SCRAMBLE[i - 2]
      expect(before?.letter, `Turn ${i + 1}`).not.toBe(move.letter)
      if (before && twoBefore) expect([axisOf(twoBefore), axisOf(before)], `Turn ${i + 1}`).not.toEqual([axisOf(move), axisOf(move)])
    })
  })

  it('leaves a solved Cube scrambled', () => {
    expect(Cube.solved().apply(SPLASH_SCRAMBLE).isSolved()).toBe(false)
  })

  it('solves the scrambled Cube back to the exact Cube it started from, so the loop restarts without a jump', () => {
    const end = Cube.solved().apply([...SPLASH_SCRAMBLE, ...SPLASH_SOLUTION])
    expect(end.toString()).toBe(SOLVED)
  })

  it('solves the Cube rather than playing the scramble backwards', () => {
    const turns = (ms: readonly Move[]) => formatMoves(ms.filter((m) => !isRotation(m)))
    expect(turns(SPLASH_SOLUTION)).not.toBe(formatMoves(invert(SPLASH_SCRAMBLE)))
  })
})
