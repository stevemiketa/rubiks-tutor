// The Session: a Scramble and every Move made since. It is the state that is
// saved and shared; what is on screen right now (the selection, a hint, the
// animation in progress) lives in Tutor.
import { Cube, formatMoves, parseMoves, type Move } from '../cube/index.ts'

// Everything a Session holds. Add new parts of a Session here, give them a
// starting value in Session.start and a codec in CODECS, and update them in
// the methods that change them; #with carries every other field forward
// unchanged.
interface Fields {
  /** The Turns applied to a solved Cube to start the Session. */
  readonly scramble: readonly Move[]
  /** Every Move made since the Scramble, oldest first. */
  readonly history: readonly Move[]
}

/**
 * The version of the saved format. Bump it whenever a field is added to
 * Fields or changes how it is saved: data saved in any other version is
 * outdated, and restoring it starts a new Session instead.
 */
const SAVED_VERSION = 1

/** A Session as plain data, ready for JSON: the format saved in browser storage. */
export type SavedSession = { readonly version: number } & { readonly [K in keyof Fields]: unknown }

/** How one field is saved as plain data, and read back. read throws on data it can't read. */
interface Codec<T> {
  write(value: T): unknown
  read(data: unknown): T
}

/** Moves are saved in standard notation, like everything else that stores them. */
const moves: Codec<readonly Move[]> = {
  write: (value) => formatMoves(value),
  read: (data) => {
    if (typeof data !== 'string') throw new TypeError('Moves are saved as notation')
    return parseMoves(data)
  },
}

// One codec per field. The type requires every field to have one, so a new
// field can't be left out of what is saved.
const CODECS: { readonly [K in keyof Fields]: Codec<Fields[K]> } = {
  scramble: moves,
  history: moves,
}
const FIELD_NAMES = Object.keys(CODECS) as (keyof Fields)[]

/**
 * A Session, as an immutable value: every change returns a new Session.
 * The Cube on screen is a solved Cube, then the Scramble, then the Move
 * history.
 */
export class Session {
  readonly #fields: Fields
  /** The Cube the Scramble and the Move history produce. */
  readonly cube: Cube

  private constructor(fields: Fields, cube: Cube) {
    this.#fields = fields
    this.cube = cube
  }

  /** A new Session that starts by applying a Scramble to a solved Cube. */
  static start(scramble: readonly Move[] = []): Session {
    return new Session({ scramble, history: [] }, Cube.solved().apply(scramble))
  }

  /**
   * The Session a saved one describes, or undefined if the data is
   * unreadable or was saved in another version of the format.
   */
  static restore(data: unknown): Session | undefined {
    if (typeof data !== 'object' || data === null) return undefined
    const saved = data as Partial<Record<string, unknown>>
    if (saved.version !== SAVED_VERSION) return undefined
    const fields: Partial<Record<keyof Fields, unknown>> = {}
    try {
      for (const name of FIELD_NAMES) fields[name] = CODECS[name].read(saved[name])
    } catch {
      return undefined
    }
    const restored = fields as Fields
    // The Cube on screen, worked out from the fields as the class comment describes.
    return new Session(restored, Cube.solved().apply(restored.scramble).apply(restored.history))
  }

  /** The Session as plain data, in the versioned format that restore reads. JSON.stringify calls it. */
  toJSON(): SavedSession {
    const saved: Record<string, unknown> = { version: SAVED_VERSION }
    for (const name of FIELD_NAMES) saved[name] = write(name, this.#fields)
    return saved as SavedSession
  }

  get scramble(): readonly Move[] {
    return this.#fields.scramble
  }

  get history(): readonly Move[] {
    return this.#fields.history
  }

  /** Whether the Cube is solved: every face a single color, in any orientation. */
  isSolved(): boolean {
    return this.cube.isSolved()
  }

  /** The Session after the learner makes a Move: a Turn or a Cube rotation. */
  move(move: Move): Session {
    return this.#with({ history: [...this.history, move] }, this.cube.apply([move]))
  }

  #with(changes: Partial<Fields>, cube: Cube = this.cube): Session {
    return new Session({ ...this.#fields, ...changes }, cube)
  }
}

function write<K extends keyof Fields>(name: K, fields: Fields): unknown {
  return CODECS[name].write(fields[name])
}
