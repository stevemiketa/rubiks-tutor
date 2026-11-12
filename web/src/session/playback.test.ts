// A Solution loaded into a Session: Playback is a position in it, not a timer.
import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves } from '../cube/index.ts'
import { PLAYBACK_SPEEDS, Session, SessionStore, parseSolveResponse, type Solution, type StorageLike } from './index.ts'

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

// A two-Stage Solution, written by hand, for the Cube "F2 L R U" makes: the
// first Stage undoes "R U" and the second "F2 L".
const twoStageScramble = parseMoves('F2 L R U')
const twoStages = (() => {
  const result = parseSolveResponse({
    solved: false,
    stages: [
      { id: 'white-cross', name: 'White cross', goal: 'g', moves: "U' R'", notes: [], algorithms: [], pieces: [] },
      { id: 'white-corners', name: 'White corners', goal: 'g', moves: "L' F2", notes: [], algorithms: [], pieces: [] },
    ],
  })
  if (result.solved) throw new Error('read as solved')
  return result.solution
})()

const loaded = (): Session => Session.start(twoStageScramble).loadSolution(twoStages)

/** The Cube a Session shows, as the Scramble and Moves that make it from solved. */
const cubeOf = (notation: string): string => Session.start(parseMoves(notation)).cube.toString()

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

    session = session.playNext()
    expect(session.playing).toBe(true)
    session = session.playNext()
    expect(session.playing).toBe(false)
    expect(session.isSolved()).toBe(true)

    // Play at the end has nothing to play.
    expect(session.play().playing).toBe(false)
    expect(session.stepForward()).toBe(session)
    expect(session.playNext()).toBe(session)
  })

  it('pauses on the current position', () => {
    const session = Session.start(scramble).loadSolution(solution).play().playNext().pause()
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
    const session = Session.start(scramble).loadSolution(solution).play().playNext().move(parseMoves('F')[0]!)

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

describe('Session Playback controls', () => {
  it('steps back one Move at a time, taking back the last Move played, and stops at the start', () => {
    const played = steps(loaded(), 3)

    const back = played.stepBack()
    expect(back.position).toBe(2)
    expect(back.cube.toString()).toBe(cubeOf("F2 L R U U' R'"))
    expect(back.nextMove).toEqual(parseMoves("L'")[0])

    const start = back.stepBack().stepBack()
    expect(start.position).toBe(0)
    expect(start.cube.toString()).toBe(cubeOf('F2 L R U'))
    expect(start.stepBack()).toBe(start)
  })

  it('reverses: Playback goes backward toward the Cube from before Solve, and stops at the start', () => {
    const reversing = steps(loaded(), 2).reverse()
    expect(reversing.reversing).toBe(true)
    expect(reversing.playing).toBe(false)

    const once = reversing.playNext()
    expect(once.position).toBe(1)
    expect(once.reversing).toBe(true)

    const start = once.playNext()
    expect(start.position).toBe(0)
    expect(start.reversing).toBe(false)
    expect(start.cube.toString()).toBe(cubeOf('F2 L R U'))
    expect(start.playNext()).toBe(start)
    // At the start there is nothing to reverse.
    expect(start.reverse()).toBe(start)
  })

  it('pauses Playback to step, whichever way it was going', () => {
    const forward = loaded().play().stepForward()
    expect(forward.position).toBe(1)
    expect(forward.playing).toBe(false)

    const back = steps(loaded(), 2).reverse().stepBack()
    expect(back.position).toBe(1)
    expect(back.reversing).toBe(false)

    const across = loaded().play().stepForward().reverse().stepForward()
    expect(across.position).toBe(2)
    expect(across.reversing).toBe(false)
  })

  it('turns Playback around without pausing', () => {
    const turned = steps(loaded(), 1).play().reverse()
    expect(turned.reversing).toBe(true)
    expect(turned.playNext().position).toBe(0)

    expect(turned.play().playing).toBe(true)
  })

  it('pauses by itself at the end of each Stage; Play goes on into the next', () => {
    const session = loaded().play()
    expect(session.autoPause).toBe(true)

    const endOfFirst = session.playNext().playNext()
    expect(endOfFirst.position).toBe(2)
    expect(endOfFirst.playing).toBe(false)
    expect(endOfFirst.cube.toString()).toBe(cubeOf('F2 L'))

    const next = endOfFirst.play().playNext()
    expect(next.position).toBe(3)
    expect(next.playing).toBe(true)
  })

  it('plays on through the end of each Stage with auto-pause off', () => {
    const session = loaded().setAutoPause(false).play()
    expect(session.autoPause).toBe(false)

    const endOfFirst = session.playNext().playNext()
    expect(endOfFirst.position).toBe(2)
    expect(endOfFirst.playing).toBe(true)
    expect(endOfFirst.setAutoPause(true).autoPause).toBe(true)

    const end = endOfFirst.playNext().playNext()
    expect(end.isSolved()).toBe(true)
    expect(end.playing).toBe(false)
  })

  it('pauses at the start of a Stage going backward, so Reverse can rewind one Stage', () => {
    const rewound = steps(loaded(), 4).reverse().playNext().playNext()
    expect(rewound.position).toBe(2)
    expect(rewound.reversing).toBe(false)
  })

  it('scrubs to any position: the Cube shows the Moves up to it, and Playback pauses', () => {
    const later = loaded().play().seek(3)
    expect(later.position).toBe(3)
    expect(later.playing).toBe(false)
    expect(later.cube.toString()).toBe(cubeOf("F2 L R U U' R' L'"))

    const earlier = later.reverse().seek(1)
    expect(earlier.position).toBe(1)
    expect(earlier.reversing).toBe(false)
    expect(earlier.cube.toString()).toBe(cubeOf("F2 L R U U'"))

    expect(earlier.seek(4).isSolved()).toBe(true)
    expect(earlier.seek(0).cube.toString()).toBe(cubeOf('F2 L R U'))
  })

  it.each([-1, 5, 1.5, Number.NaN])('rejects position %s, which isn’t in the Solution', (position) => {
    expect(() => loaded().seek(position)).toThrow(RangeError)
  })

  it('jumps to a Stage’s first Move, paused', () => {
    const second = loaded().play().jumpToStage(1)
    expect(second.position).toBe(2)
    expect(second.playing).toBe(false)
    expect(second.cube.toString()).toBe(cubeOf('F2 L'))

    const first = steps(loaded(), 3).jumpToStage(0)
    expect(first.position).toBe(0)
    expect(first.cube.toString()).toBe(cubeOf('F2 L R U'))

    expect(() => loaded().jumpToStage(2)).toThrow(RangeError)
  })

  it('has nothing to scrub or jump to with no Solution loaded', () => {
    const session = Session.start(twoStageScramble)
    expect(session.seek(0)).toBe(session)
    expect(session.jumpToStage(0)).toBe(session)
  })

  it('plays at 0.5×, 1×, 2× or 4×, and at 1× until the learner picks another', () => {
    expect(PLAYBACK_SPEEDS).toEqual([0.5, 1, 2, 4])
    expect(loaded().speed).toBe(1)
    expect(Session.start().speed).toBe(1)

    const fast = loaded().play().setSpeed(4)
    expect(fast.speed).toBe(4)
    expect(fast.playing).toBe(true)
  })

  it('keeps the speed and auto-pause setting when Solve loads another Solution', () => {
    const session = loaded().setSpeed(0.5).setAutoPause(false).stepForward().loadSolution(twoStages)
    expect(session.position).toBe(0)
    expect(session.speed).toBe(0.5)
    expect(session.autoPause).toBe(false)
  })
})
