// What Playback teaches at each position in a Solution: the Stage it is in,
// the Move it has reached with that Move's note, and the Algorithm being
// performed.
import { describe, expect, it } from 'vitest'
import { formatMove, formatMoves } from '../cube/index.ts'
import { Session, algorithmsOf, parseSolveResponse, type Solution } from './index.ts'

function solutionOf(data: unknown): Solution {
  const result = parseSolveResponse(data)
  if (result.solved) throw new Error('read as solved')
  return result.solution
}

// A small hand-written Solution: notes on the Moves outside Algorithms, the
// same Algorithm twice in a row, and two Algorithms in one Stage.
const handWritten = solutionOf({
  solved: false,
  stages: [
    {
      id: 'white-cross',
      name: 'White cross',
      goal: 'Make a white cross on top, with each edge matching the center beside it.',
      moves: "x2 U' R2",
      notes: [
        { at: 0, text: 'turn the Cube over so the white center is on top' },
        { at: 2, text: 'put the white-red edge in place, white on top, next to the red center' },
      ],
      algorithms: [],
      pieces: ['white-green edge', 'white-red edge', 'white-blue edge', 'white-orange edge'],
    },
    {
      id: 'white-corners',
      name: 'White corners',
      goal: 'Fill in the white corners to finish the first layer.',
      moves: "y R' D' R D R' D' R D D",
      notes: [
        { at: 0, text: 'rotate so the white-green-red corner’s place is at front-right' },
        { at: 9, text: 'turn the bottom so the white-blue-red corner is below its place' },
      ],
      algorithms: [
        { name: 'Corner trigger', notation: "R' D' R D", start: 1, length: 4 },
        { name: 'Corner trigger', notation: "R' D' R D", start: 5, length: 4 },
      ],
      pieces: ['white-green-red corner', 'white-green-orange corner', 'white-blue-red corner', 'white-blue-orange corner'],
    },
    {
      id: 'middle-edges',
      name: 'Middle layer',
      goal: 'Rotate the Cube so white is on the bottom, then place the four middle-layer edges.',
      moves: "x2 U U R U' R' U' F' U F U' L' U L U F U' F'",
      notes: [
        { at: 0, text: 'turn the Cube over so the white center is on the bottom' },
        { at: 1, text: 'turn the top so the green-red edge is above the green center' },
      ],
      algorithms: [
        { name: 'Right insert', notation: "U R U' R' U' F' U F", start: 2, length: 8 },
        { name: 'Left insert', notation: "U' L' U L U F U' F'", start: 10, length: 8 },
      ],
      pieces: ['green-red edge', 'green-orange edge', 'blue-red edge', 'blue-orange edge'],
    },
  ],
})

