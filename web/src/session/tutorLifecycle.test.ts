// The Session lifecycle in the Tutor: a new Session plays its Scramble, "New
// scramble" starts over, and the Session survives a reload.
import { describe, expect, it } from 'vitest'
import { formatMoves, stickerAt } from '../cube/index.ts'
import { SessionStore, Tutor, type MoveQueue, type StorageLike } from './index.ts'

// Plays the queue the way the scene does, until nothing is left. Returns how
// long it took, in ms.
function playAll(queue: MoveQueue): number {
  let elapsedMs = 0
  for (let item = queue.current; item !== undefined; item = queue.current) {
    elapsedMs += item.durationMs
    queue.finish(item)
  }
  return elapsedMs
}

const queued = (queue: MoveQueue): string => formatMoves(queue.pending.map((q) => q.move))

// Browser storage as the tutor sees it: a Map behind Storage's interface.
function memoryStorage(): StorageLike & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) }
}

describe('Tutor.open', () => {
  it('starts a new Session that plays its Scramble from solved in about two seconds', () => {
    const tutor = Tutor.open()
    const { session, scrambling } = tutor.getState()

    expect(session.scramble).toHaveLength(25)
    expect(session.history).toEqual([])
    expect(scrambling).toBe(true)
    expect(tutor.queue.shown.isSolved()).toBe(true)
    expect(queued(tutor.queue)).toBe(formatMoves(session.scramble))

    const elapsedMs = playAll(tutor.queue)

    expect(elapsedMs).toBeGreaterThanOrEqual(1500)
    expect(elapsedMs).toBeLessThanOrEqual(2500)
    expect(tutor.getState().scrambling).toBe(false)
    expect(tutor.queue.shown.toString()).toBe(session.cube.toString())
  })

  it('shows the Scramble already applied when the learner prefers reduced motion', () => {
    const tutor = Tutor.open({ reducedMotion: () => true })
    const { session, scrambling } = tutor.getState()

    expect(session.scramble).toHaveLength(25)
    expect(scrambling).toBe(false)
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(session.cube.toString())
    expect(tutor.queue.shown.isSolved()).toBe(false)
  })
})

describe('Tutor while the Scramble plays', () => {
  const frontCenter = stickerAt('F', 1, 1)

  it('makes no Moves until the Scramble finishes, from the keys or the buttons', () => {
    const tutor = Tutor.open()
    const scramble = formatMoves(tutor.getState().session.scramble)
    tutor.select(frontCenter)

    expect(tutor.press({ key: 'ArrowUp' })).toBe(true)
    tutor.turn('right')

    expect(tutor.getState().session.history).toEqual([])
    expect(queued(tutor.queue)).toBe(scramble)

    playAll(tutor.queue)
    tutor.press({ key: 'ArrowUp' })
    expect(formatMoves(tutor.getState().session.history)).toBe("M'")
  })

  it('keeps the selection made while the Scramble plays', () => {
    const tutor = Tutor.open()
    tutor.select(frontCenter)
    playAll(tutor.queue)
    expect(tutor.getState().selected).toBe(frontCenter)
  })
})

