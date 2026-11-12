// The Session: a Scramble and every Move made since. It is the state that is
// saved and shared; what is on screen right now (the selection, a hint, the
// animation in progress) lives in Tutor.
import { Cube, inverse, type Move } from '../cube/index.ts'

// Everything a Session holds, as plain data. Add new parts of a Session here,
// give them a starting value in Session.start, and update them in the
// methods that change them; #with carries every other field forward
// unchanged.
interface Fields {
  /** The Turns applied to a solved Cube to start the Session. */
  readonly scramble: readonly Move[]
  /** Every Move made since the Scramble, oldest first. It is the undo stack: undo takes its last Move off. */
  readonly history: readonly Move[]
  /** The redo stack: the Moves undone since the last new Move, the most recently undone last. */
  readonly undone: readonly Move[]
}

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
    return new Session({ scramble, history: [], undone: [] }, Cube.solved().apply(scramble))
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

  /** Whether there is a Move to undo. Undo never goes back past the Scramble. */
  get canUndo(): boolean {
    return this.history.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }

  /** Whether the Cube is solved: every face a single color, in any orientation. */
  isSolved(): boolean {
    return this.cube.isSolved()
  }

  /** The Session after the learner makes a Move: a Turn or a Cube rotation. A new Move clears the redo stack. */
  move(move: Move): Session {
    return this.#with({ history: [...this.history, move], undone: [] }, this.cube.apply([move]))
  }

  /** The Session with its last Move undone, or this Session if there is none. */
  undo(): Session {
    const last = this.history.at(-1)
    if (last === undefined) return this
    return this.#with(
      { history: this.history.slice(0, -1), undone: [...this.undone, last] },
      this.cube.apply([inverse(last)]),
    )
  }

  /** The Session with the last undone Move made again, or this Session if there is none. */
  redo(): Session {
    const next = this.undone.at(-1)
    if (next === undefined) return this
    return this.#with({ history: [...this.history, next], undone: this.undone.slice(0, -1) }, this.cube.apply([next]))
  }

  #with(changes: Partial<Fields>, cube: Cube = this.cube): Session {
    return new Session({ ...this.#fields, ...changes }, cube)
  }
}
