// The live tutor: the current Session plus what is on screen around it (the
// selected Sticker, a hint, whether the Scramble is still playing, a question
// for the learner, how Solve is going) and the MoveQueue the 3D scene
// animates. It starts new Sessions, asks the solver for Solutions, plays them
// back, and saves the Session after every change. React reads it through
// useSyncExternalStore; nothing here renders.
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
import { requestSolve, type Solver } from './solveClient.ts'

/** How long a new Session's Scramble takes to play, in ms. */
const SCRAMBLE_MS = 2000

/** A hint the tutor shows: 'select-sticker' asks the learner to select a Sticker first. */
export type Hint = 'select-sticker'

/**
 * Something the tutor asks the learner to confirm, in the page: 'new-scramble'
 * asks before a new Session replaces one with Moves in it.
 */
export type Confirmation = 'new-scramble'

/**
 * How the last Solve went: 'solving' while waiting for the solver,
 * 'already-solved' if there was nothing to solve, 'failed' if the solver
 * couldn't be reached, and 'idle' otherwise, including once a Solution is
 * loaded. 'already-solved' and 'failed' last until the learner's next Move.
 */
export type SolveStatus = 'idle' | 'solving' | 'already-solved' | 'failed'

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
  readonly solveStatus: SolveStatus
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
  /** Where Solve gets Solutions. The Go solver, through POST /api/solve, by default. */
  readonly solve?: Solver
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
      solveStatus: 'idle',
    }
    this.#options = options
    // Once the scene has shown everything queued, the Scramble is over, and
    // Playback asks for its next Move.
    this.queue.subscribe(() => {
      if (!this.queue.isIdle) return
      if (this.#state.scrambling) this.#update({ scrambling: false })
      this.#playNext()
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
   * Scramble, even ones since undone (redo could bring them back), asks the
   * learner to confirm first: see confirmNewScramble.
   */
  newScramble(): void {
    const { session } = this.#state
    if (session.canUndo || session.canRedo) this.#update({ confirming: 'new-scramble' })
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

  /**
   * Undoes the last Move, animating it backward. Does nothing if there is
   * none, or while the Scramble plays. A loaded Solution is closed first, so
   * this takes back the last Move played from it.
   */
  undo(): void {
    const { session, scrambling } = this.#state
    const last = session.closeSolution().history.at(-1)
    if (last === undefined || scrambling) return
    this.#change(session.undo(), inverse(last), { solveStatus: this.#settledSolveStatus() })
  }

  /** Makes the last undone Move again. Does nothing if there is none, or while the Scramble plays. */
  redo(): void {
    const { session, scrambling } = this.#state
    const next = session.undone.at(-1)
    if (!session.canRedo || next === undefined || scrambling) return
    this.#change(session.redo(), next, { solveStatus: this.#settledSolveStatus() })
  }

  /**
   * Asks the solver for a Solution for the Cube as it is, and loads it,
   * paused at its start. Does nothing while the Scramble plays or while an
   * earlier Solve is still waiting. If the Cube changes before the answer
   * arrives, the answer is dropped.
   */
  async solve(): Promise<void> {
    const { session, scrambling, solveStatus } = this.#state
    if (scrambling || solveStatus === 'solving') return
    const asked = session.cube.toString()
    // The Moves played from a loaded Solution are part of how the Cube got here.
    const { scramble, history } = session.closeSolution()
    this.#update({ solveStatus: 'solving', session: session.pause() })

    let result
    try {
      result = await (this.#options.solve ?? requestSolve)(scramble, history)
    } catch {
      this.#update({ solveStatus: 'failed' })
      return
    }
    // Nothing else ends a Solve that is waiting, but the Cube may have changed.
    const now = this.#state.session
    if (now.cube.toString() !== asked) this.#update({ solveStatus: 'idle' })
    else if (result.solved) this.#update({ solveStatus: 'already-solved' })
    else this.#update({ solveStatus: 'idle', session: now.loadSolution(result.solution) })
  }

  /**
   * Plays the loaded Solution from the current position, one Move at a time:
   * each Move is queued once the scene has finished showing the one before.
   */
  play(): void {
    const { session } = this.#state
    const playing = session.play()
    if (playing === session) return
    this.#update({ session: playing })
    if (this.queue.isIdle) this.#playNext()
  }

  /** Pauses Playback. The Move animating now finishes, and no other is queued. */
  pause(): void {
    const { session } = this.#state
    if (session.playing) this.#update({ session: session.pause() })
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

  // Every new Move the learner makes goes through here. Moves wait for the
  // Scramble: until it finishes, they are ignored.
  #move(move: Move, durationMs?: number): void {
    if (this.#state.scrambling) return
    this.#change(this.#state.session.move(move), move, { solveStatus: this.#settledSolveStatus() }, durationMs)
  }

  // Plays the loaded Solution's next Move, if Playback is playing.
  #playNext(): void {
    const { session } = this.#state
    const move = session.nextMove
    if (!session.playing || move === undefined) return
    this.#change(session.stepForward(), move)
  }

  // Every Move the Session makes goes through here, so the Session and what
  // the scene will show once its queue drains always agree. The Session
  // changes first: showing a Move at once notifies the queue's listeners, and
  // they must see the Session it belongs to.
  #change(session: Session, move: Move, changes: Partial<TutorState> = {}, durationMs?: number): void {
    this.#update({ ...changes, session })
    this.#show(move, durationMs)
  }

  // A learner's Move ends an 'already-solved' or 'failed' message. A Solve
  // still waiting goes on waiting, and drops its answer if the Cube changed.
  #settledSolveStatus(): SolveStatus {
    return this.#state.solveStatus === 'solving' ? 'solving' : 'idle'
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
    const changes = { session, hint: undefined, confirming: undefined, solveStatus: this.#settledSolveStatus() }
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