describe('Tutor.newScramble', () => {
  const frontCenter = stickerAt('F', 1, 1)

  // A Tutor whose Scramble has finished, with Moves made after it.
  function withMoves(...keys: string[]): Tutor {
    const tutor = Tutor.open()
    playAll(tutor.queue)
    tutor.select(frontCenter)
    for (const key of keys) tutor.press({ key })
    return tutor
  }

  it('starts a new Session at once when no Moves were made after the Scramble', () => {
    const tutor = Tutor.open()
    const before = tutor.getState().session
    playAll(tutor.queue)

    tutor.newScramble()

    const { session, scrambling, confirming } = tutor.getState()
    expect(confirming).toBeUndefined()
    expect(session).not.toBe(before)
    expect(formatMoves(session.scramble)).not.toBe(formatMoves(before.scramble))
    expect(scrambling).toBe(true)
    expect(tutor.queue.shown.isSolved()).toBe(true)
    expect(queued(tutor.queue)).toBe(formatMoves(session.scramble))
  })

  it('starts over at once while the Scramble is still playing', () => {
    const tutor = Tutor.open()
    tutor.newScramble()
    const { session } = tutor.getState()
    expect(tutor.queue.shown.isSolved()).toBe(true)
    expect(queued(tutor.queue)).toBe(formatMoves(session.scramble))
  })

  it('asks first when Moves were made after the Scramble, and changes nothing yet', () => {
    const tutor = withMoves('ArrowUp')
    const before = tutor.getState().session

    tutor.newScramble()

    expect(tutor.getState().confirming).toBe('new-scramble')
    expect(tutor.getState().session).toBe(before)
    expect(tutor.queue.isIdle).toBe(false)
  })

  it('keeps the Session when the learner says no', () => {
    const tutor = withMoves('ArrowUp', 'ArrowRight')
    const before = tutor.getState().session
    tutor.newScramble()

    tutor.cancelNewScramble()

    expect(tutor.getState().confirming).toBeUndefined()
    expect(tutor.getState().session).toBe(before)
    expect(formatMoves(tutor.getState().session.history)).toBe("M' E")
  })

  it('starts a new Session when the learner confirms', () => {
    const tutor = withMoves('ArrowUp')
    const before = tutor.getState().session
    tutor.newScramble()

    tutor.confirmNewScramble()

    const { session, confirming, scrambling } = tutor.getState()
    expect(confirming).toBeUndefined()
    expect(session.history).toEqual([])
    expect(formatMoves(session.scramble)).not.toBe(formatMoves(before.scramble))
    expect(scrambling).toBe(true)
    expect(tutor.queue.shown.isSolved()).toBe(true)
  })

  it('does nothing on a confirmation nobody asked for', () => {
    const tutor = withMoves('ArrowUp')
    const before = tutor.getState().session
    tutor.confirmNewScramble()
    expect(tutor.getState().session).toBe(before)
  })
})

describe('Tutor saving the Session', () => {
  const frontCenter = stickerAt('F', 1, 1)

  // What a page shows after a reload: a new Tutor opened on the same storage.
  const reload = (storage: StorageLike): Tutor => Tutor.open({ store: new SessionStore(storage) })

  it('saves a new Session at once, so a reload during its Scramble restores it', () => {
    const storage = memoryStorage()
    const first = reload(storage)

    const tutor = reload(storage)

    expect(formatMoves(tutor.getState().session.scramble)).toBe(formatMoves(first.getState().session.scramble))
  })

  it('restores the Session after a reload, shown at once with no Scramble to play', () => {
    const storage = memoryStorage()
    const first = reload(storage)
    playAll(first.queue)
    first.select(frontCenter)
    for (const key of ['ArrowUp', 'ArrowRight', 'ArrowDown']) first.press({ key })
    const saved = first.getState().session

    const tutor = reload(storage)

    const { session, scrambling } = tutor.getState()
    expect(formatMoves(session.scramble)).toBe(formatMoves(saved.scramble))
    expect(formatMoves(session.history)).toBe("M' E M")
    expect(scrambling).toBe(false)
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(saved.cube.toString())
  })

  it('saves after every Move', () => {
    const storage = memoryStorage()
    const tutor = reload(storage)
    playAll(tutor.queue)
    tutor.select(frontCenter)
    const saves: string[] = []
    tutor.subscribe(() => saves.push(formatMoves(new SessionStore(storage).load()?.history ?? [])))

    tutor.press({ key: 'ArrowUp' })
    tutor.press({ key: 'ArrowUp' })

    expect(saves.filter(Boolean)).toEqual(["M'", "M' M'"])
  })

  it('saves the new Session that replaces one', () => {
    const storage = memoryStorage()
    const tutor = reload(storage)
    playAll(tutor.queue)
    tutor.select(frontCenter)
    tutor.press({ key: 'ArrowUp' })
    tutor.newScramble()
    tutor.confirmNewScramble()

    const restored = reload(storage).getState().session
    expect(formatMoves(restored.scramble)).toBe(formatMoves(tutor.getState().session.scramble))
    expect(restored.history).toEqual([])
  })

  it('starts a new Session, playing its Scramble, when the saved data is unreadable', () => {
    const storage = memoryStorage()
    storage.setItem('cubular.session', '{"version":1,"scramble":"R Q","history":""}')

    const tutor = reload(storage)

    expect(tutor.getState().session.scramble).toHaveLength(25)
    expect(tutor.getState().scrambling).toBe(true)
    expect(new SessionStore(storage).load()?.scramble).toHaveLength(25)
  })

  it('works without browser storage, saving nothing', () => {
    const tutor = Tutor.open({ store: new SessionStore(undefined) })
    playAll(tutor.queue)
    tutor.select(frontCenter)
    tutor.press({ key: 'ArrowUp' })
    expect(formatMoves(tutor.getState().session.history)).toBe("M'")
  })
})

