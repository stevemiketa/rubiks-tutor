import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves } from '../cube/index.ts'
import { Session, SessionStore, type StorageLike } from './index.ts'

// Browser storage as the tutor sees it: a Map behind Storage's interface.
class MemoryStorage {
  readonly items = new Map<string, string>()
  /** The one thing saved, or undefined if nothing is. */
  get saved(): string | undefined {
    return [...this.items.values()][0]
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

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

  it('saves in a versioned format: Moves in notation, under a version number', () => {
    const storage = new MemoryStorage()
    new SessionStore(storage).save(play(Session.start(parseMoves("R U2 F'")), "M' x y2").undo())
    expect(storage.items.size).toBe(1)
    expect(JSON.parse(storage.saved ?? '')).toEqual({
      version: 3,
      scramble: "R U2 F'",
      history: "M' x",
      undone: 'y2',
      solution: null,
    })
  })

  it('restores a Session saved in version 3 of the format', () => {
    const storage = new MemoryStorage()
    storage.setItem('cubular.session', '{"version":3,"scramble":"R U2 F\'","history":"M\' x","undone":"y2 E","solution":null}')

    const restored = new SessionStore(storage).load()

    expect(formatMoves(restored?.scramble ?? [])).toBe("R U2 F'")
    expect(formatMoves(restored?.history ?? [])).toBe("M' x")
    expect(restored?.cube.toString()).toBe(play(Session.start(parseMoves("R U2 F'")), "M' x").cube.toString())
    // The most recently undone Move is saved last, so it is redone first.
    expect(formatMoves(restored?.redo().history ?? [])).toBe("M' x E")
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
    ['not JSON', '{"version":3,'],
    ['JSON null', 'null'],
    ['a number', '42'],
    ['a list', '[1, "R U"]'],
    ['no Scramble', '{"version":3,"history":"R","undone":"","solution":null}'],
    ['no Move history', '{"version":3,"scramble":"R","undone":"","solution":null}'],
    ['no redo stack', '{"version":3,"scramble":"R","history":"","solution":null}'],
    ['Moves that aren’t notation', '{"version":3,"scramble":["R"],"history":"","undone":"","solution":null}'],
    ['notation with a bad Move', '{"version":3,"scramble":"R","history":"U X","undone":"","solution":null}'],
    ['a redo stack with a bad Move', '{"version":3,"scramble":"R","history":"","undone":"Rw","solution":null}'],
  ])('restores nothing from unreadable data: %s', (_, saved) => {
    const storage = new MemoryStorage()
    storage.setItem('cubular.session', saved)
    expect(new SessionStore(storage).load()).toBeUndefined()
  })

  it.each([
    ['no version', '{"scramble":"R","history":"","undone":"","solution":null}'],
    ['version 1, from before undo and redo', '{"version":1,"scramble":"R","history":""}'],
    ['version 2, from before Solutions were saved', '{"version":2,"scramble":"R","history":"","undone":""}'],
    ['a newer version', '{"version":4,"scramble":"R","history":"","undone":"","solution":null}'],
    ['a version as text', '{"version":"3","scramble":"R","history":"","undone":"","solution":null}'],
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
