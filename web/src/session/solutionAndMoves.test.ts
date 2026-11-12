// What happens when the learner acts while a Solution is loaded: manual
// Turns make it stale, Cube rotations go into it, undo and redo step through
// it, closing it keeps the Cube, and it is saved and shared with the Session.
import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves, stickerAt, type Move } from '../cube/index.ts'
import {
  Session,
  SessionStore,
  Tutor,
  parseSolveResponse,
  type MoveQueue,
  type Solution,
  type StorageLike,
  type TutorOptions,
} from './index.ts'

const move = (notation: string): Move => parseMoves(notation)[0]!

/** The Cube a Scramble and Moves make from solved. */
const cubeOf = (notation: string): string => Session.start(parseMoves(notation)).cube.toString()

function solutionOf(response: unknown): Solution {
  const result = parseSolveResponse(response)
  if (result.solved) throw new Error('read as solved')
  return result.solution
}

function steps(session: Session, n: number): Session {
  for (let i = 0; i < n; i++) session = session.stepForward()
  return session
}

// Recorded from the Go solver (POST /api/solve) for Scramble "R D R F R2 U'"
// and no Moves. Its three Stages solve this Cube completely.
const recordedScramble = "R D R F R2 U'"
const recorded = solutionOf({
  solved: false,
  stages: [
    {
      id: 'white-cross',
      name: 'White cross',
      goal: 'Make a white cross on top, with each edge matching the center beside it.',
      moves: "U R2 F' R2",
      notes: [
        { at: 0, text: 'put the white-red edge in place, white on top, next to the red center' },
        { at: 1, text: 'move the white-green edge toward its place; this moves the white-red edge out of the way for now' },
        { at: 2, text: 'move the white-green edge toward its place next to the green center' },
        { at: 3, text: 'bring back the white-red edge, which completes it with the white-green edge in place' },
      ],
      algorithms: [],
      pieces: ['white-green edge', 'white-red edge', 'white-blue edge', 'white-orange edge'],
    },
    {
      id: 'white-corners',
      name: 'White corners',
      goal: 'Fill in the white corners to finish the first layer.',
      moves: "y D' R' D' R D",
      notes: [
        { at: 0, text: "rotate so the white-blue-red corner's place is at front-right" },
        { at: 1, text: 'turn the bottom so the white-blue-red corner is below its place' },
      ],
      algorithms: [{ name: 'Corner trigger', notation: "R' D' R D", start: 2, length: 4 }],
      pieces: ['white-green-red corner', 'white-green-orange corner', 'white-blue-red corner', 'white-blue-orange corner'],
    },
    {
      id: 'middle-edges',
      name: 'Middle layer',
      goal: 'Flip white to the bottom, then place the four middle-layer edges.',
      moves: "x2 y2 U' L' U L U F U' F'",
      notes: [
        { at: 0, text: 'turn the Cube over so the white center is on the bottom' },
        { at: 1, text: 'rotate so the red center is in front, for the blue-red edge' },
      ],
      algorithms: [{ name: 'Left insert', notation: "U' L' U L U F U' F'", start: 2, length: 8 }],
      pieces: ['green-red edge', 'green-orange edge', 'blue-red edge', 'blue-orange edge'],
    },
  ],
})

/** A Session on the recorded Scramble, with the learner's own Moves made, then the recorded Solution loaded. */
const loaded = (history = ''): Session =>
  parseMoves(history)
    .reduce((s, m) => s.move(m), Session.start(parseMoves(recordedScramble)))
    .loadSolution(recorded)

