// Solve and Playback in the Tutor: asking the solver, loading its Solution,
// and playing it one Move at a time as the scene finishes each.
import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves, stickerAt, type Move } from '../cube/index.ts'
import { Session, Tutor, parseSolveResponse, type MoveQueue, type SolveResult, type TutorOptions } from './index.ts'

// Recorded from the Go solver (POST /api/solve) for this Scramble and Move history.
const scramble = "D2 F' R U2 B L' D R2 F U' L2 B' D' R F2 U L D2 B2 R' U2 F L' B D'"
const history = 'M x'
const recorded = {
  solved: false,
  stages: [
    {
      id: 'white-cross',
      name: 'White cross',
      goal: 'Make a white cross on top, with each edge matching the center beside it.',
      moves: "U B2 R' D' B2 U B U' L",
      notes: [
        { at: 0, text: 'put the white-green edge in place, white on top, next to the green center' },
        { at: 1, text: 'move the white-red edge toward its place next to the red center' },
        { at: 2, text: 'put the white-red edge in place, white on top, next to the red center' },
        { at: 3, text: 'move the white-blue edge toward its place next to the blue center' },
        { at: 4, text: 'put the white-blue edge in place, white on top, next to the blue center' },
        { at: 5, text: 'move the white-orange edge toward its place; this moves the cross out of the way for now' },
        { at: 6, text: 'move the white-orange edge toward its place next to the orange center' },
        { at: 7, text: 'bring back the cross' },
        { at: 8, text: 'put the white-orange edge in place, white on top, next to the orange center' },
      ],
      algorithms: [],
      pieces: ['white-green edge', 'white-red edge', 'white-blue edge', 'white-orange edge'],
    },
  ],
}

function play(session: Session, notation: string): Session {
  return parseMoves(notation).reduce((s, move) => s.move(move), session)
}

const scrambled = (): Session => play(Session.start(parseMoves(scramble)), history)

// A solver the test answers by hand: each call waits until the test resolves
// or rejects it.
function handSolver() {
  const calls: { scramble: string; moves: string; resolve: (r: SolveResult) => void; reject: (e: Error) => void }[] =
    []
  const solve = (s: readonly Move[], m: readonly Move[]) =>
    new Promise<SolveResult>((resolve, reject) => {
      calls.push({ scramble: formatMoves(s), moves: formatMoves(m), resolve, reject })
    })
  return { calls, solve }
}

// A solver that always answers with the recorded Solution.
const recordedSolver = () => Promise.resolve(parseSolveResponse(recorded))

// The recorded Stage split in two by hand, for a Solution with a boundary
// between Stages: the same Moves, so it solves the same Cube.
const [crossStage] = recorded.stages
const twoStageSolver = () =>
  Promise.resolve(
    parseSolveResponse({
      solved: false,
      stages: [
        { ...crossStage, moves: "U B2 R' D' B2", notes: [], pieces: [] },
        { ...crossStage, id: 'white-corners', name: 'White corners', moves: "U B U' L", notes: [], pieces: [] },
      ],
    }),
  )

function tutorWith(session: Session, options: TutorOptions): Tutor {
  return new Tutor(session, options)
}

// Plays the queue the way the scene does: finishes the current Move, which
// may queue the next, until nothing is left.
function playAll(queue: MoveQueue): void {
  for (let item = queue.current; item !== undefined; item = queue.current) queue.finish(item)
}

const queued = (queue: MoveQueue): string => formatMoves(queue.pending.map((q) => q.move))

