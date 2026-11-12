// The Session: a Scramble, every Move made since, and the Solution loaded, if
// any, with the position Playback has reached in it. It is the state that is
// saved and shared; what is on screen right now (the selection, a hint, the
// animation in progress) lives in Tutor.
import { Cube, formatMoves, inverse, parseMoves, type Move } from '../cube/index.ts'
import type { Solution } from './solution.ts'

// Everything a Session holds, as plain data. Add new parts of a Session here,
// give them a starting value in Session.start and a codec in CODECS, and
// update them in the methods that change them; #with carries every other
// field forward unchanged.
interface Fields {
  /** The Turns applied to a solved Cube to start the Session. */
  readonly scramble: readonly Move[]
  /** Every Move made since the Scramble, oldest first. It is the undo stack: undo takes its last Move off. */
  readonly history: readonly Move[]
  /** The redo stack: the Moves undone since the last new Move, the most recently undone last. */
  readonly undone: readonly Move[]
  /** The Solution loaded, if any, and where Playback is in it. */
  readonly solution: LoadedSolution | undefined
}

/** A Solution loaded into a Session. Playback is a position in it, not a timer. */
interface LoadedSolution {
  readonly solution: Solution
  /** How many of the Solution's Moves have been played: the Cube shows them. */
  readonly position: number
  /** Whether Playback goes on to the next Move once the current one has been shown. */
  readonly playing: boolean
}

/**
 * The version of the saved format. Bump it whenever a field is added to
 * Fields or changes how it is saved: data saved in any other version is
 * outdated, and restoring it starts a new Session instead.
 */
const SAVED_VERSION = 2

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

/**
 * The loaded Solution isn't saved yet. toJSON saves the Cube as it is, with
 * the Moves played in the Move history, so a restored Session has the same
 * Cube and no Solution loaded.
 */
const notSaved: Codec<Fields['solution']> = { write: () => undefined, read: () => undefined }

// One codec per field. The type requires every field to have one, so a new
// field can't be left out of what is saved.
const CODECS: { readonly [K in keyof Fields]: Codec<Fields[K]> } = {
  scramble: moves,
  history: moves,
  undone: moves,
  solution: notSaved,
}
const FIELD_NAMES = Object.keys(CODECS) as (keyof Fields)[]

/**
 * A Session, as an immutable value: every change returns a new Session.
 * The Cube on screen is a solved Cube, then the Scramble, then the Move
 * history, then the loaded Solution's Moves up to the position Playback has
 * reached.
 */
export class Session {
  readonly #fields: Fields
  /** The Cube on screen, as the class comment describes. */
  readonly cube: Cube

  private constructor(fields: Fields, cube: Cube) {
    this.#fields = fields
    this.cube = cube
  }

  /** A new Session that starts by applying a Scramble to a solved Cube. */
  static start(scramble: readonly Move[] = []): Session {
    return new Session({ scramble, history: [], undone: [], solution: undefined }, Cube.solved().apply(scramble))
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
    const played = restored.solution?.solution.moves.slice(0, restored.solution.position) ?? []
    return new Session(restored, Cube.solved().apply(restored.scramble).apply(restored.history).apply(played))
  }

  /** The Session as plain data, in the versioned format that restore reads. JSON.stringify calls it. */
  toJSON(): SavedSession {
    const fields = this.closeSolution().#fields
    const saved: Record<string, unknown> = { version: SAVED_VERSION }
    for (const name of FIELD_NAMES) saved[name] = write(name, fields)
    return saved as SavedSession
  }

  get scramble(): readonly Move[] {
    return this.#fields.scramble
  }

  get history(): readonly Move[] {
    return this.#fields.history
  }

  /** The Moves redo makes again, the next one last. */
  get undone(): readonly Move[] {
    return this.#fields.undone
  }

  /**
   * Whether there is a Move to undo: one in the Move history, or one played
   * from the loaded Solution. Undo never goes back past the Scramble.
   */
  get canUndo(): boolean {
    return this.history.length > 0 || this.position > 0
  }

