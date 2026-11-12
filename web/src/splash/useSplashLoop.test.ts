import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cube, formatMove } from '../cube/index.ts'
import { MoveQueue, moveDuration, type QueuedMove } from '../session/index.ts'
import { SPLASH_SCRAMBLE, SPLASH_SOLUTION, SPLASH_START } from './recording.ts'
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

// Starts the loop on a queue the scene animates, built on the scrambled Cube
// as the splash page builds it. The test fades the Cube as the page does:
// finishFade reports that the fade the loop last asked for has finished.
function start() {
  const queue = new MoveQueue(SPLASH_START)
  animate(queue)
  const loop = { queue, faded: false, finishFade: () => {}, stop: () => {} }
  loop.stop = playSplashLoop(queue, (faded, then) => {
    loop.faded = faded
    loop.finishFade = then
  })
  return loop
}

// Lets the scene play every queued Move, stopping the moment the last one
// finishes.
function playQueued(queue: MoveQueue): void {
  while (!queue.isIdle) vi.advanceTimersToNextTimer()
}

describe('the splash loop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the scrambled Cube, holds it still for 1.2 s, then plays only the Solution at 0.64× Playback speed', () => {
    const loop = start()
    expect(loop.queue.shown.toString()).toBe(SCRAMBLED)

    vi.advanceTimersByTime(1199)
    expect(loop.queue.isIdle).toBe(true)
    expect(loop.queue.shown.toString()).toBe(SCRAMBLED)

    vi.advanceTimersByTime(1)
    expect(loop.queue.pending.map(({ move, durationMs }) => [formatMove(move), durationMs])).toEqual(
      SPLASH_SOLUTION.map((move) => [formatMove(move), moveDuration(move, 0.64)]),
    )
    expect(loop.faded).toBe(false)
  })

  it('rests 2.5 s on the solved Cube, fades it out, shows the scrambled Cube once it has faded out, and fades it back in', () => {
    const loop = start()
    vi.advanceTimersByTime(1200)
    playQueued(loop.queue)
    expect(loop.queue.shown.isSolved()).toBe(true)

    vi.advanceTimersByTime(2499)
    expect(loop.faded).toBe(false)
    vi.advanceTimersByTime(1)
    expect(loop.faded).toBe(true)

    // However long the fade takes, the Cube stays solved until it's over.
    vi.advanceTimersByTime(10_000)
    expect(loop.queue.shown.isSolved()).toBe(true)
    loop.finishFade()
    // At once, with no Moves to animate.
    expect(loop.queue.isIdle).toBe(true)
    expect(loop.queue.shown.toString()).toBe(SCRAMBLED)
    expect(loop.faded).toBe(false)
  })

  it('once faded back in, holds the scrambled Cube still for 1.2 s again, then plays the Solution again', () => {
    const loop = start()
    vi.advanceTimersByTime(1200)
    playQueued(loop.queue)
    vi.advanceTimersByTime(2500)
    loop.finishFade()

    // However long fading back in takes, the 1.2 s starts once it's over.
    vi.advanceTimersByTime(10_000)
    expect(loop.queue.isIdle).toBe(true)
    loop.finishFade()
    vi.advanceTimersByTime(1199)
    expect(loop.queue.isIdle).toBe(true)
    expect(loop.queue.shown.toString()).toBe(SCRAMBLED)
    vi.advanceTimersByTime(1)
    expect(loop.queue.pending.map(({ move }) => formatMove(move))).toEqual(SPLASH_SOLUTION.map(formatMove))

    playQueued(loop.queue)
    expect(loop.queue.shown.isSolved()).toBe(true)
  })

  it('once stopped, never fades the Cube or plays again', () => {
    const loop = start()
    vi.advanceTimersByTime(1200)
    loop.stop()
    playQueued(loop.queue)

    vi.advanceTimersByTime(60_000)
    expect(loop.faded).toBe(false)
    expect(loop.queue.isIdle).toBe(true)
    expect(loop.queue.shown.isSolved()).toBe(true)
  })

  it('once stopped while the Cube fades out, leaves the Cube as it is when the fade finishes', () => {
    const loop = start()
    vi.advanceTimersByTime(1200)
    playQueued(loop.queue)
    vi.advanceTimersByTime(2500)
    loop.stop()
    loop.finishFade()

    vi.advanceTimersByTime(60_000)
    expect(loop.faded).toBe(true)
    expect(loop.queue.isIdle).toBe(true)
    expect(loop.queue.shown.isSolved()).toBe(true)
  })
})
