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

  it('closes the Solution when the learner makes a Move, keeping the Moves played in the Move history', async () => {
    const tutor = await solved()
    tutor.play()
    tutor.queue.finish(tutor.queue.current!)

    tutor.rotate('left')
    playAll(tutor.queue)

    const { session } = tutor.getState()
    expect(session.solution).toBeUndefined()
    expect(formatMoves(session.history)).toBe('M x U B2 y')
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
})
