// The live tutor: the current Session plus what is on screen around it (the
// selected Sticker, a hint, whether the Scramble is still playing, a question
// for the learner) and the MoveQueue the 3D scene animates. It starts new
// Sessions and saves the Session after every change. React reads it through
// useSyncExternalStore; nothing here renders.
import { Cube, type Move, type Sticker } from '../cube/index.ts'
import { commandForKey, isSelectable, turnFor, type Command, type Direction, type KeyPress } from './controls.ts'
import { MoveQueue } from './moveQueue.ts'
import { generateScramble } from './scramble.ts'
import { Session } from './session.ts'
import type { SessionStore } from './sessionStore.ts'

/** How long a new Session's Scramble takes to play, in ms. */
const SCRAMBLE_MS = 2000

/** A hint the tutor shows: 'select-sticker' asks the learner to select a Sticker first. */
export type Hint = 'select-sticker'

/**
 * Something the tutor asks the learner to confirm, in the page: 'new-scramble'
 * asks before a new Session replaces one with Moves in it.
 */
export type Confirmation = 'new-scramble'

/** Everything the tutor's UI shows, as one immutable snapshot. */
export interface TutorState {
  readonly session: Session
  /** The selected Sticker: a position on screen, which stays put through Turns. */
  readonly selected: Sticker | undefined
  readonly hint: Hint | undefined
  /**
   * Whether a new Session's Scramble is still playing. Moves wait until it
   * finishes, and so do Solve and Share.
   */
  readonly scrambling: boolean
  /** What the tutor is waiting for the learner to confirm, if anything. */
  readonly confirming: Confirmation | undefined
}

/** Where a Tutor saves its Session and how it starts new ones. Every option has a default. */
export interface TutorOptions {
  /** Where the Session is saved after every change, and restored from by open. Omit to save nothing. */
  readonly store?: SessionStore
  /** Random numbers in [0, 1) for new Scrambles. Math.random by default. */
  readonly random?: () => number
  /**
   * Whether the learner prefers reduced motion, asked each time a Scramble
   * starts. If so, the Scramble appears already applied instead of playing.
   */
  readonly reducedMotion?: () => boolean
}

export class Tutor {
  /** The Moves for the scene to animate. Every Move the Session makes is queued here. */
  readonly queue: MoveQueue
  #state: TutorState
  readonly #listeners = new Set<() => void>()
  readonly #options: TutorOptions

  /** A Tutor showing a Session as it is, with nothing to animate. */
  constructor(session: Session = Session.start(), options: TutorOptions = {}) {
    this.queue = new MoveQueue(session.cube)
    this.#state = { session, selected: undefined, hint: undefined, scrambling: false, confirming: undefined }
    this.#options = options
    this.queue.subscribe(() => {
      if (this.#state.scrambling && this.queue.isIdle) this.#update({ scrambling: false })
    })
  }

  /**
   * The Tutor a page opens: the Session saved in the store, shown as it was
   * left, or else a new Session, whose Scramble plays from solved.
   */
  static open(options: TutorOptions = {}): Tutor {
    const saved = options.store?.load()
    if (saved !== undefined) return new Tutor(saved, options)
    const tutor = new Tutor(Session.start(), options)
    tutor.#startNew()
    return tutor
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

  /**
   * Starts a new Session with a fresh Scramble. If Moves were made after the
   * Scramble, asks the learner to confirm first: see confirmNewScramble.
   */
  newScramble(): void {
    if (this.#state.session.history.length > 0) this.#update({ confirming: 'new-scramble' })
    else this.#startNew()
  }

  /** Answers yes to newScramble's question: the new Session replaces this one. */
  confirmNewScramble(): void {
    if (this.#state.confirming === 'new-scramble') this.#startNew()
  }

  /** Answers no to newScramble's question: the Session stays as it is. */
  cancelNewScramble(): void {
    if (this.#state.confirming === 'new-scramble') this.#update({ confirming: undefined })
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
  // show once its queue drains always agree. Moves wait for the Scramble:
  // until it finishes, they are ignored.
  #move(move: Move): void {
    if (this.#state.scrambling) return
    this.queue.enqueue(move)
    this.#update({ session: this.#state.session.move(move) })
  }

  // Starts a new Session with a fresh Scramble, played from a solved Cube.
  #startNew(): void {
    const session = Session.start(generateScramble(this.#options.random))
    const changes = { session, hint: undefined, confirming: undefined }
    if (this.#options.reducedMotion?.()) {
      this.queue.jump(session.cube)
      this.#update({ ...changes, scrambling: false })
      return
    }
    this.queue.jump(Cube.solved())
    for (const move of session.scramble) this.queue.enqueue(move, SCRAMBLE_MS / session.scramble.length)
    this.#update({ ...changes, scrambling: true })
  }

  // Every change goes through here. A changed Session is saved before
  // anything else hears of it.
  #update(changes: Partial<TutorState>): void {
    const before = this.#state
    this.#state = { ...before, ...changes }
    if (this.#state.session !== before.session) this.#options.store?.save(this.#state.session)
    for (const listener of this.#listeners) listener()
  }
}
