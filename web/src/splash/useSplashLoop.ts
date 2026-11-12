import { useEffect, useRef, useState } from 'react'
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

/**
 * Plays the splash recording on queue, which starts on SPLASH_START, over and
 * over until the returned function stops it. Each pass holds the scrambled
 * Cube still, plays the Solution and rests on the solved Cube. Then fade fades
 * the Cube out, the scrambled Cube replaces it with no animation once it's
 * invisible, and fade fades it back in, so the loop never visibly jumps. fade
 * calls then once the Cube has finished fading, and the loop waits for that
 * rather than timing the fade itself. The first pass starts shown, with no
 * fade-in of its own.
 */
export function playSplashLoop(queue: MoveQueue, fade: (faded: boolean, then: () => void) => void): () => void {
  let stopped = false
  let solving = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const solve = () => {
    solving = true
    for (const move of SPLASH_SOLUTION) queue.enqueue(move, moveDuration(move, SOLUTION_SPEED))
  }
  // Every pass starts here, with the scrambled Cube shown.
  const startPass = () => {
    if (stopped) return
    timer = setTimeout(solve, REST_MS.scrambled)
  }
  const fadeOut = () => fade(true, fadeIn)
  const fadeIn = () => {
    if (stopped) return
    queue.jump(SPLASH_START)
    fade(false, startPass)
  }

  const unsubscribe = queue.subscribe(() => {
    if (solving && queue.isIdle) {
      solving = false
      timer = setTimeout(fadeOut, REST_MS.solved)
    }
  })
  startPass()

  return () => {
    stopped = true
    unsubscribe()
    clearTimeout(timer)
  }
}

/**
 * Plays the splash recording over and over, as playSplashLoop describes: the
 * queue to animate, whether the Cube is faded out, and fadeFinished, to call
 * once the Cube has finished fading.
 */
export function useSplashLoop(): { queue: MoveQueue; faded: boolean; fadeFinished: () => void } {
  const [queue] = useState(() => new MoveQueue(SPLASH_START))
  const [faded, setFaded] = useState(false)
  // What the loop does once the Cube has finished the fade it asked for.
  const afterFade = useRef<() => void>(undefined)

  useEffect(
    () =>
      playSplashLoop(queue, (faded, then) => {
        afterFade.current = then
        setFaded(faded)
      }),
    [queue],
  )

  const fadeFinished = () => {
    const then = afterFade.current
    afterFade.current = undefined
    then?.()
  }

  return { queue, faded, fadeFinished }
}
