import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cube, formatMove } from '../cube/index.ts'
import { MoveQueue, moveDuration, type QueuedMove } from '../session/index.ts'
import { SPLASH_SCRAMBLE, SPLASH_SOLUTION } from './recording.ts'
import { playSplashLoop } from './useSplashLoop.ts'

const SCRAMBLED = Cube.solved().apply(SPLASH_SCRAMBLE).toString()

// Animates the queue as the scene does: each Move finishes once its
// animation's time has passed.
function animate(queue: MoveQueue): void {
  let animating: QueuedMove | undefined
  queue.subscribe(() => {
    const item = queue.current
    if (item === undefined || item === animating) return
    animating = item
    setTimeout(() => queue.finish(item), item.durationMs)
  })
}

// Starts the loop on a queue the scene animates, keeping track of whether the
// Cube is faded out.
function start() {
  const queue = new MoveQueue(Cube.solved())
  animate(queue)
  const cube = { queue, faded: false, stop: () => {} }
  cube.stop = playSplashLoop(queue, (faded) => {
    cube.faded = faded
  })
  return cube
}

// Lets the scene play every queued Move, stopping the moment the last one
// finishes.
function playQueued(queue: MoveQueue): void {
  while (!queue.isIdle) vi.advanceTimersToNextTimer()
}

// Fading the Cube out and back in takes about 0.6 s.
const FADE_MS = 300

describe('the splash loop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the scrambled Cube, holds it still for 1.2 s, then plays only the Solution at 0.64× Playback speed', () => {
    const cube = start()
    expect(cube.queue.shown.toString()).toBe(SCRAMBLED)

    vi.advanceTimersByTime(1199)
    expect(cube.queue.isIdle).toBe(true)
    expect(cube.queue.shown.toString()).toBe(SCRAMBLED)

    vi.advanceTimersByTime(1)
    expect(cube.queue.pending.map(({ move, durationMs }) => [formatMove(move), durationMs])).toEqual(
      SPLASH_SOLUTION.map((move) => [formatMove(move), moveDuration(move, 0.64)]),
    )
    expect(cube.faded).toBe(false)
  })

  it('rests 2.5 s on the solved Cube, fades it out, shows the scrambled Cube while it is invisible, and fades it back in', () => {
    const cube = start()
    vi.advanceTimersByTime(1200)
    playQueued(cube.queue)
    expect(cube.queue.shown.isSolved()).toBe(true)

    vi.advanceTimersByTime(2499)
    expect(cube.faded).toBe(false)
    vi.advanceTimersByTime(1)
    expect(cube.faded).toBe(true)

    vi.advanceTimersByTime(FADE_MS - 1)
    expect(cube.queue.shown.isSolved()).toBe(true)
    vi.advanceTimersByTime(1)
    // At once, with no Moves to animate.
    expect(cube.queue.isIdle).toBe(true)
    expect(cube.queue.shown.toString()).toBe(SCRAMBLED)
    expect(cube.faded).toBe(false)
  })

  it('once faded back in, holds the scrambled Cube still for 1.2 s again, then plays the Solution again', () => {
    const cube = start()
    vi.advanceTimersByTime(1200)
    playQueued(cube.queue)
    vi.advanceTimersByTime(2500 + FADE_MS)

    vi.advanceTimersByTime(FADE_MS + 1199)
    expect(cube.queue.isIdle).toBe(true)
    expect(cube.queue.shown.toString()).toBe(SCRAMBLED)
    vi.advanceTimersByTime(1)
    expect(cube.queue.pending.map(({ move }) => formatMove(move))).toEqual(SPLASH_SOLUTION.map(formatMove))

    playQueued(cube.queue)
    expect(cube.queue.shown.isSolved()).toBe(true)
  })

  it('once stopped, never fades the Cube or plays again', () => {
    const cube = start()
    vi.advanceTimersByTime(1200)
    cube.stop()
    playQueued(cube.queue)

    vi.advanceTimersByTime(60_000)
    expect(cube.faded).toBe(false)
    expect(cube.queue.isIdle).toBe(true)
    expect(cube.queue.shown.isSolved()).toBe(true)
  })
})
