import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves } from '../cube/index.ts'
import { MemoryStorage } from '../storage/memoryStorage.ts'
import { Session, SessionStore, type StorageLike } from './index.ts'

function play(session: Session, notation: string): Session {
  return parseMoves(notation).reduce((s, move) => s.move(move), session)
}

const scramble = "R U2 F' L D B2 R' U F2 L' D2 B R2 U' F L2 D' B' R U' F2 L D B' R2"

describe('SessionStore', () => {
  it('restores the Session it saved: its Scramble, its Move history, its redo stack and its Cube', () => {
    const storage = new MemoryStorage()
    const session = play(Session.start(parseMoves(scramble)), "M' x U2 E y' S").undo().undo()

    new SessionStore(storage).save(session)
    const restored = new SessionStore(storage).load()

    expect(restored).toBeDefined()
    expect(formatMoves(restored?.scramble ?? [])).toBe(scramble)
    expect(formatMoves(restored?.history ?? [])).toBe("M' x U2 E")
    expect(restored?.cube.toString()).toBe(session.cube.toString())
    expect(formatMoves(restored?.redo().redo().history ?? [])).toBe("M' x U2 E y' S")
  })

  it('saves in a versioned format: Moves in notation, under a version number, with the puzzle', () => {
    const storage = new MemoryStorage()
    new SessionStore(storage).save(play(Session.start(parseMoves("R U2 F'")), "M' x y2").undo())
    expect(storage.items.size).toBe(1)
    expect(JSON.parse(storage.saved ?? '')).toEqual({
      version: 5,
      puzzle: 'cube',
      scramble: "R U2 F'",
      history: "M' x",
      undone: 'y2',
      solution: null,
      snapshotId: null,
    })
  })

  it('saves the puzzle a Pocket Cube Session solves', () => {
    const storage = new MemoryStorage()
    new SessionStore(storage).save(play(Session.start(parseMoves("R U F'"), 'pocket'), 'U').undo())
    const saved = JSON.parse(storage.saved ?? '')
    expect(saved).toMatchObject({ version: 5, puzzle: 'pocket' })
    const restored = new SessionStore(storage).load()
    expect(restored?.puzzle).toBe('pocket')
    // Its Cube evolved corner-only, so a 3x3 reading of the same Moves differs.
    expect(restored?.cube.toString()).toBe(play(Session.start(parseMoves("R U F'"), 'pocket'), 'U').undo().cube.toString())
  })

  it('saves the ID of the Snapshot the Session is a copy of', () => {
    const storage = new MemoryStorage()
    new SessionStore(storage).save(Session.fromSnapshot({ scramble: "R U2 F'", moves: "M' x" }, 'Ab3_x-9QzK'))
    expect(JSON.parse(storage.saved ?? '')).toMatchObject({ version: 5, snapshotId: 'Ab3_x-9QzK' })
  })

  it('restores a Session saved in version 5 of the format', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'cubular.session',
      '{"version":5,"puzzle":"cube","scramble":"R U2 F\'","history":"M\' x","undone":"y2 E","solution":null,"snapshotId":"Ab3_x-9QzK"}',
    )

    const restored = new SessionStore(storage).load()

    expect(formatMoves(restored?.scramble ?? [])).toBe("R U2 F'")
    expect(formatMoves(restored?.history ?? [])).toBe("M' x")
    expect(restored?.cube.toString()).toBe(play(Session.start(parseMoves("R U2 F'")), "M' x").cube.toString())
    // The most recently undone Move is saved last, so it is redone first.
    expect(formatMoves(restored?.redo().history ?? [])).toBe("M' x E")
    expect(restored?.snapshotId).toBe('Ab3_x-9QzK')
  })

  it('replaces the Session saved before', () => {
    const storage = new MemoryStorage()
    const store = new SessionStore(storage)
    store.save(Session.start(parseMoves('R')))
    store.save(play(Session.start(parseMoves('U')), 'F'))

    expect(formatMoves(store.load()?.scramble ?? [])).toBe('U')
    expect(formatMoves(store.load()?.history ?? [])).toBe('F')
  })

  it('restores nothing when nothing was saved', () => {
    expect(new SessionStore(new MemoryStorage()).load()).toBeUndefined()
  })

  it.each([
    ['not JSON', '{"version":5,'],
    ['JSON null', 'null'],
    ['a number', '42'],
    ['a list', '[1, "R U"]'],
    ['no puzzle', '{"version":5,"scramble":"R","history":"","undone":"","solution":null,"snapshotId":null}'],
    ['a puzzle that isn’t a Puzzle', '{"version":5,"puzzle":"4x4","scramble":"R","history":"","undone":"","solution":null,"snapshotId":null}'],
    ['no Scramble', '{"version":5,"puzzle":"cube","history":"R","undone":"","solution":null,"snapshotId":null}'],
    ['no Move history', '{"version":5,"puzzle":"cube","scramble":"R","undone":"","solution":null,"snapshotId":null}'],
    ['no redo stack', '{"version":5,"puzzle":"cube","scramble":"R","history":"","solution":null,"snapshotId":null}'],
    ['Moves that aren’t notation', '{"version":5,"puzzle":"cube","scramble":["R"],"history":"","undone":"","solution":null,"snapshotId":null}'],
    ['notation with a bad Move', '{"version":5,"puzzle":"cube","scramble":"R","history":"U X","undone":"","solution":null,"snapshotId":null}'],
    ['a redo stack with a bad Move', '{"version":5,"puzzle":"cube","scramble":"R","history":"","undone":"Rw","solution":null,"snapshotId":null}'],
    ['no Snapshot ID field', '{"version":5,"puzzle":"cube","scramble":"R","history":"","undone":"","solution":null}'],
    ['a Snapshot ID that isn’t text', '{"version":5,"puzzle":"cube","scramble":"R","history":"","undone":"","solution":null,"snapshotId":7}'],
    ['an empty Snapshot ID', '{"version":5,"puzzle":"cube","scramble":"R","history":"","undone":"","solution":null,"snapshotId":""}'],
  ])('restores nothing from unreadable data: %s', (_, saved) => {
    const storage = new MemoryStorage()
    storage.setItem('cubular.session', saved)
    expect(new SessionStore(storage).load()).toBeUndefined()
  })

  it.each([
    ['no version', '{"scramble":"R","history":"","undone":"","solution":null}'],
    ['version 1, from before undo and redo', '{"version":1,"scramble":"R","history":""}'],
    ['version 2, from before Solutions were saved', '{"version":2,"scramble":"R","history":"","undone":""}'],
    [
      'version 3, from before a Session remembered its Snapshot',
      '{"version":3,"scramble":"R","history":"","undone":"","solution":null}',
    ],
    [
      'version 4, from before a Session knew its puzzle',
      '{"version":4,"scramble":"R","history":"","undone":"","solution":null,"snapshotId":null}',
    ],
    ['a newer version', '{"version":6,"puzzle":"cube","scramble":"R","history":"","undone":"","solution":null,"snapshotId":null}'],
    ['a version as text', '{"version":"5","puzzle":"cube","scramble":"R","history":"","undone":"","solution":null,"snapshotId":null}'],
  ])('restores nothing from data in another format: %s', (_, saved) => {
    const storage = new MemoryStorage()
    storage.setItem('cubular.session', saved)
    expect(new SessionStore(storage).load()).toBeUndefined()
  })

  it('saves nothing and restores nothing without storage', () => {
    const store = new SessionStore(undefined)
    expect(() => store.save(Session.start(parseMoves('R')))).not.toThrow()
    expect(store.load()).toBeUndefined()
  })

  it('carries on when storage refuses to be read or written', () => {
    const refusing: StorageLike = {
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
    }
    const store = new SessionStore(refusing)
    expect(() => store.save(Session.start(parseMoves('R')))).not.toThrow()
    expect(store.load()).toBeUndefined()
  })
})
