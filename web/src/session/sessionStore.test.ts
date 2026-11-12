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
  it('restores the Session it saved: its Scramble, its Move history and its Cube', () => {
    const storage = new MemoryStorage()
    const session = play(Session.start(parseMoves(scramble)), "M' x U2 E y' S")

    new SessionStore(storage).save(session)
    const restored = new SessionStore(storage).load()

    expect(restored).toBeDefined()
    expect(formatMoves(restored?.scramble ?? [])).toBe(scramble)
    expect(formatMoves(restored?.history ?? [])).toBe("M' x U2 E y' S")
    expect(restored?.cube.toString()).toBe(session.cube.toString())
  })

  it('saves in a versioned format: Moves in notation, under a version number', () => {
    const storage = new MemoryStorage()
    new SessionStore(storage).save(play(Session.start(parseMoves("R U2 F'")), "M' x"))
    expect(storage.items.size).toBe(1)
    expect(JSON.parse(storage.saved ?? '')).toEqual({ version: 1, scramble: "R U2 F'", history: "M' x" })
  })

  it('restores a Session saved in version 1 of the format', () => {
    const storage = new MemoryStorage()
    storage.setItem('cubular.session', '{"version":1,"scramble":"R U2 F\'","history":"M\' x"}')

    const restored = new SessionStore(storage).load()

    expect(formatMoves(restored?.scramble ?? [])).toBe("R U2 F'")
    expect(formatMoves(restored?.history ?? [])).toBe("M' x")
    expect(restored?.cube.toString()).toBe(play(Session.start(parseMoves("R U2 F'")), "M' x").cube.toString())
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
    ['not JSON', '{"version":1,'],
    ['JSON null', 'null'],
    ['a number', '42'],
    ['a list', '[1, "R U"]'],
    ['no Scramble', '{"version":1,"history":"R"}'],
    ['no Move history', '{"version":1,"scramble":"R"}'],
    ['Moves that aren’t notation', '{"version":1,"scramble":["R"],"history":""}'],
    ['notation with a bad Move', '{"version":1,"scramble":"R","history":"U X"}'],
  ])('restores nothing from unreadable data: %s', (_, saved) => {
    const storage = new MemoryStorage()
    storage.setItem('cubular.session', saved)
    expect(new SessionStore(storage).load()).toBeUndefined()
  })

  it.each([
    ['no version', '{"scramble":"R","history":""}'],
    ['an older version', '{"version":0,"scramble":"R","history":""}'],
    ['a newer version', '{"version":2,"scramble":"R","history":""}'],
    ['a version as text', '{"version":"1","scramble":"R","history":""}'],
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
