import { useEffect, useState } from 'react'
import { Cube } from '../cube/index.ts'
import { MoveQueue, SCRAMBLE_TURN_MS, moveDuration } from '../session/index.ts'
import { SPLASH_SCRAMBLE, SPLASH_SOLUTION } from './recording.ts'

/**
 * The speed the Solution plays at, as a multiple of the tutor's normal
 * Playback speed: a little over half, slow enough that each Turn looks smooth
 * rather than flickering.
 */
const SOLUTION_SPEED = 1.6 / 3
/** How long the Cube rests, in ms: before the first Scramble, once scrambled, and once solved. */
const REST_MS = { start: 800, scrambled: 1200, solved: 2500 }

/**
 * A queue that plays the splash recording over and over: scramble, rest,
 * play the Solution, rest. The recording ends on the Cube it starts from, so
 * each pass picks up where the last one stopped.
 */
export function useSplashLoop(): MoveQueue {
  const [queue] = useState(() => new MoveQueue(Cube.solved()))

  useEffect(() => {
    let next: 'scramble' | 'solution' = 'scramble'
    let timer: ReturnType<typeof setTimeout> | undefined

    const play = () => {
      timer = undefined
      if (next === 'scramble') for (const move of SPLASH_SCRAMBLE) queue.enqueue(move, SCRAMBLE_TURN_MS)
      else for (const move of SPLASH_SOLUTION) queue.enqueue(move, moveDuration(move, SOLUTION_SPEED))
      next = next === 'scramble' ? 'solution' : 'scramble'
    }

    const unsubscribe = queue.subscribe(() => {
      if (queue.isIdle && timer === undefined) {
        timer = setTimeout(play, next === 'solution' ? REST_MS.scrambled : REST_MS.solved)
      }
    })
    timer = setTimeout(play, REST_MS.start)

    return () => {
      unsubscribe()
      clearTimeout(timer)
      queue.jump(Cube.solved())
    }
  }, [queue])

  return queue
}