describe('Tutor.solve', () => {
  it('sends the Scramble and the Move history, and loads the Solution, paused at its start', async () => {
    const solver = handSolver()
    const tutor = tutorWith(scrambled(), { solve: solver.solve })

    const done = tutor.solve()
    expect(tutor.getState().solveStatus).toBe('solving')
    expect(solver.calls.map((c) => [c.scramble, c.moves])).toEqual([[scramble, history]])

    solver.calls[0]?.resolve(parseSolveResponse(recorded))
    await done

    const { session, solveStatus } = tutor.getState()
    expect(solveStatus).toBe('idle')
    expect(session.solution?.stages.map((s) => s.name)).toEqual(['White cross'])
    expect(session.position).toBe(0)
    expect(session.playing).toBe(false)
    expect(session.cube.toString()).toBe(scrambled().cube.toString())
    expect(tutor.queue.isIdle).toBe(true)
  })

  it('does nothing while the Scramble plays', async () => {
    const solver = handSolver()
    const tutor = Tutor.open({ solve: solver.solve })
    expect(tutor.getState().scrambling).toBe(true)

    await tutor.solve()

    expect(solver.calls).toEqual([])
    expect(tutor.getState().solveStatus).toBe('idle')
  })

  it('says when the Cube is already solved, until the next Move', async () => {
    const tutor = tutorWith(play(Session.start(parseMoves('R U')), "U' R'"), {
      solve: () => Promise.resolve({ solved: true }),
    })

    await tutor.solve()

    expect(tutor.getState().solveStatus).toBe('already-solved')
    expect(tutor.getState().session.solution).toBeUndefined()

    tutor.rotate('left')
    expect(tutor.getState().solveStatus).toBe('idle')
  })

  it('says when Solve fails, and trying again can succeed', async () => {
    const solver = handSolver()
    const tutor = tutorWith(scrambled(), { solve: solver.solve })

    const first = tutor.solve()
    solver.calls[0]?.reject(new Error('offline'))
    await first
    expect(tutor.getState().solveStatus).toBe('failed')
    expect(tutor.getState().session.solution).toBeUndefined()

    const retry = tutor.solve()
    expect(tutor.getState().solveStatus).toBe('solving')
    solver.calls[1]?.resolve(parseSolveResponse(recorded))
    await retry
    expect(tutor.getState().solveStatus).toBe('idle')
    expect(tutor.getState().session.solution?.stages).toHaveLength(1)
  })

  it('drops a Solution for a Cube that changed while Solve was waiting', async () => {
    const solver = handSolver()
    const tutor = tutorWith(scrambled(), { solve: solver.solve })

    const done = tutor.solve()
    tutor.rotate('left')
    solver.calls[0]?.resolve(parseSolveResponse(recorded))
    await done

    expect(tutor.getState().session.solution).toBeUndefined()
    expect(tutor.getState().solveStatus).toBe('idle')
  })

  it('sends the Moves already played from a loaded Solution as part of the Move history', async () => {
    const solver = handSolver()
    const tutor = tutorWith(scrambled(), { solve: solver.solve })
    const first = tutor.solve()
    solver.calls[0]?.resolve(parseSolveResponse(recorded))
    await first
    tutor.play()
    tutor.queue.finish(tutor.queue.current!)
    tutor.pause()
    playAll(tutor.queue)

    void tutor.solve()

    expect(solver.calls[1]?.moves).toBe('M x U B2')
  })
})

