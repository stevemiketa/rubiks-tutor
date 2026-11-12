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
