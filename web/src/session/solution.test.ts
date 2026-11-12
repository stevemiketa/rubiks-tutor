import { describe, expect, it } from 'vitest'
import { formatMoves } from '../cube/index.ts'
import { parseSolveResponse } from './index.ts'

// A POST /api/solve body as the Go solver returns it.
const whiteCross = {
  id: 'white-cross',
  name: 'White cross',
  goal: 'Make a white cross on top, with each edge matching the center beside it.',
  moves: "x2 U' R2",
  notes: [
    { at: 0, text: 'turn the Cube over so the white center is on top' },
    { at: 2, text: 'put the white-red edge in place, white on top, next to the red center' },
  ],
  algorithms: [],
  pieces: ['white-green edge', 'white-blue edge', 'white-red edge', 'white-orange edge'],
}

describe('parseSolveResponse', () => {
  it('reads an already-solved Cube', () => {
    expect(parseSolveResponse({ solved: true })).toEqual({ solved: true })
  })

  it('reads each Stage, with its Moves, the note on each Move, its Algorithms and its Pieces', () => {
    const corners = {
      id: 'white-corners',
      name: 'White corners',
      goal: 'Fill in the white corners to finish the first layer.',
      moves: "U R' D' R D",
      notes: [{ at: 0, text: 'bring the corner above its spot' }],
      algorithms: [{ name: 'Corner trigger', notation: "R' D' R D", start: 1, length: 4 }],
      pieces: ['white-green-red corner'],
    }

    const result = parseSolveResponse({ solved: false, stages: [whiteCross, corners] })

    if (result.solved) throw new Error('read as solved')
    const [cross, second] = result.solution.stages
    expect(cross?.id).toBe('white-cross')
    expect(cross?.name).toBe('White cross')
    expect(cross?.goal).toBe(whiteCross.goal)
    expect(cross?.moves.map((m) => [formatMoves([m.move]), m.note])).toEqual([
      ['x2', 'turn the Cube over so the white center is on top'],
      ["U'", undefined],
      ['R2', 'put the white-red edge in place, white on top, next to the red center'],
    ])
    expect(cross?.algorithms).toEqual([])
    expect(cross?.pieces).toEqual(whiteCross.pieces)
    expect(second?.algorithms.map((a) => [a.name, formatMoves(a.moves), a.start])).toEqual([
      ['Corner trigger', "R' D' R D", 1],
    ])
    expect(formatMoves(result.solution.moves)).toBe("x2 U' R2 U R' D' R D")
  })

  it('reads a Solution with no Stages', () => {
    expect(parseSolveResponse({ solved: false, stages: [] })).toMatchObject({ solved: false, solution: { stages: [] } })
  })

  it.each([
    ['not an object', 'solved'],
    ['no Stages', { solved: false }],
    ['a Stage that isn’t an object', { solved: false, stages: [7] }],
    ['a Stage without a name', { solved: false, stages: [{ ...whiteCross, name: undefined }] }],
    ['Moves that aren’t notation', { solved: false, stages: [{ ...whiteCross, moves: 'R Rw' }] }],
    ['a note on no Move', { solved: false, stages: [{ ...whiteCross, notes: [{ at: 3, text: 'x' }] }] }],
    [
      'an Algorithm that isn’t where it says',
      { solved: false, stages: [{ ...whiteCross, algorithms: [{ name: 'A', notation: 'R2', start: 0, length: 1 }] }] },
    ],
    ['Pieces that aren’t names', { solved: false, stages: [{ ...whiteCross, pieces: [1] }] }],
  ])('rejects %s', (_, data) => {
    expect(() => parseSolveResponse(data)).toThrow()
  })
})