describe('Tutor Playback', () => {
  async function solved(options: TutorOptions = {}): Promise<Tutor> {
    const tutor = tutorWith(scrambled(), { solve: recordedSolver, ...options })
    await tutor.solve()
    return tutor
  }

  it('plays the Solution one Move at a time, queuing each when the one before finishes, then stops', async () => {
    const tutor = await solved()

    tutor.play()
    expect(tutor.getState().session.playing).toBe(true)
    expect(queued(tutor.queue)).toBe('U')

    tutor.queue.finish(tutor.queue.current!)
    expect(queued(tutor.queue)).toBe('B2')
    expect(tutor.getState().session.position).toBe(2)

    playAll(tutor.queue)

    const { session } = tutor.getState()
    expect(session.position).toBe(9)
    expect(session.playing).toBe(false)
    expect(tutor.queue.shown.toString()).toBe(session.cube.toString())
    // The recorded Stage leaves a white cross on top.
    const top = [stickerAt('U', 0, 1), stickerAt('U', 1, 0), stickerAt('U', 1, 1), stickerAt('U', 1, 2), stickerAt('U', 2, 1)]
    expect(top.map((s) => session.cube.at(s))).toEqual(['white', 'white', 'white', 'white', 'white'])
  })

  it('pauses on the current Move: it finishes, and nothing more is queued until Play', async () => {
    const tutor = await solved()
    tutor.play()

    tutor.pause()
    playAll(tutor.queue)

    expect(tutor.getState().session.position).toBe(1)
    expect(tutor.getState().session.playing).toBe(false)
    expect(tutor.queue.isIdle).toBe(true)

    tutor.play()
    expect(queued(tutor.queue)).toBe('B2')
  })

  it('waits for a Move still animating before playing the first Move', async () => {
    const tutor = await solved()
    tutor.select(stickerAt('F', 1, 1))
    tutor.turn('up')
    tutor.turn('down')
    await tutor.solve()

    tutor.play()

    expect(queued(tutor.queue)).toBe("M' M")
    playAll(tutor.queue)
    expect(tutor.getState().session.position).toBe(9)
  })

  it('plays on through a Cube rotation the learner makes, with the Moves after it relabeled', async () => {
    const tutor = await solved()
    tutor.play()
    tutor.queue.finish(tutor.queue.current!)

    tutor.rotate('left')
    // The rotation shows once the Move animating now finishes.
    expect(queued(tutor.queue)).toBe('B2 y')
    playAll(tutor.queue)

    const { session } = tutor.getState()
    expect(formatMoves(session.history)).toBe('M x')
    // y brings the right Layer to the front, the back to the right and the left to the back.
    expect(formatMoves(session.solution?.moves ?? [])).toBe("U B2 y F' D' R2 U R U' B")
    expect(session.position).toBe(10)
    expect(tutor.queue.shown.toString()).toBe(session.cube.toString())
    const top = [stickerAt('U', 0, 1), stickerAt('U', 1, 0), stickerAt('U', 1, 1), stickerAt('U', 1, 2), stickerAt('U', 2, 1)]
    expect(top.map((s) => session.cube.at(s))).toEqual(['white', 'white', 'white', 'white', 'white'])
  })

  it('stops Playback when the learner turns a Layer, which makes the Solution stale', async () => {
    const tutor = await solved()
    tutor.play()
    tutor.queue.finish(tutor.queue.current!)

    tutor.select(stickerAt('F', 1, 1))
    tutor.turn('up')
    expect(queued(tutor.queue)).toBe("B2 M'")
    playAll(tutor.queue)

    const { session } = tutor.getState()
    expect(session.stale).toBe(true)
    expect(session.playing).toBe(false)
    expect(formatMoves(session.history)).toBe("M x U B2 M'")
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(session.cube.toString())
  })

  it('shows every Move at once when there is no scene to animate them', async () => {
    const tutor = await solved({ animates: () => false })

    tutor.play()

    const { session } = tutor.getState()
    expect(session.position).toBe(9)
    expect(session.playing).toBe(false)
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(session.cube.toString())
  })

  it('steps forward and back one Move at a time, animating each, and stops back at the Cube from before Solve', async () => {
    const tutor = await solved()

    tutor.stepForward()
    tutor.stepForward()
    expect(queued(tutor.queue)).toBe('U B2')
    expect(tutor.getState().session.position).toBe(2)

    tutor.stepBack()
    expect(queued(tutor.queue)).toBe('U B2 B2')
    playAll(tutor.queue)
    expect(tutor.getState().session.position).toBe(1)
    expect(tutor.queue.shown.toString()).toBe(tutor.getState().session.cube.toString())

    tutor.stepBack()
    tutor.stepBack()
    expect(queued(tutor.queue)).toBe("U'")
    playAll(tutor.queue)
    expect(tutor.getState().session.position).toBe(0)
    expect(tutor.queue.shown.toString()).toBe(scrambled().cube.toString())
  })

  it('pauses Playback to step: the step plays after the Move animating now, and nothing after it', async () => {
    const tutor = await solved()
    tutor.play()

    tutor.stepForward()
    playAll(tutor.queue)

    expect(tutor.getState().session.playing).toBe(false)
    expect(tutor.getState().session.position).toBe(2)
    expect(tutor.queue.shown.toString()).toBe(tutor.getState().session.cube.toString())
  })

  it('animates a half Turn in the Solution as one 180° Move', async () => {
    const tutor = await solved()
    tutor.stepForward()
    playAll(tutor.queue)

    tutor.stepForward()

    expect(tutor.queue.pending).toHaveLength(1)
    expect(tutor.queue.current?.move).toEqual({ letter: 'B', amount: 2 })
  })

  it('reverses one Move at a time as the scene finishes each, and stops at the Cube from before Solve', async () => {
    const tutor = await solved()
    tutor.stepForward()
    tutor.stepForward()
    tutor.stepForward()

    tutor.reverse()
    expect(tutor.getState().session.reversing).toBe(true)
    // The steps finish first; then Playback takes back R', then B2.
    expect(queued(tutor.queue)).toBe("U B2 R'")
    playAll(tutor.queue)

    const { session } = tutor.getState()
    expect(session.position).toBe(0)
    expect(session.reversing).toBe(false)
    expect(tutor.queue.shown.toString()).toBe(scrambled().cube.toString())
  })

  it('animates the Solution’s Moves at the speed the learner picks', async () => {
    const tutor = await solved()

    tutor.setSpeed(2)
    tutor.play()
    expect(tutor.getState().session.speed).toBe(2)
    // At 1× a quarter Turn takes 250 ms and a half Turn 375 ms.
    expect(tutor.queue.current?.durationMs).toBe(125)
    tutor.queue.finish(tutor.queue.current!)
    expect(tutor.queue.current?.durationMs).toBe(187.5)

    tutor.setSpeed(0.5)
    tutor.stepBack()
    expect(tutor.queue.pending.map((q) => q.durationMs)).toEqual([187.5, 750])
  })

  it('scrubs to any Move at once, pausing Playback', async () => {
    const tutor = await solved()
    tutor.play()

    tutor.seek(5)

    const { session } = tutor.getState()
    expect(session.position).toBe(5)
    expect(session.playing).toBe(false)
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(play(scrambled(), "U B2 R' D' B2").cube.toString())

    tutor.seek(1)
    expect(tutor.queue.shown.toString()).toBe(play(scrambled(), 'U').cube.toString())
  })

  it('jumps to a Stage’s first Move at once', async () => {
    const tutor = await solved({ solve: twoStageSolver })
    tutor.play()

    tutor.jumpToStage(1)

    const { session } = tutor.getState()
    expect(session.position).toBe(5)
    expect(session.playing).toBe(false)
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(play(scrambled(), "U B2 R' D' B2").cube.toString())
  })

  it('pauses at the end of each Stage, until the learner turns auto-pause off', async () => {
    const tutor = await solved({ solve: twoStageSolver })

    tutor.play()
    playAll(tutor.queue)
    expect(tutor.getState().session.position).toBe(5)
    expect(tutor.getState().session.playing).toBe(false)

    tutor.jumpToStage(0)
    tutor.setAutoPause(false)
    tutor.play()
    playAll(tutor.queue)
    expect(tutor.getState().session.position).toBe(9)
    expect(tutor.getState().session.autoPause).toBe(false)
  })

  it('plays and pauses with Space while a Solution is loaded, and leaves Space to the browser otherwise', async () => {
    const tutor = tutorWith(scrambled(), { solve: recordedSolver })
    expect(tutor.press({ key: ' ' })).toBe(false)
    await tutor.solve()

    expect(tutor.press({ key: ' ' })).toBe(true)
    expect(tutor.getState().session.playing).toBe(true)
    expect(tutor.press({ key: ' ' })).toBe(true)
    expect(tutor.getState().session.playing).toBe(false)

    playAll(tutor.queue)
    tutor.reverse()
    tutor.press({ key: ' ' })
    expect(tutor.getState().session.reversing).toBe(false)

    const withModifiers = [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]
    expect(withModifiers.map((m) => tutor.press({ key: ' ', ...m }))).toEqual([false, false, false, false])
  })
})