describe('a manual Turn while a Solution is loaded', () => {
  it('moves the Moves played into the Move history, adds the Turn after them, and makes the Solution stale', () => {
    const played = steps(loaded('M'), 3)

    const turned = played.move(move('F'))

    expect(formatMoves(turned.history)).toBe("M U R2 F' F")
    expect(turned.cube.toString()).toBe(cubeOf(`${recordedScramble} M U R2 F' F`))
    expect(turned.stale).toBe(true)
    expect(turned.solution).toBe(recorded)
    expect(played.stale).toBe(false)
  })

  it('makes the Solution stale even before any of it is played', () => {
    const turned = loaded('M').move(move('E'))

    expect(formatMoves(turned.history)).toBe('M E')
    expect(turned.stale).toBe(true)
  })

  it('counts middle-Layer Turns as Turns', () => {
    expect(steps(loaded(), 1).move(move("S'")).stale).toBe(true)
  })

  it('stops Playback: a stale Solution has nothing to play, step or scrub', () => {
    const stale = steps(loaded(), 2).play().move(move('F'))

    expect([stale.playing, stale.position, stale.nextMove, stale.previousMove]).toEqual([false, 0, undefined, undefined])
    for (const s of [stale.play(), stale.reverse(), stale.stepForward(), stale.stepBack(), stale.playNext()]) {
      expect(s.cube.toString()).toBe(stale.cube.toString())
      expect(s.playing || s.reversing).toBe(false)
    }
    expect(stale.seek(3)).toBe(stale)
    expect(stale.jumpToStage(1)).toBe(stale)
  })

  it('leaves later Moves, undo and redo to act on the Move history while the Solution is stale', () => {
    const stale = steps(loaded(), 2).move(move('F'))

    const rotated = stale.move(move('y'))
    expect(formatMoves(rotated.history)).toBe('U R2 F y')
    expect(rotated.solution).toBe(recorded)

    const undone = rotated.undo().undo()
    expect(formatMoves(undone.history)).toBe('U R2')
    expect(undone.cube.toString()).toBe(cubeOf(`${recordedScramble} U R2`))
    expect(undone.stale).toBe(true)
    expect(formatMoves(undone.redo().history)).toBe('U R2 F')
  })

  it('is replaced by the next Solution Solve loads, which is not stale', () => {
    const again = steps(loaded(), 2).move(move('F')).loadSolution(recorded)

    expect(again.stale).toBe(false)
    expect(formatMoves(again.history)).toBe('U R2 F')
    expect(again.position).toBe(0)
  })

  it('is dropped by closing it, which leaves the Cube and the Move history as they are', () => {
    const stale = steps(loaded(), 2).move(move('F'))

    const closed = stale.closeSolution()

    expect(closed.solution).toBeUndefined()
    expect(closed.stale).toBe(false)
    expect(formatMoves(closed.history)).toBe('U R2 F')
    expect(closed.cube.toString()).toBe(stale.cube.toString())
  })
})

/** Each Stage's Moves, in notation. */
const stageMoves = (session: Session): string[] =>
  session.solution?.stages.map((stage) => formatMoves(stage.moves.map((m) => m.move))) ?? []

/** Each Algorithm use as "name: notation @ start", Stage by Stage. */
const algorithms = (session: Session): string[][] =>
  session.solution?.stages.map((stage) => stage.algorithms.map((a) => `${a.name}: ${formatMoves(a.moves)} @ ${a.start}`)) ??
  []

describe('undo and redo while a Solution is loaded', () => {
  it('step back and step forward through the Solution, pausing Playback', () => {
    const played = steps(loaded('M'), 3).play()

    const undone = played.undo()
    expect(undone.position).toBe(2)
    expect(undone.playing).toBe(false)
    expect(undone.cube.toString()).toBe(cubeOf(`${recordedScramble} M U R2`))
    expect(formatMoves(undone.history)).toBe('M')

    const redone = undone.redo().redo()
    expect(redone.position).toBe(4)
    expect(redone.cube.toString()).toBe(cubeOf(`${recordedScramble} M U R2 F' R2`))
    expect(formatMoves(redone.history)).toBe('M')
  })

  it('can undo once a Move is played and redo while one is left, whatever the Move history holds', () => {
    const start = Session.start(parseMoves(recordedScramble)).move(move('M')).move(move('E')).undo().loadSolution(recorded)
    expect([start.canUndo, start.canRedo]).toEqual([false, true])
    expect(start.undo()).toBe(start)

    const end = steps(start, recorded.moves.length)
    expect([end.canUndo, end.canRedo]).toEqual([true, false])
    expect(end.redo()).toBe(end)
  })

  it('leave the learner’s own redo stack for after the Solution is closed', () => {
    const start = Session.start(parseMoves(recordedScramble)).move(move('M')).move(move('E')).undo().loadSolution(recorded)

    const closed = start.redo().undo().closeSolution()

    expect(formatMoves(closed.undone)).toBe('E')
    expect(formatMoves(closed.redo().history)).toBe('M E')
  })
})

