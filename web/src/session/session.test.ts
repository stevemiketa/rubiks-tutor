import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves } from '../cube/index.ts'
import { Session } from './index.ts'

function play(session: Session, notation: string): Session {
  return parseMoves(notation).reduce((s, move) => s.move(move), session)
}

describe('Session', () => {
  it('starts with a solved Cube and an empty Move history', () => {
    const session = Session.start()
    expect(session.history).toEqual([])
    expect(session.isSolved()).toBe(true)
    expect(session.cube.toString()).toBe('WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB')
  })

  it('adds every Move to the Move history in order', () => {
    const session = play(Session.start(), "R U' M2 x")
    expect(formatMoves(session.history)).toBe("R U' M2 x")
  })

  it('shows the Cube the Move history produces', () => {
    const session = play(Session.start(), 'R')
    // R takes the front's right column to the top, from a solved Cube.
    expect(session.cube.toString()).toBe('WWGWWGWWG RRRRRRRRR GGYGGYGGY YYBYYBYYB OOOOOOOOO WBBWBBWBB')
    expect(session.isSolved()).toBe(false)
  })

  it('is solved again once the Moves undo each other', () => {
    expect(play(Session.start(), "M' E E' M").isSolved()).toBe(true)
  })

  it('counts a Cube rotation of a solved Cube as solved', () => {
    expect(play(Session.start(), 'y x2').isSolved()).toBe(true)
  })

  it('leaves the Session it was made from unchanged', () => {
    const start = Session.start()
    play(start, 'R U')
    expect(start.history).toEqual([])
    expect(start.isSolved()).toBe(true)
  })

  it('starts from a Scramble, applied before the Move history', () => {
    const session = Session.start(parseMoves('R'))
    expect(formatMoves(session.scramble)).toBe('R')
    expect(session.history).toEqual([])
    expect(play(session, "R'").isSolved()).toBe(true)
  })
})

// The non-corner Stickers of a cube state: on each face, the four corners are
// indices 0, 2, 6, 8, so the rest are the edges and the center. A Pocket
// Cube's Moves leave these Phantom Stickers solved.
const phantomsOf = (state: string): string =>
  state
    .split(' ')
    .map((face) => [...face].filter((_, i) => ![0, 2, 6, 8].includes(i)).join(''))
    .join(' ')

describe('Session puzzle', () => {
  it('is a 3x3 by default', () => {
    expect(Session.start().puzzle).toBe('cube')
    expect(Session.start(parseMoves('R U')).puzzle).toBe('cube')
  })

  it('tracks the Pocket Cube when started as one', () => {
    expect(Session.start(parseMoves('R U'), 'pocket').puzzle).toBe('pocket')
  })

  it('evolves a Pocket Cube with corner-only Moves, leaving the Phantom Stickers solved', () => {
    const solved = Session.start().cube.toString()
    const session = play(Session.start(parseMoves('R U'), 'pocket'), "F' R2")
    expect(phantomsOf(session.cube.toString())).toBe(phantomsOf(solved))
    // The corners still move: the Cube is not solved.
    expect(session.isSolved()).toBe(false)
  })

  it('applies a Pocket Cube Scramble and its undo as corner-only Moves', () => {
    const session = Session.start(parseMoves("R U F' L D"), 'pocket')
    expect(play(session, "D' L' F U' R'").isSolved()).toBe(true)
  })

  it('leaves a 3x3 evolving with full Moves: the same Turns reach different states', () => {
    const cube = play(Session.start(parseMoves('R U'), 'cube'), "F'").cube.toString()
    const pocket = play(Session.start(parseMoves('R U'), 'pocket'), "F'").cube.toString()
    expect(pocket).not.toBe(cube)
  })

  it('carries the puzzle through undo and redo', () => {
    const session = play(Session.start(parseMoves('R'), 'pocket'), 'U').undo()
    expect(session.puzzle).toBe('pocket')
    expect(session.redo().puzzle).toBe('pocket')
    // Undo of a Pocket Move is itself corner-only: the Phantoms stay solved.
    expect(phantomsOf(session.cube.toString())).toBe(phantomsOf(Session.start().cube.toString()))
  })
})

const SOLVED = 'WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB'
// y turns the whole Cube as U does: the front goes to the left, so the
// right face's red comes to the front and the back's blue to the right.
const AFTER_Y = 'WWWWWWWWW BBBBBBBBB RRRRRRRRR YYYYYYYYY GGGGGGGGG OOOOOOOOO'

describe('Session undo and redo', () => {
  it('undoes the last Move, taking it off the Move history', () => {
    const session = play(Session.start(), "R U'").undo()
    expect(formatMoves(session.history)).toBe('R')
    // R takes the front's right column to the top, from a solved Cube.
    expect(session.cube.toString()).toBe('WWGWWGWWG RRRRRRRRR GGYGGYGGY YYBYYBYYB OOOOOOOOO WBBWBBWBB')
  })

  it('undoes every Move back to the Scramble, and no further', () => {
    const scrambled = Session.start(parseMoves('R'))
    const session = play(scrambled, "U x'").undo().undo().undo()
    expect(session.history).toEqual([])
    expect(session.cube.toString()).toBe('WWGWWGWWG RRRRRRRRR GGYGGYGGY YYBYYBYYB OOOOOOOOO WBBWBBWBB')
    expect(session.canUndo).toBe(false)
  })

  it('redoes undone Moves in the order they were made', () => {
    const session = play(Session.start(), "R U' y").undo().undo().undo().redo().redo()
    expect(formatMoves(session.history)).toBe("R U'")
    expect(formatMoves(session.redo().history)).toBe("R U' y")
  })

  it('undoes and redoes Cube rotations like any other Move', () => {
    const rotated = play(Session.start(), 'y')
    expect(rotated.cube.toString()).toBe(AFTER_Y)
    expect(rotated.undo().cube.toString()).toBe(SOLVED)
    expect(rotated.undo().redo().cube.toString()).toBe(AFTER_Y)
  })

  it('clears the redo stack when a new Move is made', () => {
    const session = play(play(Session.start(), 'R U').undo(), 'F')
    expect(session.canRedo).toBe(false)
    expect(formatMoves(session.redo().history)).toBe('R F')
  })

  it('says whether there is anything to undo or redo', () => {
    const start = Session.start(parseMoves('R'))
    expect([start.canUndo, start.canRedo]).toEqual([false, false])
    const moved = play(start, 'U')
    expect([moved.canUndo, moved.canRedo]).toEqual([true, false])
    expect([moved.undo().canUndo, moved.undo().canRedo]).toEqual([false, true])
  })

  it('does nothing when there is nothing to undo or redo', () => {
    const start = Session.start()
    expect(start.undo()).toBe(start)
    expect(start.redo()).toBe(start)
  })

  it('keeps the undone Moves as plain data, the most recently undone last', () => {
    const session = play(Session.start(), "R U' M2").undo().undo()
    expect(formatMoves(session.undone)).toBe("M2 U'")
  })

  it('leaves the Session it was made from unchanged', () => {
    const moved = play(Session.start(), 'R')
    moved.undo()
    expect(formatMoves(moved.history)).toBe('R')
    expect(moved.undone).toEqual([])
  })
})
