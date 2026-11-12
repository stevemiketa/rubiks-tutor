// The live tutor: the current Session plus what is on screen around it (the
// selected Sticker, a hint) and the MoveQueue the 3D scene animates. React
// reads it through useSyncExternalStore; nothing here renders.
import type { Move, Sticker } from '../cube/index.ts'
import { commandForKey, isSelectable, turnFor, type Command, type Direction, type KeyPress } from './controls.ts'
import { MoveQueue } from './moveQueue.ts'
import { Session } from './session.ts'

/** A hint the tutor shows: 'select-sticker' asks the learner to select a Sticker first. */
export type Hint = 'select-sticker'

/** Everything the tutor's UI shows, as one immutable snapshot. */
export interface TutorState {
  readonly session: Session
  /** The selected Sticker: a position on screen, which stays put through Turns. */
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

  /** Turns the Layer through the selected Sticker, or asks for a selection. */
  turn(direction: Direction): void {
    const { selected } = this.#state
    if (selected === undefined) {
      this.#update({ hint: 'select-sticker' })
      return
    }
    this.#move(turnFor(selected, direction))
  }

  /** Does what a Command asks. */
  run(command: Command): void {
    switch (command.kind) {
      case 'turn':
        this.turn(command.direction)
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

  // Every Move goes through here, so the Session and what the scene will
  // show once its queue drains always agree.
  #move(move: Move): void {
    this.queue.enqueue(move)
    this.#update({ session: this.#state.session.move(move) })
  }

  #update(changes: Partial<TutorState>): void {
    this.#state = { ...this.#state, ...changes }
    for (const listener of this.#listeners) listener()
  }
}