describe('a Cube rotation while a Solution is loaded', () => {
  it('goes into the Solution where Playback is, and every later Move is relabeled for the new orientation', () => {
    const atEndOfCross = steps(loaded(), 4)

    const rotated = atEndOfCross.move(move('y'))

    // y brings the right Layer to the front and the left to the back, and x
    // now turns as z did.
    expect(stageMoves(rotated)).toEqual(["U R2 F' R2 y", "y D' F' D' F D", "z2 y2 U' B' U B U L U' L'"])
    expect(algorithms(rotated)).toEqual([[], ["Corner trigger: F' D' F D @ 2"], ["Left insert: U' B' U B U L U' L' @ 2"]])
    expect(rotated.position).toBe(5)
    expect(rotated.history).toEqual([])
    expect(rotated.stale).toBe(false)
    expect(rotated.cube.toString()).toBe(cubeOf(`${recordedScramble} U R2 F' R2 y`))
    expect(rotated.solution?.moves).toHaveLength(21)
  })

  it('goes into the Algorithm Playback is in, so every Algorithm still matches its Stage’s Moves', () => {
    // Three Moves into Stage 2, inside the Corner trigger.
    const rotated = steps(loaded(), 7).move(move("y'"))

    expect(stageMoves(rotated)).toEqual(["U R2 F' R2", "y D' R' y' D' B D", "z2 y2 U' F' U F U R U' R'"])
    expect(algorithms(rotated)).toEqual([[], ["Corner trigger: R' y' D' B D @ 2"], ["Left insert: U' F' U F U R U' R' @ 2"]])
    for (const stage of rotated.solution?.stages ?? []) {
      for (const use of stage.algorithms) {
        const there = stage.moves.slice(use.start, use.start + use.moves.length).map((m) => m.move)
        expect(formatMoves(there)).toBe(formatMoves(use.moves))
      }
    }
  })

  it('goes into the first Stage before any Move is played', () => {
    const rotated = loaded().move(move('x'))

    // x takes the top Layer to the back and the front to the top.
    expect(stageMoves(rotated)[0]).toBe("x B R2 U' R2")
    expect(rotated.position).toBe(1)
  })

  it('leaves a Solution that still solves the Cube, whichever rotation is made and wherever', () => {
    const rotations = ['x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2', "x y'", "z2 y"]
    for (let position = 0; position <= recorded.moves.length; position++) {
      for (const notation of rotations) {
        const rotated = parseMoves(notation).reduce((s, r) => s.move(r), steps(loaded(), position))
        const end = steps(rotated, rotated.solution!.moves.length)
        expect(end.nextMove, `${notation} after ${position} Moves`).toBeUndefined()
        expect(end.isSolved(), `${notation} after ${position} Moves`).toBe(true)
        expect(end.history).toEqual([])
      }
    }
  })

  it('is undone by stepping back past it, and made again by stepping forward', () => {
    const before = steps(loaded(), 7)
    const rotated = before.move(move('z'))

    const back = rotated.stepBack()
    expect(back.position).toBe(7)
    expect(back.cube.toString()).toBe(before.cube.toString())
    expect(back.nextMove).toEqual(move('z'))

    expect(back.stepForward().cube.toString()).toBe(rotated.cube.toString())
  })

  it('keeps Playback playing forward, which goes on with the relabeled Moves', () => {
    const rotated = steps(loaded(), 4).play().move(move('y'))

    expect(rotated.playing).toBe(true)
    expect(rotated.nextMove).toEqual(move('y'))
    expect(rotated.playNext().nextMove).toEqual(move("D'"))
  })

  it('pauses Playback going backward, which would take the rotation straight back', () => {
    const rotated = steps(loaded(), 6).reverse().move(move('y'))

    expect(rotated.reversing).toBe(false)
    expect(rotated.position).toBe(7)
  })

  it('joins the Move history when the Solution has no Stages to put it in', () => {
    const empty = solutionOf({ solved: false, stages: [] })
    const rotated = Session.start(parseMoves(recordedScramble)).loadSolution(empty).move(move('y'))

    expect(formatMoves(rotated.history)).toBe('y')
    expect(rotated.solution).toBe(empty)
    expect(rotated.stale).toBe(false)
  })
})