// Recorded from the Go solver (POST /api/solve) for the Scramble "R U2 F".
const recordedBody = {
  solved: false,
  stages: [
    {
      id: 'white-cross',
      name: 'White cross',
      goal: 'Make a white cross on top, with each edge matching the center beside it.',
      moves: "U2 R' R' B R",
      notes: [
        { at: 0, text: 'put the white-green edge in place, white on top, next to the green center' },
        { at: 1, text: 'put the white-red edge in place, white on top, next to the red center' },
        { at: 2, text: 'move the white-blue edge toward its place; this moves the white-red edge out of the way for now' },
        { at: 3, text: 'move the white-blue edge toward its place next to the blue center' },
        { at: 4, text: 'bring back the white-red edge, which completes it with the white-blue edge in place' },
      ],
      algorithms: [],
      pieces: ['white-green edge', 'white-red edge', 'white-blue edge', 'white-orange edge'],
    },
    {
      id: 'white-corners',
      name: 'White corners',
      goal: 'Fill in the white corners to finish the first layer.',
      moves: "D2 R' D' R D R' D' R D R' D' R D R' D' R D R' D' R D",
      notes: [{ at: 0, text: 'turn the bottom so the white-green-red corner is below its place' }],
      algorithms: [1, 5, 9, 13, 17].map((start) => ({ name: 'Corner trigger', notation: "R' D' R D", start, length: 4 })),
      pieces: ['white-green-red corner', 'white-green-orange corner', 'white-blue-red corner', 'white-blue-orange corner'],
    },
    {
      id: 'middle-edges',
      name: 'Middle layer',
      goal: 'Rotate the Cube so white is on the bottom, then place the four middle-layer edges.',
      moves: "x2 U2 U' L' U L U F U' F' y U2 U R U' R' U' F' U F y2 U2 U' L' U L U F U' F'",
      notes: [
        { at: 0, text: 'turn the Cube over so the white center is on the bottom' },
        { at: 1, text: 'turn the top so the blue-orange edge is above the blue center' },
        { at: 10, text: 'rotate so the red center is in front, for the green-red edge' },
        { at: 11, text: 'turn the top so the green-red edge is above the red center' },
        { at: 20, text: 'rotate so the orange center is in front, for the green-orange edge' },
        { at: 21, text: 'turn the top so the green-orange edge is above the orange center' },
      ],
      algorithms: [
        { name: 'Left insert', notation: "U' L' U L U F U' F'", start: 2, length: 8 },
        { name: 'Right insert', notation: "U R U' R' U' F' U F", start: 12, length: 8 },
        { name: 'Left insert', notation: "U' L' U L U F U' F'", start: 22, length: 8 },
      ],
      pieces: ['green-red edge', 'green-orange edge', 'blue-red edge', 'blue-orange edge'],
    },
  ],
}
const recorded = solutionOf(recordedBody)

function recordedStage(id: string) {
  const stage = recordedBody.stages.find((s) => s.id === id)
  if (stage === undefined) throw new Error(`no Stage ${id}`)
  return stage
}

// The Session with Playback at a position in a Solution.
const at = (solution: Solution, position: number): Session => Session.start().loadSolution(solution).seek(position)

// What the Solution panel shows at a position: the Stage, and the Move
// reached with its note.
function shown(solution: Solution, position: number) {
  const teaching = at(solution, position).teaching
  const move = teaching?.move
  return [teaching?.stage.id, move && formatMove(move.move), move?.note]
}

