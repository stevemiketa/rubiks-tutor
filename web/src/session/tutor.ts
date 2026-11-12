// The live tutor: the current Session plus what is on screen around it (the
// selected Sticker, a hint) and the MoveQueue the 3D scene animates. React
// reads it through useSyncExternalStore; nothing here renders.
import { formatMove, inverse, isRotation, type Move, type Sticker } from '../cube/index.ts'
import {
  commandForKey,
  isSelectable,
  rotationFor,
  stepSelection,
  turnFor,
  type Command,
  type Direction,
  type KeyPress,
  type RotationDirection,
} from './controls.ts'
import { MoveQueue } from './moveQueue.ts'
import { Session } from './session.ts'

/** A hint the tutor shows: 'select-sticker' asks the learner to select a Sticker first. */
export type Hint = 'select-sticker'

/** Everything the tutor's UI shows, as one immutable snapshot. */
export interface TutorState {
  readonly session: Session
  /** The selected Sticker: a position on screen, which stays put through Turns and Cube rotations. */
  readonly selected: Sticker | undefined
  readonly hint: Hint | undefined
}

export class Tutor {
  /** The Moves for the scene to animate. Every Move the Session makes is queued here. */
  readonly queue: MoveQueue
  #state: TutorState
  readonly #listeners = new Set<() => void>()

  constructor(session: Session = Session.start()) {
    this.queue = new MoveQueue(session.cube)
    this.#state = { session, selected: undefined, hint: undefined }
  }

  /** The current state. The same object until something changes. */
  getState = (): TutorState => this.#state

  /** Calls listener after every change. Returns a function that unsubscribes. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Selects a Sticker on the front, right or top face; ignores any other. */
  select(sticker: Sticker): void {
    if (!isSelectable(sticker)) return
    this.#update({ selected: sticker, hint: undefined })
  }

  /** Moves the selection to the next Sticker one way, or selects the front face's center. */
  stepSelection(direction: Direction): void {
    this.select(stepSelection(this.#state.selected, direction))
  }

  clearSelection(): void {
    if (this.#state.selected !== undefined) this.#update({ selected: undefined })
  }

  /** Turns the Layer through the selected Sticker, or asks for a selection. */
  turn(direction: Direction): void {
    const { selected } = this.#state
    if (selected === undefined) {
      this.#update({ hint: 'select-sticker' })
      return
    }
    this.#move(turnFor(selected, direction))
  }

  /** Rotates the whole Cube one way. The selection stays on the same spot on screen. */
  rotate(direction: RotationDirection): void {
    this.#move(rotationFor(direction))
  }

  /**
   * Records the Cube rotations that a drag ended on. The scene has already
   * shown the Cube turning, so they are queued to show at once rather than
   * animate again.
   */
  recordDrag(rotations: readonly Move[]): void {
    for (const rotation of rotations) {
      if (!isRotation(rotation)) throw new RangeError(`a drag recorded ${formatMove(rotation)}, which is not a Cube rotation`)
    }
    for (const rotation of rotations) this.#move(rotation, 0)
  }

  /** Undoes the last Move, animating it backward. Does nothing if there is none. */
  undo(): void {
    const { session } = this.#state
    const last = session.history.at(-1)
    if (last === undefined) return
    this.queue.enqueue(inverse(last))
    this.#update({ session: session.undo() })
  }

  /** Makes the last undone Move again. Does nothing if there is none. */
  redo(): void {
    const { session } = this.#state
    const next = session.undone.at(-1)
    if (next === undefined) return
    this.queue.enqueue(next)
    this.#update({ session: session.redo() })
  }

  /** Does what a Command asks. */
  run(command: Command): void {
    switch (command.kind) {
      case 'turn':
        this.turn(command.direction)
        return
      case 'rotate':
        this.rotate(command.direction)
        return
      case 'step-selection':
        this.stepSelection(command.direction)
        return
      case 'clear-selection':
        this.clearSelection()
        return
      case 'undo':
        this.undo()
        return
      case 'redo':
        this.redo()
        return
    }
  }

  /**
   * Handles a key press. Returns whether the key was one of the tutor's, in
   * which case the caller should stop the browser's default action.
   */
  press(key: KeyPress): boolean {
    const command = commandForKey(key)
    if (command === undefined) return false
    this.run(command)
    return true
  }

  // Every new Move goes through here, so the Session and what the scene will
  // show once its queue drains always agree. Undo and redo queue their own
  // Moves the same way.
  #move(move: Move, durationMs?: number): void {
    this.queue.enqueue(move, durationMs)
    this.#update({ session: this.#state.session.move(move) })
  }

  #update(changes: Partial<TutorState>): void {
    this.#state = { ...this.#state, ...changes }
    for (const listener of this.#listeners) listener()
  }
}
