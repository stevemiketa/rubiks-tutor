import { useEffect, useState } from 'react'
import { MoveQueue, moveDuration } from '../session/index.ts'
import { SPLASH_SOLUTION, SPLASH_START } from './recording.ts'

/**
 * The speed the Solution plays at, as a multiple of the tutor's normal
 * Playback speed: a little under two thirds, slow enough that each Turn looks
 * smooth rather than flickering.
 */
const SOLUTION_SPEED = 0.64
/** How long the Cube rests, in ms: once scrambled, and once solved. */
const REST_MS = { scrambled: 1200, solved: 2500 }
/** How long the Cube takes to fade out, and again to fade back in, in ms. */
export const FADE_MS = 300

/**
 * Plays the splash recording on queue over and over, until the returned
 * function stops it. Each pass starts on the scrambled Cube, rests, plays the
 * Solution and rests on the solved Cube. Then setFaded fades the Cube out,
 * the scrambled Cube replaces it with no animation while it's invisible, and
 * setFaded fades it back in, so the loop never visibly jumps. The first pass
 * starts shown, with no fade-in of its own.
 */
export function playSplashLoop(queue: MoveQueue, setFaded: (faded: boolean) => void): () => void {
  let solving = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const solve = () => {
    solving = true
    for (const move of SPLASH_SOLUTION) queue.enqueue(move, moveDuration(move, SOLUTION_SPEED))
  }
  const fadeOut = () => {
    setFaded(true)
    timer = setTimeout(fadeIn, FADE_MS)
  }
  const fadeIn = () => {
    queue.jump(SPLASH_START)
    setFaded(false)
    timer = setTimeout(solve, FADE_MS + REST_MS.scrambled)
  }

  const unsubscribe = queue.subscribe(() => {
    if (solving && queue.isIdle) {
      solving = false
      timer = setTimeout(fadeOut, REST_MS.solved)
    }
  })
  queue.jump(SPLASH_START)
  setFaded(false)
  timer = setTimeout(solve, REST_MS.scrambled)

  return () => {
    unsubscribe()
    clearTimeout(timer)
  }
}

/** The splash page's looping Cube: the queue it animates, and whether it is faded out. */
export interface SplashLoop {
  readonly queue: MoveQueue
  readonly faded: boolean
}

/** Plays the splash recording over and over, as playSplashLoop describes. */
export function useSplashLoop(): SplashLoop {
  const [queue] = useState(() => new MoveQueue(SPLASH_START))
  const [faded, setFaded] = useState(false)

  useEffect(() => playSplashLoop(queue, setFaded), [queue])

  return { queue, faded }
}
