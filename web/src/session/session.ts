// The Session: a Scramble and every Move made since. It is the state that is
// saved and shared; what is on screen right now (the selection, a hint, the
// animation in progress) lives in Tutor.
import { Cube, type Move } from '../cube/index.ts'

// Everything a Session holds. Add new parts of a Session here, give them a
// starting value in Session.start, and update them in the methods that
// change them; #with carries every other field forward unchanged.
interface Fields {
  /** The Turns applied to a solved Cube to start the Session. */
  readonly scramble: readonly Move[]
  /** Every Move made since the Scramble, oldest first. */
  readonly history: readonly Move[]
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
    return new Session({ scramble, history: [] }, Cube.solved().apply(scramble))
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
