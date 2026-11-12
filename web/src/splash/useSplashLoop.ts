import { useEffect, useState } from 'react'
import { Cube } from '../cube/index.ts'
import { MoveQueue, moveDuration } from '../session/index.ts'
import { SPLASH_SCRAMBLE, SPLASH_SOLVE } from './recording.ts'

/** Each Scramble Turn's length: about two seconds for the 25, as in the tutor. */
const SCRAMBLE_TURN_MS = 2000 / 25
/** How much faster than the tutor's normal speed the solve plays. */
const SOLVE_SPEED = 1.6
/** How long the Cube rests, in ms: before the first Scramble, once scrambled, and once solved. */
const REST_MS = { start: 800, scrambled: 1200, solved: 2500 }

/**
 * A queue that plays the splash recording over and over: scramble, rest,
 * solve, rest. The recording ends on the Cube it starts from, so each pass
 * picks up where the last one stopped.
 */
export function useSplashLoop(): MoveQueue {
  const [queue] = useState(() => new MoveQueue(Cube.solved()))

  useEffect(() => {
    let next: 'scramble' | 'solve' = 'scramble'
    let timer: ReturnType<typeof setTimeout> | undefined

    const play = () => {
      timer = undefined
      if (next === 'scramble') for (const move of SPLASH_SCRAMBLE) queue.enqueue(move, SCRAMBLE_TURN_MS)
      else for (const move of SPLASH_SOLVE) queue.enqueue(move, moveDuration(move, SOLVE_SPEED))
      next = next === 'scramble' ? 'solve' : 'scramble'
    }

    const unsubscribe = queue.subscribe(() => {
      if (queue.isIdle && timer === undefined) {
        timer = setTimeout(play, next === 'solve' ? REST_MS.scrambled : REST_MS.solved)
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
