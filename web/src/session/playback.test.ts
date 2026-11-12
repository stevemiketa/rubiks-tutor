// A Solution loaded into a Session: Playback is a position in it, not a timer.
import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves } from '../cube/index.ts'
import { Session, SessionStore, parseSolveResponse, type Solution, type StorageLike } from './index.ts'

// A small hand-written Solution for the Cube "R U" makes: its one Stage undoes it.
const scramble = parseMoves('R U')
const solution = solutionOf("U' R'")

function solutionOf(notation: string): Solution {
  const result = parseSolveResponse({
    solved: false,
    stages: [{ id: 'white-cross', name: 'White cross', goal: 'g', moves: notation, notes: [], algorithms: [], pieces: [] }],
  })
  if (result.solved) throw new Error('read as solved')
  return result.solution
}

function steps(session: Session, n: number): Session {
  for (let i = 0; i < n; i++) session = session.stepForward()
  return session
}

describe('Session with a Solution', () => {
  it('loads a Solution at its start, paused, with the Cube unchanged', () => {
    const before = Session.start(scramble)
    const session = before.loadSolution(solution)

    expect(session.solution).toBe(solution)
    expect(session.position).toBe(0)
    expect(session.playing).toBe(false)
    expect(session.nextMove).toEqual(parseMoves("U'")[0])
    expect(session.cube.toString()).toBe(before.cube.toString())
    expect(session.history).toEqual([])
  })

  it('has no Solution until one is loaded', () => {
    const session = Session.start(scramble)
    expect(session.solution).toBeUndefined()
    expect(session.position).toBe(0)
    expect(session.playing).toBe(false)
    expect(session.nextMove).toBeUndefined()
  })

  it('shows the Scramble, then the Move history, then the Solution’s Moves up to the position', () => {
    const session = Session.start(scramble).move(parseMoves('y')[0]!).loadSolution(solutionOf("y' U' R'"))

    const once = session.stepForward()
    expect(once.position).toBe(1)
    expect(once.cube.toString()).toBe(Session.start(parseMoves("R U y y'")).cube.toString())

    const done = steps(session, 3)
    expect(done.position).toBe(3)
    expect(done.nextMove).toBeUndefined()
    expect(done.isSolved()).toBe(true)
  })

  it('plays until it reaches the end, then stops by itself', () => {
    let session = Session.start(scramble).loadSolution(solution).play()
    expect(session.playing).toBe(true)

    session = session.stepForward()
    expect(session.playing).toBe(true)
    session = session.stepForward()
    expect(session.playing).toBe(false)
    expect(session.isSolved()).toBe(true)

    // Play at the end has nothing to play.
    expect(session.play().playing).toBe(false)
    expect(session.stepForward()).toBe(session)
  })

  it('pauses on the current position', () => {
    const session = Session.start(scramble).loadSolution(solution).play().stepForward().pause()
    expect(session.playing).toBe(false)
    expect(session.position).toBe(1)
  })

  it('closes a Solution by moving the Moves played into the Move history, keeping the Cube', () => {
    const played = Session.start(scramble).loadSolution(solution).stepForward()
    const closed = played.closeSolution()

    expect(closed.solution).toBeUndefined()
    expect(formatMoves(closed.history)).toBe("U'")
    expect(closed.cube.toString()).toBe(played.cube.toString())
  })

  it('closes the Solution when the learner makes a Move, adding it after the Moves played', () => {
    const session = Session.start(scramble).loadSolution(solution).play().stepForward().move(parseMoves('F')[0]!)

    expect(session.solution).toBeUndefined()
    expect(session.playing).toBe(false)
    expect(formatMoves(session.history)).toBe("U' F")
    expect(session.cube.toString()).toBe(Session.start(parseMoves("R U U' F")).cube.toString())
  })

  it('closes the Solution before undoing, so undo takes back the last Move played', () => {
    const played = Session.start(scramble).move(parseMoves('M')[0]!).loadSolution(solutionOf("M' U' R'")).stepForward()
    expect(played.canUndo).toBe(true)

    const undone = played.undo()

    expect(undone.solution).toBeUndefined()
    expect(formatMoves(undone.history)).toBe('M')
    expect(undone.cube.toString()).toBe(Session.start(parseMoves('R U M')).cube.toString())
  })

  it('loading a new Solution closes the one before', () => {
    const session = Session.start(scramble).loadSolution(solution).stepForward().loadSolution(solutionOf("R'"))

    expect(formatMoves(session.history)).toBe("U'")
    expect(session.position).toBe(0)
    expect(session.stepForward().isSolved()).toBe(true)
  })

  it('saves the Cube as it is: the Moves played join the Move history, and the Solution itself isn’t saved', () => {
    const items = new Map<string, string>()
    const storage: StorageLike = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) }
    const played = Session.start(scramble).loadSolution(solution).stepForward()

    new SessionStore(storage).save(played)
    const restored = new SessionStore(storage).load()

    expect(restored?.solution).toBeUndefined()
    expect(formatMoves(restored?.history ?? [])).toBe("U'")
    expect(restored?.cube.toString()).toBe(played.cube.toString())
  })
})