describe('closing a Solution', () => {
  it('moves the Moves played into the Move history and leaves the Cube as it is; undo then undoes the learner’s own Moves', () => {
    const played = steps(loaded('M'), 2).move(move('y'))

    const closed = played.closeSolution()

    expect(closed.solution).toBeUndefined()
    expect(formatMoves(closed.history)).toBe('M U R2 y')
    expect(closed.cube.toString()).toBe(played.cube.toString())
    const undone = closed.undo().undo().undo().undo()
    expect(undone.history).toEqual([])
    expect(undone.cube.toString()).toBe(cubeOf(recordedScramble))
    expect(undone.undo()).toBe(undone)
  })
})

/** Browser storage, in memory. */
function memoryStorage(): StorageLike & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) }
}

/** Saves a Session in browser storage and restores it, as a reload does. */
function reload(session: Session): Session | undefined {
  const storage = memoryStorage()
  new SessionStore(storage).save(session)
  return new SessionStore(storage).load()
}

describe('saving a loaded Solution in browser storage', () => {
  it('restores it at the same position, speed and auto-pause setting, paused, showing the same Cube', () => {
    // M then M' leave the Cube the recorded Solution solves, with Moves in the Move history.
    const session = steps(loaded("M M'"), 7).move(move("y'")).setSpeed(2).setAutoPause(false).undo().redo().play()

    const restored = reload(session)

    expect(restored?.solution).toEqual(session.solution)
    expect(restored?.position).toBe(8)
    expect(restored?.speed).toBe(2)
    expect(restored?.autoPause).toBe(false)
    expect(restored?.playing).toBe(false)
    expect(restored?.stale).toBe(false)
    expect(formatMoves(restored?.history ?? [])).toBe("M M'")
    expect(restored?.cube.toString()).toBe(session.cube.toString())
    expect(restored && steps(restored, 13).isSolved()).toBe(true)
  })

  it('restores a stale Solution as stale', () => {
    const session = steps(loaded(), 3).move(move('F'))

    const restored = reload(session)

    expect(restored?.stale).toBe(true)
    expect(restored?.solution).toEqual(recorded)
    expect(formatMoves(restored?.history ?? [])).toBe("U R2 F' F")
    expect(restored?.cube.toString()).toBe(session.cube.toString())
  })

  it('saves the Solution as POST /api/solve gives it, with where Playback is', () => {
    const storage = memoryStorage()
    const stage = {
      id: 'white-cross',
      name: 'White cross',
      goal: 'g',
      moves: "U' R'",
      notes: [{ at: 1, text: 'n' }],
      algorithms: [{ name: 'A', notation: "R'", start: 1, length: 1 }],
      pieces: ['white-red edge'],
    }
    const solution = solutionOf({ solved: false, stages: [stage] })
    new SessionStore(storage).save(Session.start(parseMoves('R U')).loadSolution(solution).stepForward().setSpeed(4))

    expect(JSON.parse([...storage.items.values()][0] ?? '')).toEqual({
      version: 3,
      scramble: 'R U',
      history: '',
      undone: '',
      solution: { stages: [stage], position: 1, speed: 4, autoPause: true, stale: false },
    })
  })

  const saved = (solution: unknown): string =>
    JSON.stringify({ version: 3, scramble: 'R U', history: '', undone: '', solution })
  const stage = { id: 'white-cross', name: 'W', goal: 'g', moves: "U' R'", notes: [], algorithms: [], pieces: [] }
  const good = { stages: [stage], position: 1, speed: 1, autoPause: true, stale: false }

  it('reads the data the unreadable cases below are made from', () => {
    const storage = memoryStorage()
    storage.setItem('cubular.session', saved(good))
    expect(new SessionStore(storage).load()?.position).toBe(1)
  })

  it.each([
    ['no Solution field', undefined],
    ['a Solution that isn’t an object', 'U R'],
    ['Stages that aren’t a list', { ...good, stages: {} }],
    ['a Stage with a bad Move', { ...good, stages: [{ ...stage, moves: 'U Rw' }] }],
    [
      'an Algorithm that isn’t where it says',
      { ...good, stages: [{ ...stage, algorithms: [{ name: 'A', notation: 'R', start: 1, length: 1 }] }] },
    ],
    ['a position past the end', { ...good, position: 3 }],
    ['a position that isn’t a whole number', { ...good, position: 0.5 }],
    ['a speed that isn’t one of the speeds', { ...good, speed: 3 }],
    ['an auto-pause setting that isn’t true or false', { ...good, autoPause: 'yes' }],
    ['no stale flag', { ...good, stale: undefined }],
    ['a stale Solution with Moves still played', { ...good, stale: true }],
  ])('restores nothing from an unreadable Solution: %s', (_, solution) => {
    const storage = memoryStorage()
    storage.setItem('cubular.session', saved(solution))
    expect(new SessionStore(storage).load()).toBeUndefined()
  })
})