  /** Whether there is a Move to redo. Playing a Solution's Moves makes new Moves, so it clears the redo stack. */
  get canRedo(): boolean {
    return this.undone.length > 0 && this.position === 0
  }

  /** The loaded Solution, if any. */
  get solution(): Solution | undefined {
    return this.#fields.solution?.solution
  }

  /** How many of the loaded Solution's Moves have been played; 0 with no Solution. */
  get position(): number {
    return this.#fields.solution?.position ?? 0
  }

  /** Whether Playback is playing the loaded Solution, rather than paused. */
  get playing(): boolean {
    return this.#fields.solution?.playing ?? false
  }

  /** The loaded Solution's next Move to play, if there is one. */
  get nextMove(): Move | undefined {
    const loaded = this.#fields.solution
    return loaded?.solution.moves[loaded.position]
  }

  /** Whether the Cube is solved: every face a single color, in any orientation. */
  isSolved(): boolean {
    return this.cube.isSolved()
  }

  /**
   * The Session after the learner makes a Move: a Turn or a Cube rotation. A
   * new Move clears the redo stack, and closes a loaded Solution first.
   */
  move(move: Move): Session {
    const s = this.closeSolution()
    return s.#with({ history: [...s.history, move], undone: [] }, s.cube.apply([move]))
  }

  /**
   * The Session with its last Move undone, or this Session if there is none.
   * A loaded Solution is closed first, so undo takes back the last Move played.
   */
  undo(): Session {
    const s = this.closeSolution()
    const last = s.history.at(-1)
    if (last === undefined) return this
    return s.#with({ history: s.history.slice(0, -1), undone: [...s.undone, last] }, s.cube.apply([inverse(last)]))
  }

  /** The Session with the last undone Move made again, or this Session if there is none. Closes a loaded Solution. */
  redo(): Session {
    if (!this.canRedo) return this
    const s = this.closeSolution()
    const next = s.undone.at(-1)
    if (next === undefined) return this
    return s.#with({ history: [...s.history, next], undone: s.undone.slice(0, -1) }, s.cube.apply([next]))
  }

  /** The Session with a Solution loaded at its start, paused. A Solution already loaded is closed first. */
  loadSolution(solution: Solution): Session {
    return this.closeSolution().#with({ solution: { solution, position: 0, playing: false } })
  }

  /** Starts Playback from the current position. Does nothing with no Move left to play. */
  play(): Session {
    const loaded = this.#fields.solution
    if (loaded === undefined || loaded.playing || this.nextMove === undefined) return this
    return this.#with({ solution: { ...loaded, playing: true } })
  }

  /** Pauses Playback on the current position. */
  pause(): Session {
    const loaded = this.#fields.solution
    if (loaded === undefined || !loaded.playing) return this
    return this.#with({ solution: { ...loaded, playing: false } })
  }

  /**
   * Plays the loaded Solution's next Move, or returns this Session if there
   * is none. Playback stops by itself once the last Move is played.
   */
  stepForward(): Session {
    const loaded = this.#fields.solution
    const move = this.nextMove
    if (loaded === undefined || move === undefined) return this
    const position = loaded.position + 1
    const playing = loaded.playing && position < loaded.solution.moves.length
    return this.#with({ solution: { ...loaded, position, playing } }, this.cube.apply([move]))
  }

  /**
   * Closes the loaded Solution: the Moves played so far move into the Move
   * history, and the Cube stays as it is. Returns this Session if none is loaded.
   */
  closeSolution(): Session {
    const loaded = this.#fields.solution
    if (loaded === undefined) return this
    const played = loaded.solution.moves.slice(0, loaded.position)
    if (played.length === 0) return this.#with({ solution: undefined })
    return this.#with({ solution: undefined, history: [...this.history, ...played], undone: [] })
  }

  #with(changes: Partial<Fields>, cube: Cube = this.cube): Session {
    return new Session({ ...this.#fields, ...changes }, cube)
  }
}

function write<K extends keyof Fields>(name: K, fields: Fields): unknown {
  return CODECS[name].write(fields[name])
}
