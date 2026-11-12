// The live tutor: the current Session plus what is on screen around it (the
// selected Sticker, a hint, whether the Scramble is still playing, a question
// for the learner, sharing) and the MoveQueue the 3D scene animates. It starts
// new Sessions, shares them, opens share links, and saves the Session after
// every change. React reads it through useSyncExternalStore; nothing here
// renders.
import { Cube, formatMove, inverse, isRotation, type Move, type Sticker } from '../cube/index.ts'
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
import { generateScramble } from './scramble.ts'
import { Session } from './session.ts'
import type { SessionStore } from './sessionStore.ts'
import type { Opening, Sharing, SnapshotClient } from './sharing.ts'

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
  /** The selected Sticker: a position on screen, which stays put through Turns and Cube rotations. */
  readonly selected: Sticker | undefined
  readonly hint: Hint | undefined
  /**
   * Whether a new Session's Scramble is still playing. Moves wait until it
   * finishes, and so do Solve and Share.
   */
  readonly scrambling: boolean
  /** What the tutor is waiting for the learner to confirm, if anything. */
  readonly confirming: Confirmation | undefined
  /**
   * The Snapshot the tutor shows unchanged, whose share link the address bar
   * shows: the one being opened, or the one just opened or shared. The first
   * change to the Session clears it.
   */
  readonly snapshotId: string | undefined
  /** Where opening a share link has got to, until the Snapshot opens. Moves wait until then. */
  readonly opening: Opening | undefined
  /** Where sharing has got to, while the share dialog is open. */
  readonly sharing: Sharing | undefined
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
  /**
   * Whether there is a scene to animate the queue. If not (no WebGL), each
   * Move, undo and redo is shown at once instead of queued. True by default.
   */
  readonly animates?: () => boolean
  /** The server's Snapshot API, for sharing and opening share links. Without it, neither works. */
  readonly snapshots?: SnapshotClient
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
    this.#state = {
      session,
      selected: undefined,
      hint: undefined,
      scrambling: false,
      confirming: undefined,
      snapshotId: undefined,
      opening: undefined,
      sharing: undefined,
    }
    this.#options = options
    this.queue.subscribe(() => {
      if (this.#state.scrambling && this.queue.isIdle) this.#update({ scrambling: false })
    })
  }

  /**
   * The Tutor a page opens: the Session saved in the store, shown as it was
   * left, or else a new Session, whose Scramble plays from solved. Given a
   * share link's snapshotId, it opens that Snapshot instead: see
   * openSnapshot.
   */
  static open(options: TutorOptions = {}, snapshotId?: string): Tutor {
    if (snapshotId !== undefined) {
      const tutor = new Tutor(Session.start(), options)
      void tutor.openSnapshot(snapshotId)
      return tutor
    }
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
   * Scramble, even ones since undone (redo could bring them back), asks the
   * learner to confirm first: see confirmNewScramble.
   */
  newScramble(): void {
    const { session } = this.#state
    if (session.canUndo || session.canRedo) this.#update({ confirming: 'new-scramble' })
    else this.#startNew()
  }

  /**
   * Opens the Snapshot a share link names. Once it arrives it replaces the
   * Session, and the one saved in the store, and shows at once. Until then
   * Moves are ignored. Resolves when it has opened or failed: see
   * TutorState.opening.
   */
  async openSnapshot(id: string): Promise<void> {
    this.#update({ snapshotId: id, opening: 'loading', sharing: undefined, confirming: undefined })
    const stillOpening = () => this.#state.opening === 'loading' && this.#state.snapshotId === id
    let session: Session
    try {
      const snapshot = await this.#client().load(id)
      if (!stillOpening()) return
      if (snapshot === undefined) {
        this.#update({ opening: 'not-found' })
        return
      }
      session = Session.fromSnapshot(snapshot)
    } catch {
      if (stillOpening()) this.#update({ opening: 'failed' })
      return
    }
    this.queue.jump(session.cube)
    this.#update({ session, snapshotId: id, opening: undefined, scrambling: false, hint: undefined })
  }

  /**
   * Shares the Session: saves its Snapshot on the server, then shows the
   * share link. The address bar shows it too, unless the Session changed
   * meanwhile. Does nothing while the Scramble plays, while a share link
   * opens, or while a share is already being saved.
   */
  async share(): Promise<void> {
    const { session, scrambling, opening, sharing } = this.#state
    if (scrambling || opening !== undefined || sharing?.status === 'saving') return
    this.#update({ sharing: { status: 'saving' } })
    const stillSaving = () => this.#state.sharing?.status === 'saving'
    try {
      const shared = await this.#client().share(session.toSnapshot())
      if (!stillSaving()) return
      const unchanged = this.#state.session === session
      this.#update({ sharing: { status: 'shared', ...shared }, ...(unchanged && { snapshotId: shared.id }) })
    } catch (error) {
      if (stillSaving()) this.#update({ sharing: { status: 'failed', message: messageOf(error) } })
    }
  }

  /** Closes the share dialog. A share still being saved is forgotten. */
  closeShare(): void {
    if (this.#state.sharing !== undefined) this.#update({ sharing: undefined })
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

  /** Undoes the last Move, animating it backward. Does nothing if there is none, or while the Scramble plays. */
  undo(): void {
    const { session, scrambling } = this.#state
    const last = session.history.at(-1)
    if (last === undefined || scrambling) return
    this.#show(inverse(last))
    this.#update({ session: session.undo() })
  }

  /** Makes the last undone Move again. Does nothing if there is none, or while the Scramble plays. */
  redo(): void {
    const { session, scrambling } = this.#state
    const next = session.undone.at(-1)
    if (next === undefined || scrambling) return
    this.#show(next)
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
  // Moves the same way. Moves wait for the Scramble, and for a share link's
  // Snapshot: until then, they are ignored.
  #move(move: Move, durationMs?: number): void {
    if (this.#state.scrambling || this.#state.opening !== undefined) return
    this.#show(move, durationMs)
    this.#update({ session: this.#state.session.move(move) })
  }

  // Queues a Move for the scene to animate, or shows it at once when there is
  // no scene to play the queue.
  #show(move: Move, durationMs?: number): void {
    if (this.#options.animates?.() === false) this.queue.jump(this.queue.target.apply([move]))
    else this.queue.enqueue(move, durationMs)
  }

  // Starts a new Session with a fresh Scramble, played from a solved Cube.
  #startNew(): void {
    const session = Session.start(generateScramble(this.#options.random))
    const changes = { session, hint: undefined, confirming: undefined, opening: undefined }
    if (this.#options.reducedMotion?.()) {
      this.queue.jump(session.cube)
      this.#update({ ...changes, scrambling: false })
      return
    }
    this.queue.jump(Cube.solved())
    for (const move of session.scramble) this.queue.enqueue(move, SCRAMBLE_MS / session.scramble.length)
    this.#update({ ...changes, scrambling: true })
  }

  #client(): SnapshotClient {
    const client = this.#options.snapshots
    if (client === undefined) throw new Error("Sharing isn't available here.")
    return client
  }

  // Every change goes through here. A changed Session is saved before
  // anything else hears of it. It is no longer the Snapshot it was opened
  // from or shared as, unless the change says it is.
  #update(changes: Partial<TutorState>): void {
    const before = this.#state
    this.#state = { ...before, ...changes }
    if (this.#state.session !== before.session) {
      if (!('snapshotId' in changes)) this.#state = { ...this.#state, snapshotId: undefined }
      this.#options.store?.save(this.#state.session)
    }
    for (const listener of this.#listeners) listener()
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'Sharing failed. Try again.'
}