describe('sharing while a Solution is loaded', () => {
  it('makes a Snapshot whose Move history includes the Solution Moves played so far, rotations too', () => {
    const session = steps(steps(loaded('M'), 2).move(move('y')), 2)

    expect(session.toSnapshot()).toEqual({ scramble: recordedScramble, moves: "M U R2 y L' F2" })
  })

  it('never includes the Solution: the Snapshot opens with the same Cube and none loaded', () => {
    const session = steps(loaded(), 5)

    const opened = Session.fromSnapshot(session.toSnapshot())

    expect(opened.solution).toBeUndefined()
    expect(opened.cube.toString()).toBe(session.cube.toString())
    expect(formatMoves(opened.history)).toBe("U R2 F' R2 y")
  })

  it('shares a stale Solution’s Moves played once, from the Move history', () => {
    const stale = steps(loaded(), 2).move(move('F'))

    expect(stale.toSnapshot()).toEqual({ scramble: recordedScramble, moves: 'U R2 F' })
  })
})

// Plays the queue the way the scene does: finishes the current Move, which
// may queue the next, until nothing is left.
function playAll(queue: MoveQueue): void {
  for (let item = queue.current; item !== undefined; item = queue.current) queue.finish(item)
}

const queued = (queue: MoveQueue): string => formatMoves(queue.pending.map((q) => q.move))

/** A Tutor with the recorded Solution loaded after the learner's own Moves, as Solve loads it. */
async function solvedTutor(history = "M M'", options: TutorOptions = {}): Promise<Tutor> {
  const start = parseMoves(history).reduce((s, m) => s.move(m), Session.start(parseMoves(recordedScramble)))
  const tutor = new Tutor(start, { solve: () => Promise.resolve({ solved: false, solution: recorded }), ...options })
  await tutor.solve()
  return tutor
}