describe('Session.teaching', () => {
  it('is in the first Stage before Playback starts, with no Move reached yet', () => {
    const teaching = at(handWritten, 0).teaching

    expect(teaching?.stage.id).toBe('white-cross')
    expect(teaching?.move).toBeUndefined()
    expect(teaching?.algorithm).toBeUndefined()
  })

  it.each([
    [1, 'white-cross', 'x2', 'turn the Cube over so the white center is on top'],
    [2, 'white-cross', "U'", undefined],
    // The end of a Stage is still that Stage: its last Move is the one reached.
    [3, 'white-cross', 'R2', 'put the white-red edge in place, white on top, next to the red center'],
    [4, 'white-corners', 'y', 'rotate so the white-green-red corner’s place is at front-right'],
    [5, 'white-corners', "R'", undefined],
    [13, 'white-corners', 'D', 'turn the bottom so the white-blue-red corner is below its place'],
    [14, 'middle-edges', 'x2', 'turn the Cube over so the white center is on the bottom'],
    [15, 'middle-edges', 'U', 'turn the top so the green-red edge is above the green center'],
    [31, 'middle-edges', "F'", undefined],
  ])('at position %i, has reached the last Move played, with its note', (position, stage, move, note) => {
    expect(shown(handWritten, position)).toEqual([stage, move, note])
  })

  it.each([
    [1, undefined],
    [4, undefined],
    [5, ['Corner trigger', 0]],
    [8, ['Corner trigger', 3]],
    // The same Algorithm again, straight after: it starts over.
    [9, ['Corner trigger', 0]],
    [12, ['Corner trigger', 3]],
    [13, undefined],
    [15, undefined],
    [16, ['Right insert', 0]],
    [23, ['Right insert', 7]],
    [24, ['Left insert', 0]],
    [31, ['Left insert', 7]],
  ])('at position %i, the Algorithm being performed and which of its Moves is %j', (position, expected) => {
    const algorithm = at(handWritten, position).teaching?.algorithm
    expect(algorithm && [algorithm.name, algorithm.moveIndex]).toEqual(expected)
  })

  it('reaches every Move of a recorded Solution as part of an Algorithm or with a note, never both', () => {
    let inAlgorithm = 0
    let noted = 0
    for (let position = 1; position <= recorded.moves.length; position++) {
      const { move, algorithm } = at(recorded, position).teaching ?? {}
      if (move === undefined) throw new Error(`no Move reached at ${position}`)
      if (algorithm !== undefined) {
        inAlgorithm++
        expect(formatMoves(algorithm.moves.slice(algorithm.moveIndex, algorithm.moveIndex + 1))).toBe(formatMove(move.move))
        expect(move.note).toBeUndefined()
      } else {
        noted++
        expect(move.note).toBeTypeOf('string')
      }
    }
    // Five Corner triggers of 4 Moves and three inserts of 8.
    expect(inAlgorithm).toBe(5 * 4 + 3 * 8)
    expect(noted).toBe(5 + 1 + 6)
  })

  it('never stops in a Stage with no Moves', () => {
    // Recorded from the Go solver for the Scramble "R U": the white corners
    // were already finished, so that Stage has no Moves.
    const solution = solutionOf({
      solved: false,
      stages: [
        {
          ...recordedStage('white-cross'),
          moves: "U' R'",
          notes: [
            { at: 0, text: 'put the white-green edge in place, white on top, next to the green center' },
            { at: 1, text: 'put the white-red edge in place, white on top, next to the red center' },
          ],
        },
        { ...recordedStage('white-corners'), moves: '', notes: [], algorithms: [] },
        {
          ...recordedStage('middle-edges'),
          moves: 'x2',
          notes: [{ at: 0, text: 'turn the Cube over so the white center is on the bottom' }],
          algorithms: [],
        },
      ],
    })

    expect(shown(solution, 2)).toEqual(['white-cross', "R'", 'put the white-red edge in place, white on top, next to the red center'])
    expect(shown(solution, 3)).toEqual(['middle-edges', 'x2', 'turn the Cube over so the white center is on the bottom'])
  })

  it('follows the position whichever way Playback got there', () => {
    let played = Session.start().loadSolution(handWritten).setAutoPause(false).play()
    for (let i = 0; i < 5; i++) played = played.playNext()
    expect(played.position).toBe(5)
    expect(played.teaching).toEqual(at(handWritten, 5).teaching)
    expect(played.stepBack().teaching).toEqual(at(handWritten, 4).teaching)
    expect(at(handWritten, 31).reverse().playNext().teaching).toEqual(at(handWritten, 30).teaching)
  })

  it('is undefined with no Solution loaded, or one with no Stages', () => {
    expect(Session.start().teaching).toBeUndefined()
    expect(Session.start().loadSolution(solutionOf({ solved: false, stages: [] })).teaching).toBeUndefined()
  })
})

describe('algorithmsOf', () => {
  it('gives each Algorithm a Stage uses once, in the order the Stage first uses it', () => {
    const cards = (solution: Solution) =>
      solution.stages.map((stage) => algorithmsOf(stage).map((a) => [a.name, formatMoves(a.moves)]))

    expect(cards(handWritten)).toEqual([
      [],
      [['Corner trigger', "R' D' R D"]],
      [
        ['Right insert', "U R U' R' U' F' U F"],
        ['Left insert', "U' L' U L U F U' F'"],
      ],
    ])
    expect(cards(recorded)).toEqual([
      [],
      [['Corner trigger', "R' D' R D"]],
      [
        ['Left insert', "U' L' U L U F U' F'"],
        ['Right insert', "U R U' R' U' F' U F"],
      ],
    ])
  })
})
