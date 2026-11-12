// Sharing: a Session's Snapshot, the share link, and opening a Snapshot
// from a link.
import { describe, expect, it } from 'vitest'
import { Cube, formatMoves, parseMoves, stickerAt } from '../cube/index.ts'
import {
  Session,
  SessionStore,
  Tutor,
  parseSolveResponse,
  type Snapshot,
  type SnapshotClient,
  type StorageLike,
  type TutorOptions,
} from './index.ts'

function play(session: Session, notation: string): Session {
  return parseMoves(notation).reduce((s, move) => s.move(move), session)
}

function memoryStorage(): StorageLike {
  const items = new Map<string, string>()
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) }
}

/**
 * The server's Snapshot API, in memory: IDs are handed out in order, and
 * calls wait until the test lets them through with settle().
 */
function fakeServer() {
  const stored = new Map<string, Snapshot>()
  const shared: Snapshot[] = []
  let waiting: (() => void)[] = []
  let failNext: Error | undefined
  const reply = <T>(answer: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      const error = failNext
      failNext = undefined
      waiting.push(() => (error ? reject(error) : resolve(answer())))
    })
  const client: SnapshotClient = {
    share: (snapshot) =>
      reply(() => {
        shared.push(snapshot)
        const id = `id${stored.size + 1}`
        stored.set(id, snapshot)
        return { id, url: `https://cubular.example/s/${id}` }
      }),
    load: (id) => reply(() => stored.get(id)),
  }
  return {
    client,
    stored,
    shared,
    failNextWith(error: Error) {
      failNext = error
    },
    /** Answers every call made so far, and waits for the tutor to hear back. */
    async settle() {
      const calls = waiting
      waiting = []
      for (const call of calls) call()
      // The tutor hears back in microtasks, which all run before a timer.
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}

const frontCenter = stickerAt('F', 1, 1)

describe("a Session's Snapshot", () => {
  it('is the Scramble and the Move history, in standard notation', () => {
    const session = play(Session.start(parseMoves("R U' F2")), "M x2 E' z")

    expect(session.toSnapshot()).toEqual({ scramble: "R U' F2", moves: "M x2 E' z" })
  })

  it('leaves out undone Moves', () => {
    const session = play(Session.start(parseMoves('R U')), "M E S'").undo()

    expect(session.toSnapshot()).toEqual({ scramble: 'R U', moves: 'M E' })
  })

  it('opens as a new Session with that Scramble, Move history and Cube, and nothing to redo', () => {
    const session = Session.fromSnapshot({ scramble: "R U' F2", moves: "M x2 E' z" })

    expect(formatMoves(session.scramble)).toBe("R U' F2")
    expect(formatMoves(session.history)).toBe("M x2 E' z")
    expect(session.canRedo).toBe(false)
    expect(session.cube.toString()).toBe(Cube.solved().apply(parseMoves("R U' F2 M x2 E' z")).toString())
    expect(session.undo().cube.toString()).toBe(Cube.solved().apply(parseMoves("R U' F2 M x2 E'")).toString())
  })

  it("can't be opened from invalid notation", () => {
    expect(() => Session.fromSnapshot({ scramble: 'R Rw', moves: '' })).toThrow()
  })
})

describe('the Snapshot a Session came from', () => {
  // A one-Stage Solution for Scramble R then U, written by hand.
  const solutionRU = () => {
    const result = parseSolveResponse({
      solved: false,
      stages: [{ id: 'white-cross', name: 'White cross', goal: 'g', moves: "U' R'", notes: [], algorithms: [], pieces: [] }],
    })
    if (result.solved) throw new Error('unreachable')
    return result.solution
  }

  it('is the one it was opened from, or shared as', () => {
    expect(Session.start(parseMoves('R')).snapshotId).toBeUndefined()
    expect(Session.fromSnapshot({ scramble: 'R', moves: 'U' }, 'abc').snapshotId).toBe('abc')
    expect(play(Session.start(parseMoves('R')), 'U').sharedAs('id1').snapshotId).toBe('id1')
  })

  it('stays while what the Session would share stays the same: loading, pausing or closing a Solution with nothing played', () => {
    const opened = Session.fromSnapshot({ scramble: 'R', moves: 'U' }, 'abc')

    const loaded = opened.loadSolution(solutionRU())
    expect(loaded.snapshotId).toBe('abc')
    expect(loaded.play().pause().setSpeed(2).setAutoPause(false).snapshotId).toBe('abc')
    expect(loaded.closeSolution().snapshotId).toBe('abc')
  })

  it('is forgotten at the first change to what the Session would share: a Move, an undo, or a Move played from a Solution', () => {
    const opened = Session.fromSnapshot({ scramble: 'R', moves: 'U' }, 'abc')

    expect(play(opened, 'F').snapshotId).toBeUndefined()
    expect(opened.undo().snapshotId).toBeUndefined()
    const stepped = opened.loadSolution(solutionRU()).stepForward()
    expect(stepped.snapshotId).toBeUndefined()
    // Coming back to the same Moves doesn't make it a copy of the Snapshot again.
    expect(stepped.stepBack().snapshotId).toBeUndefined()
  })

  it('is saved with the Session', () => {
    const store = new SessionStore(memoryStorage())
    store.save(Session.fromSnapshot({ scramble: 'R', moves: 'U' }, 'abc').loadSolution(solutionRU()))

    expect(store.load()?.snapshotId).toBe('abc')
  })
})

describe('Tutor.share', () => {
  function sharingTutor() {
    const server = fakeServer()
    const store = new SessionStore(memoryStorage())
    const tutor = new Tutor(Session.start(parseMoves('R U F')), { store, snapshots: server.client })
    tutor.select(frontCenter)
    tutor.turn('up')
    tutor.turn('right')
    return { tutor, server, store }
  }

  it("saves the Session's Snapshot and shows its link, which the address bar then shows", async () => {
    const { tutor, server } = sharingTutor()

    const sharing = tutor.share()
    expect(tutor.getState().sharing).toEqual({ status: 'saving' })
    expect(tutor.getState().snapshotId).toBeUndefined()
    await server.settle()
    await sharing

    expect(server.shared).toEqual([{ scramble: 'R U F', moves: "M' E" }])
    expect(tutor.getState().sharing).toEqual({ status: 'shared', id: 'id1', url: 'https://cubular.example/s/id1' })
    expect(tutor.getState().snapshotId).toBe('id1')
  })

  it('shares the Cube as it is mid-Playback: the Moves played from the Solution, but not the Solution', async () => {
    const server = fakeServer()
    const solveRU = () =>
      Promise.resolve(
        parseSolveResponse({
          solved: false,
          stages: [{ id: 'white-cross', name: 'White cross', goal: 'g', moves: "U' R'", notes: [], algorithms: [], pieces: [] }],
        }),
      )
    const tutor = new Tutor(Session.start(parseMoves('R U')), { snapshots: server.client, solve: solveRU })
    await tutor.solve()
    tutor.stepForward()

    void tutor.share()
    await server.settle()

    expect(server.shared).toEqual([{ scramble: 'R U', moves: "U'" }])
  })

  it('shares once at a time', async () => {
    const { tutor, server } = sharingTutor()

    void tutor.share()
    void tutor.share()
    await server.settle()

    expect(server.shared).toHaveLength(1)
  })

  it('does nothing while the Scramble plays', async () => {
    const server = fakeServer()
    const tutor = Tutor.open({ snapshots: server.client })
    expect(tutor.getState().scrambling).toBe(true)

    void tutor.share()
    await server.settle()

    expect(tutor.getState().sharing).toBeUndefined()
    expect(server.shared).toEqual([])
  })

  it('shows why sharing failed, and can try again', async () => {
    const { tutor, server } = sharingTutor()
    server.failNextWith(new Error('Too many Snapshots shared from your address. Try again in 2 minutes.'))

    void tutor.share()
    await server.settle()

    expect(tutor.getState().sharing).toEqual({
      status: 'failed',
      message: 'Too many Snapshots shared from your address. Try again in 2 minutes.',
    })
    expect(tutor.getState().snapshotId).toBeUndefined()

    void tutor.share()
    await server.settle()
    expect(tutor.getState().sharing).toMatchObject({ status: 'shared', id: 'id1' })
  })

  it('switches the address back to the tutor at the first Move after sharing, or undo', async () => {
    const { tutor, server } = sharingTutor()
    void tutor.share()
    await server.settle()
    tutor.closeShare()

    expect(tutor.getState().sharing).toBeUndefined()
    expect(tutor.getState().snapshotId).toBe('id1')
    tutor.select(stickerAt('U', 1, 1))
    expect(tutor.getState().snapshotId).toBe('id1')

    tutor.turn('right')
    expect(tutor.getState().snapshotId).toBeUndefined()

    void tutor.share()
    await server.settle()
    expect(tutor.getState().snapshotId).toBe('id2')
    tutor.undo()
    expect(tutor.getState().snapshotId).toBeUndefined()
  })

  it('keeps the address on the tutor when a Move was made while the Snapshot was saved', async () => {
    const { tutor, server } = sharingTutor()

    void tutor.share()
    tutor.turn('down')
    await server.settle()

    // The link is to the Session as it was when Share was pressed.
    expect(server.shared).toEqual([{ scramble: 'R U F', moves: "M' E" }])
    expect(tutor.getState().sharing).toMatchObject({ status: 'shared', id: 'id1' })
    expect(tutor.getState().snapshotId).toBeUndefined()
  })

  it('forgets a share that was closed before it finished', async () => {
    const { tutor, server } = sharingTutor()

    void tutor.share()
    tutor.closeShare()
    await server.settle()

    expect(tutor.getState().sharing).toBeUndefined()
    expect(tutor.getState().snapshotId).toBeUndefined()
  })
})

describe('Tutor.open with a share link', () => {
  function openingTutor(snapshot: Snapshot | undefined, options: TutorOptions = {}) {
    const server = fakeServer()
    if (snapshot) server.stored.set('abc', snapshot)
    const store = new SessionStore(memoryStorage())
    store.save(play(Session.start(parseMoves('D L B')), 'R R R'))
    const tutor = Tutor.open({ ...options, store, snapshots: server.client }, 'abc')
    return { tutor, server, store }
  }

  // A one-Stage Solution for Scramble R then U, written by hand.
  const solveRU = () =>
    Promise.resolve(
      parseSolveResponse({
        solved: false,
        stages: [
          { id: 'white-cross', name: 'White cross', goal: 'Solve it.', moves: "U' R'", notes: [], algorithms: [], pieces: [] },
        ],
      }),
    )

  it("keeps the share link while Solve loads a Solution, which changes none of the Snapshot's Moves", async () => {
    const { tutor, server } = openingTutor({ scramble: 'R', moves: 'U' }, { solve: solveRU })
    void tutor.solve()
    expect(tutor.getState().solveStatus).toBe('idle')
    await server.settle()

    await tutor.solve()

    expect(tutor.getState().session.solution).toBeDefined()
    expect(tutor.getState().snapshotId).toBe('abc')
    tutor.select(frontCenter)
    tutor.turn('up')
    expect(tutor.getState().snapshotId).toBeUndefined()
  })

  it('opens the Snapshot as it was shared, in place of the saved Session, without animating', async () => {
    const { tutor, server, store } = openingTutor({ scramble: "R U' F2", moves: "M x2 E'" })
    expect(tutor.getState().opening).toBe('loading')
    expect(tutor.getState().snapshotId).toBe('abc')

    await server.settle()

    const { session, opening, snapshotId, scrambling } = tutor.getState()
    expect(opening).toBeUndefined()
    expect(scrambling).toBe(false)
    expect(snapshotId).toBe('abc')
    expect(formatMoves(session.scramble)).toBe("R U' F2")
    expect(formatMoves(session.history)).toBe("M x2 E'")
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(session.cube.toString())
    expect(store.load()?.toSnapshot()).toEqual({ scramble: "R U' F2", moves: "M x2 E'" })
  })

  it('restores the saved Session on a reload of the link it was opened from: its Solution and Playback settings', async () => {
    const { tutor, server, store } = openingTutor({ scramble: 'R', moves: 'U' }, { solve: solveRU })
    await server.settle()
    await tutor.solve()
    tutor.setSpeed(2)

    const reloaded = Tutor.open({ store, snapshots: server.client }, 'abc')

    // Restored at once: the server isn't asked again.
    const { session, opening, snapshotId } = reloaded.getState()
    expect(opening).toBeUndefined()
    expect(snapshotId).toBe('abc')
    expect(formatMoves(session.solution?.moves ?? [])).toBe("U' R'")
    expect(session.speed).toBe(2)
    expect(reloaded.queue.shown.toString()).toBe(session.cube.toString())
  })

  it('restores the saved Session on a reload of the link it was just shared as: where Playback was in its Solution', async () => {
    const server = fakeServer()
    const store = new SessionStore(memoryStorage())
    const tutor = new Tutor(Session.start(parseMoves('R U')), { store, snapshots: server.client, solve: solveRU })
    await tutor.solve()
    tutor.stepForward()
    void tutor.share()
    await server.settle()

    const reloaded = Tutor.open({ store, snapshots: server.client }, 'id1')

    const { session, opening, snapshotId } = reloaded.getState()
    expect(opening).toBeUndefined()
    expect(snapshotId).toBe('id1')
    expect(session.position).toBe(1)
    expect(formatMoves(session.solution?.moves ?? [])).toBe("U' R'")
    expect(session.cube.toString()).toBe(Cube.solved().apply(parseMoves("R U U'")).toString())
  })

  it('restores the redo stack too, on a reload of the link it was shared as', async () => {
    const server = fakeServer()
    const store = new SessionStore(memoryStorage())
    const tutor = new Tutor(Session.start(parseMoves('R U F')), { store, snapshots: server.client })
    tutor.select(frontCenter)
    tutor.turn('up')
    tutor.turn('right')
    tutor.undo()
    void tutor.share()
    await server.settle()

    const reloaded = Tutor.open({ store, snapshots: server.client }, 'id1')

    expect(formatMoves(reloaded.getState().session.history)).toBe("M'")
    expect(formatMoves(reloaded.getState().session.undone)).toBe('E')
  })

  it("opens the link's Snapshot again once the saved Session has changed from it", async () => {
    const { tutor, server, store } = openingTutor({ scramble: 'R', moves: 'U' })
    await server.settle()
    tutor.select(frontCenter)
    tutor.turn('up')

    const reloaded = Tutor.open({ store, snapshots: server.client }, 'abc')
    expect(reloaded.getState().opening).toBe('loading')
    await server.settle()

    expect(formatMoves(reloaded.getState().session.history)).toBe('U')
    expect(store.load()?.toSnapshot()).toEqual({ scramble: 'R', moves: 'U' })
  })

  it('opens any other link in place of the saved Session, even one that came from a Snapshot', async () => {
    const { tutor, server, store } = openingTutor({ scramble: 'R', moves: 'U' }, { solve: solveRU })
    await server.settle()
    await tutor.solve()
    server.stored.set('xyz', { scramble: 'F', moves: 'B' })

    const other = Tutor.open({ store, snapshots: server.client }, 'xyz')
    await server.settle()

    const { session, snapshotId } = other.getState()
    expect(snapshotId).toBe('xyz')
    expect(session.toSnapshot()).toEqual({ scramble: 'F', moves: 'B' })
    expect(session.solution).toBeUndefined()
    expect(store.load()?.snapshotId).toBe('xyz')
  })

  it('makes no Moves until the Snapshot has opened', async () => {
    const { tutor, server } = openingTutor({ scramble: 'R', moves: 'U' })
    tutor.select(frontCenter)
    tutor.turn('up')
    tutor.rotate('left')

    await server.settle()

    expect(formatMoves(tutor.getState().session.history)).toBe('U')
  })

  it("saves the recipient's Moves as their own Session, leaving the Snapshot as it was", async () => {
    const { tutor, server, store } = openingTutor({ scramble: 'R', moves: 'U' })
    await server.settle()
    tutor.select(frontCenter)

    tutor.turn('up')

    expect(tutor.getState().snapshotId).toBeUndefined()
    expect(store.load()?.toSnapshot()).toEqual({ scramble: 'R', moves: "U M'" })
    expect(server.stored.get('abc')).toEqual({ scramble: 'R', moves: 'U' })
    expect(server.shared).toEqual([])
  })

  it('says when there is no such Snapshot, and can start a new Session instead', async () => {
    const { tutor, server, store } = openingTutor(undefined)
    await server.settle()

    expect(tutor.getState().opening).toBe('not-found')
    expect(tutor.getState().snapshotId).toBe('abc')

    tutor.newScramble()

    const { opening, snapshotId, session } = tutor.getState()
    expect(opening).toBeUndefined()
    expect(snapshotId).toBeUndefined()
    expect(session.scramble).toHaveLength(25)
    expect(store.load()?.toSnapshot().scramble).toBe(formatMoves(session.scramble))
  })

  it('says when the Snapshot could not be loaded, and can try again', async () => {
    const server = fakeServer()
    server.stored.set('abc', { scramble: 'R', moves: 'U' })
    server.failNextWith(new Error('offline'))
    const tutor = Tutor.open({ snapshots: server.client }, 'abc')
    await server.settle()

    expect(tutor.getState().opening).toBe('failed')

    void tutor.openSnapshot('abc')
    expect(tutor.getState().opening).toBe('loading')
    await server.settle()
    expect(tutor.getState().opening).toBeUndefined()
    expect(formatMoves(tutor.getState().session.history)).toBe('U')
  })

  it('opens nothing if a new Session was started while the Snapshot loaded', async () => {
    const { tutor, server } = openingTutor({ scramble: 'R', moves: 'U' })

    tutor.newScramble()
    await server.settle()

    expect(tutor.getState().session.scramble).toHaveLength(25)
    expect(tutor.getState().snapshotId).toBeUndefined()
  })
})
