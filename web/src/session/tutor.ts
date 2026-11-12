// The live tutor: the current Session plus what is on screen around it (the
// selected Sticker, a hint, whether the Scramble is still playing, a question
// for the learner, how Solve is going, sharing) and the MoveQueue the 3D scene
// animates. It starts new Sessions, asks the solver for Solutions, plays them
// back, shares Sessions, opens share links, and saves the Session after every
// change. React reads it through useSyncExternalStore; nothing here renders.
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
import { MoveQueue, moveDuration } from './moveQueue.ts'
import { SCRAMBLE_TURN_MS, generateScramble } from './scramble.ts'
import { Session, type PlaybackSpeed } from './session.ts'
import type { SessionStore } from './sessionStore.ts'
import type { Opening, Sharing, SnapshotClient } from './sharing.ts'
import { snapshotApi } from './snapshotClient.ts'
import { requestSolve, type Solver } from './solveClient.ts'

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
  /**
   * The Snapshot the tutor shows unchanged, whose share link the address bar
   * shows: the one being opened, or else the one the Session is still a copy
   * of (Session.snapshotId), opened or shared. The first change to what the
   * Session would share, such as a Move or an undo, clears it.
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
  /** Where Solve gets Solutions. The Go solver, through POST /api/solve, by default. */
  readonly solve?: Solver
  /** Where Share saves Snapshots and share links load them. The server's Snapshot API by default. */
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
      solveStatus: 'idle',
      snapshotId: session.snapshotId,
      opening: undefined,
      sharing: undefined,
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
   * left, or else a new Session, whose Scramble plays from solved. Given a
   * share link's snapshotId, it opens that Snapshot instead (see
   * openSnapshot), unless the saved Session is still a copy of it: then a
   * reload of the link keeps what the Snapshot can't hold, such as a loaded
   * Solution, where Playback is in it, and the redo stack.
   */
  static open(options: TutorOptions = {}, snapshotId?: string): Tutor {
    const saved = options.store?.load()
    if (snapshotId !== undefined && saved?.snapshotId !== snapshotId) {
      const tutor = new Tutor(Session.start(), options)
      void tutor.openSnapshot(snapshotId)
      return tutor
    }
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
   * Scramble, even ones since undone (redo could bring them back) or played
   * from a Solution, asks the learner to confirm first: see confirmNewScramble.
   */
  newScramble(): void {
    if (this.#state.session.movesMade > 0) this.#update({ confirming: 'new-scramble' })
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
      session = Session.fromSnapshot(snapshot, id)
    } catch {
      if (stillOpening()) this.#update({ opening: 'failed' })
      return
    }
    this.queue.jump(session.cube)
    this.#update({ session, opening: undefined, scrambling: false, hint: undefined })
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
      this.#update({ sharing: { status: 'shared', ...shared }, ...(unchanged && { session: session.sharedAs(shared.id) }) })
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

  /**
   * Undoes the last Move, animating it backward. Does nothing if there is
   * none, or while the Scramble plays. While a Solution is loaded and not
   * stale, it is Step back instead.
   */
  undo(): void {
    const { session, scrambling } = this.#state
    if (session.playable) return this.stepBack()
    const last = session.history.at(-1)
    if (last === undefined || scrambling) return
    this.#change(session.undo(), inverse(last), { solveStatus: this.#settledSolveStatus() })
  }

  /**
   * Makes the last undone Move again. Does nothing if there is none, or while
   * the Scramble plays. While a Solution is loaded and not stale, it is Step
   * forward instead.
   */
  redo(): void {
    const { session, scrambling } = this.#state
    if (session.playable) return this.stepForward()
    const next = session.undone.at(-1)
    if (next === undefined || scrambling) return
    this.#change(session.redo(), next, { solveStatus: this.#settledSolveStatus() })
  }

  /**
   * Closes the loaded Solution: the Moves played from it join the Move
   * history, and the Cube stays as it is, so undo goes back to undoing the
   * learner's own Moves.
   */
  closeSolution(): void {
    this.#settle(this.#state.session.closeSolution())
  }

  /**
   * Asks the solver for a Solution for the Cube as it is, and loads it,
   * paused at its start. Does nothing while the Scramble plays or while an
   * earlier Solve is still waiting. If the Cube changes before the answer
   * arrives, the answer is dropped.
   */
  async solve(): Promise<void> {
    const { session, scrambling, solveStatus, opening } = this.#state
    if (scrambling || solveStatus === 'solving' || opening !== undefined) return
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
    // A stale Solution's Stages have nothing left to show on a solved Cube.
    else if (result.solved) this.#update({ solveStatus: 'already-solved', session: now.stale ? now.closeSolution() : now })
    else this.#update({ solveStatus: 'idle', session: now.loadSolution(result.solution) })
  }

  /**
   * Plays the loaded Solution from the current position, one Move at a time:
   * each Move is queued once the scene has finished showing the one before.
   */
  play(): void {
    this.#startPlayback(this.#state.session.play())
  }

  /**
   * Plays the loaded Solution backward from the current position, toward the
   * Cube as it was before Solve, taking back one Move at a time the way play
   * plays them.
   */
  reverse(): void {
    this.#startPlayback(this.#state.session.reverse())
  }

  /** Pauses Playback if it is playing either way, and otherwise plays it forward: what Space does. */
  playOrPause(): void {
    const { session } = this.#state
    if (session.playing || session.reversing) this.pause()
    else this.play()
  }

  /** Pauses Playback. The Move animating now finishes, and no other is queued. */
  pause(): void {
    this.#settle(this.#state.session.pause())
  }

  /**
   * Step forward: plays the loaded Solution's next Move and pauses Playback.
   * The Move animates after any still animating, at the Playback speed.
   */
  stepForward(): void {
    const { session } = this.#state
    const move = session.nextMove
    if (move === undefined) return
    this.#playback(session.stepForward(), move)
  }

  /**
   * Step back: takes back the last Move played from the loaded Solution,
   * animating it backward, and pauses Playback.
   */
  stepBack(): void {
    const { session } = this.#state
    const last = session.previousMove
    if (last === undefined) return
    this.#playback(session.stepBack(), inverse(last))
  }

  /**
   * Scrubs to a position in the loaded Solution and pauses Playback. The
   * Cube shows it at once, without animating the Moves in between. Throws a
   * RangeError for a position that isn't in the Solution.
   */
  seek(position: number): void {
    this.#jump(this.#state.session.seek(position))
  }

  /** Jumps to the first Move of a Stage, by its index in Stage order, the way seek does. */
  jumpToStage(index: number): void {
    this.#jump(this.#state.session.jumpToStage(index))
  }

  /** Changes how fast the Solution's Moves animate, from the next one queued on. */
  setSpeed(speed: PlaybackSpeed): void {
    this.#settle(this.#state.session.setSpeed(speed))
  }

  /** Turns auto-pause at the end of each Stage on or off. */
  setAutoPause(on: boolean): void {
    this.#settle(this.#state.session.setAutoPause(on))
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
      case 'play-pause':
        this.playOrPause()
        return
    }
  }

  /**
   * Handles a key press. Returns whether the key was one of the tutor's, in
   * which case the caller should stop the browser's default action.
   */
  press(key: KeyPress): boolean {
    const command = this.commandFor(key)
    if (command === undefined) return false
    this.run(command)
    return true
  }

  /**
   * The Command a key asks the tutor for now, if any. Space is the tutor's
   * only while a Solution it can play is loaded, one that isn't stale;
   * otherwise it stays the browser's.
   */
  commandFor(key: KeyPress): Command | undefined {
    const command = commandForKey(key)
    if (command?.kind === 'play-pause' && !this.#state.session.playable) return undefined
    return command
  }

  // Every new Move the learner makes goes through here. Moves wait for the
  // Scramble, and for a share link's Snapshot: until then, they are ignored.
  #move(move: Move, durationMs?: number): void {
    if (this.#state.scrambling || this.#state.opening !== undefined) return
    this.#change(this.#state.session.move(move), move, { solveStatus: this.#settledSolveStatus() }, durationMs)
  }

  // Plays Playback's next Move, if it is playing either way: the next Move
  // forward, or the last Move played taken back.
  #playNext(): void {
    const { session } = this.#state
    const last = session.previousMove
    const move = session.playing ? session.nextMove : session.reversing && last !== undefined ? inverse(last) : undefined
    if (move === undefined) return
    this.#playback(session.playNext(), move)
  }

  // Takes a Session with Playback just started one way or the other, if it
  // changed. Its first Move is queued now if the scene is idle, and
  // otherwise once the scene has shown what it is animating.
  #startPlayback(session: Session): void {
    if (session === this.#state.session) return
    this.#update({ session })
    if (this.queue.isIdle) this.#playNext()
  }

  // Takes a Session that shows the same Cube, such as one with Playback
  // paused or at another speed, if it changed.
  #settle(session: Session): void {
    if (session !== this.#state.session) this.#update({ session })
  }

  // Shows a Session at once, dropping whatever the queue still had to
  // animate: its Cube is where those Moves were going anyway. The Session
  // changes first, so the queue's listeners see it.
  #jump(session: Session): void {
    if (session === this.#state.session) return
    this.#update({ session })
    this.queue.jump(session.cube)
  }

  // Shows one of the Solution's Moves, played forward or taken back, at the
  // Playback speed.
  #playback(session: Session, move: Move): void {
    this.#change(session, move, {}, moveDuration(move, session.speed))
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
    const changes = {
      session,
      hint: undefined,
      confirming: undefined,
      solveStatus: this.#settledSolveStatus(),
      opening: undefined,
    }
    if (this.#options.reducedMotion?.()) {
      this.queue.jump(session.cube)
      this.#update({ ...changes, scrambling: false })
      return
    }
    this.queue.jump(Cube.solved())
    for (const move of session.scramble) this.queue.enqueue(move, SCRAMBLE_TURN_MS)
    this.#update({ ...changes, scrambling: true })
  }

  #client(): SnapshotClient {
    return this.#options.snapshots ?? snapshotApi
  }

  // Every change goes through here. A changed Session is saved before
  // anything else hears of it, and the Snapshot the address bar shows
  // becomes the one the Session is a copy of, if any, unless the change
  // names one (a share link being opened).
  #update(changes: Partial<TutorState>): void {
    const before = this.#state
    this.#state = { ...before, ...changes }
    const { session } = this.#state
    if (session !== before.session) {
      if (!('snapshotId' in changes)) this.#state = { ...this.#state, snapshotId: session.snapshotId }
      this.#options.store?.save(session)
    }
    for (const listener of this.#listeners) listener()
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'Sharing failed. Try again.'
}
