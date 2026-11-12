// The Moves waiting to be animated. Whatever produces Moves (the learner's
// Turns, a Scramble, Playback, the splash page's loop) enqueues them here,
// and the 3D scene animates them one at a time, so input that arrives during
// an animation waits its turn instead of being dropped or jumping ahead.
import type { Cube, Move } from '../cube/index.ts'

/** How long a quarter Turn or Cube rotation takes at normal speed, in ms. */
export const QUARTER_TURN_MS = 250

/**
 * How long a Move's animation takes at a speed (1 is normal, 2 twice as
 * fast). A half Turn is one 180° animation, a little longer than a quarter.
 */
export function moveDuration(move: Move, speed = 1): number {
  return (move.amount === 2 ? QUARTER_TURN_MS * 1.5 : QUARTER_TURN_MS) / speed
}

/** A Move waiting to be animated, and how long its animation takes. */
export interface QueuedMove {
  readonly move: Move
  readonly durationMs: number
}

/**
 * A queue of Moves for the scene to animate, and the Cube the scene shows
 * between animations. The scene animates current from shown, then calls
 * finish, which applies that Move to shown and makes the next Move current.
 */
export class MoveQueue {
  #shown: Cube
  #pending: QueuedMove[] = []
  readonly #listeners = new Set<() => void>()

  constructor(cube: Cube) {
    this.#shown = cube
  }

  /** The Cube with every finished Move applied: what the scene shows at rest. */
  get shown(): Cube {
    return this.#shown
  }

  /** The Move to animate now, if any. */
  get current(): QueuedMove | undefined {
    return this.#pending[0]
  }

  /** Every Move not yet finished, the current one first. */
  get pending(): readonly QueuedMove[] {
    return this.#pending
  }

  /** Whether nothing is animating or waiting. */
  get isIdle(): boolean {
    return this.#pending.length === 0
  }

  /** The Cube the scene will show once every queued Move has finished. */
  get target(): Cube {
    return this.#shown.apply(this.#pending.map((q) => q.move))
  }

  /** Queues a Move to animate after everything already queued. */
  enqueue(move: Move, durationMs: number = moveDuration(move)): void {
    this.#pending.push({ move, durationMs })
    this.#notify()
  }

  /**
   * Marks a Move's animation finished. Does nothing unless it is the current
   * Move, so a scene that finishes a Move dropped by jump can't corrupt what
   * is shown.
   */
  finish(item: QueuedMove): void {
    if (item !== this.#pending[0]) return
    this.#pending.shift()
    this.#shown = this.#shown.apply([item.move])
    this.#notify()
  }

  /**
   * Shows a Cube at once, dropping every queued Move: for reduced motion, or
   * for a Cube that didn't come from Moves, such as a restored Session.
   */
  jump(cube: Cube): void {
    this.#pending = []
    this.#shown = cube
    this.#notify()
  }

  /** Calls listener after every change. Returns a function that unsubscribes. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener()
  }
}