describe('Tutor while a Solution is loaded', () => {
  it('steps back and forward with Ctrl+Z and Shift+Ctrl+Z, animating at the Playback speed', async () => {
    const tutor = await solvedTutor()
    tutor.setSpeed(2)
    tutor.stepForward()
    tutor.stepForward()
    playAll(tutor.queue)

    expect(tutor.press({ key: 'z', ctrlKey: true })).toBe(true)
    expect(tutor.getState().session.position).toBe(1)
    expect(tutor.queue.current).toEqual({ move: move('R2'), durationMs: 187.5 })

    tutor.press({ key: 'Z', metaKey: true, shiftKey: true })
    tutor.press({ key: 'Z', ctrlKey: true, shiftKey: true })
    expect(tutor.getState().session.position).toBe(3)
    expect(queued(tutor.queue)).toBe("R2 R2 F'")
    playAll(tutor.queue)
    expect(tutor.queue.shown.toString()).toBe(tutor.getState().session.cube.toString())
    expect(formatMoves(tutor.getState().session.history)).toBe("M M'")
  })

  it('steps back and forward from the Undo and Redo buttons, and pauses Playback', async () => {
    const tutor = await solvedTutor()
    tutor.play()

    tutor.undo()
    expect(tutor.getState().session.playing).toBe(false)
    expect(tutor.getState().session.position).toBe(0)

    tutor.redo()
    expect(tutor.getState().session.position).toBe(1)
    expect(queued(tutor.queue)).toBe("U U' U")
  })

  it('undoes nothing at the Solution’s start, even with Moves in the Move history', async () => {
    const tutor = await solvedTutor()

    tutor.undo()

    expect(tutor.queue.isIdle).toBe(true)
    expect(formatMoves(tutor.getState().session.history)).toBe("M M'")
  })

  it('closes the Solution, keeping the Cube; undo then takes back the learner’s own Moves', async () => {
    const tutor = await solvedTutor()
    tutor.stepForward()
    playAll(tutor.queue)

    tutor.closeSolution()
    expect(tutor.getState().session.solution).toBeUndefined()
    expect(formatMoves(tutor.getState().session.history)).toBe("M M' U")
    expect(tutor.queue.isIdle).toBe(true)

    tutor.undo()
    tutor.undo()
    expect(queued(tutor.queue)).toBe("U' M")
    expect(formatMoves(tutor.getState().session.history)).toBe('M')
  })

  it('leaves Space to the browser once the Solution is stale, and undo to the Move history', async () => {
    const tutor = await solvedTutor()
    tutor.stepForward()
    tutor.select(stickerAt('F', 1, 1))
    tutor.turn('up')
    playAll(tutor.queue)

    expect(tutor.press({ key: ' ' })).toBe(false)
    tutor.undo()
    expect(queued(tutor.queue)).toBe('M')
    expect(formatMoves(tutor.getState().session.history)).toBe("M M' U")
  })

  it('Solve again replaces a stale Solution with a fresh one', async () => {
    const tutor = await solvedTutor()
    tutor.select(stickerAt('F', 1, 1))
    tutor.turn('up')
    tutor.turn('down')
    expect(tutor.getState().session.stale).toBe(true)

    await tutor.solve()

    expect(tutor.getState().session.stale).toBe(false)
    expect(tutor.getState().session.position).toBe(0)
  })

  it('drops a stale Solution when Solve again finds the Cube already solved', async () => {
    // A solver that says solved stands in: no Turn by hand solves this Cube.
    const tutor = new Tutor(loaded(), { solve: () => Promise.resolve({ solved: true }) })
    tutor.select(stickerAt('F', 1, 1))
    tutor.turn('up')

    await tutor.solve()

    expect(tutor.getState().solveStatus).toBe('already-solved')
    expect(tutor.getState().session.solution).toBeUndefined()
  })

  it('starts a new Scramble at once with a Solution loaded but nothing played, and asks once a Move is played', async () => {
    const tutor = await solvedTutor('')
    tutor.newScramble()
    expect(tutor.getState().confirming).toBeUndefined()
    expect(tutor.getState().session.solution).toBeUndefined()

    const played = await solvedTutor('')
    played.stepForward()
    played.newScramble()
    expect(played.getState().confirming).toBe('new-scramble')
  })

  it('restores the Solution where Playback was when the page reloads', async () => {
    const storage = memoryStorage()
    const store = new SessionStore(storage)
    const tutor = await solvedTutor("M M'", { store })
    tutor.setSpeed(4)
    for (let i = 0; i < 5; i++) tutor.stepForward()
    tutor.rotate('left')
    tutor.play()

    const reloaded = Tutor.open({ store })

    const { session, scrambling } = reloaded.getState()
    expect(scrambling).toBe(false)
    expect(session.position).toBe(6)
    expect(session.speed).toBe(4)
    expect(session.playing).toBe(false)
    expect(reloaded.queue.shown.toString()).toBe(tutor.getState().session.cube.toString())
  })
})
