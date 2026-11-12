import { describe, expect, it } from 'vitest'
import { Cube, formatMove, parseMove, parseMoves } from '../cube/index.ts'
import { MoveQueue, moveDuration, type QueuedMove } from './index.ts'

const solved = Cube.solved()

// Plays the queue the way the scene does: finish whatever is animating,
// recording each Move, until nothing is left.
function playAll(queue: MoveQueue): string[] {
  const played: string[] = []
  for (let item = queue.current; item !== undefined; item = queue.current) {
    played.push(formatMove(item.move))
    queue.finish(item)
  }
  return played
}

describe('MoveQueue', () => {
  it('starts idle, showing the Cube it was given', () => {
    const queue = new MoveQueue(solved.apply(parseMoves('R')))
    expect(queue.current).toBeUndefined()
    expect(queue.isIdle).toBe(true)
    expect(queue.shown.toString()).toBe('WWGWWGWWG RRRRRRRRR GGYGGYGGY YYBYYBYYB OOOOOOOOO WBBWBBWBB')
  })

  it('shows a Move only once its animation finishes', () => {
    const queue = new MoveQueue(solved)
    queue.enqueue(parseMove('R'))

    expect(queue.current?.move).toEqual(parseMove('R'))
    expect(queue.isIdle).toBe(false)
    expect(queue.shown.isSolved()).toBe(true)

    queue.finish(queue.current as QueuedMove)
    expect(queue.current).toBeUndefined()
    expect(queue.shown.toString()).toBe('WWGWWGWWG RRRRRRRRR GGYGGYGGY YYBYYBYYB OOOOOOOOO WBBWBBWBB')
  })

  it('queues Moves that arrive during an animation and plays every one, in order', () => {
    const queue = new MoveQueue(solved)
    queue.enqueue(parseMove('R'))
    // R is animating when these arrive.
    queue.enqueue(parseMove('U'))
    queue.enqueue(parseMove("R'"))
    queue.enqueue(parseMove("U'"))

    expect(playAll(queue)).toEqual(['R', 'U', "R'", "U'"])
    expect(queue.shown.toString()).toBe(solved.apply(parseMoves("R U R' U'")).toString())
  })

  it('knows the Cube it will show once everything queued has played', () => {
    const queue = new MoveQueue(solved)
    queue.enqueue(parseMove('M'))
    queue.enqueue(parseMove("M'"))
    expect(queue.target.isSolved()).toBe(true)
    queue.enqueue(parseMove('E'))
    expect(queue.target.toString()).toBe(solved.apply(parseMoves("M M' E")).toString())
  })

  it('ignores finishing a Move that is no longer animating', () => {
    const queue = new MoveQueue(solved)
    queue.enqueue(parseMove('R'))
    const r = queue.current as QueuedMove
    queue.finish(r)
    queue.enqueue(parseMove('U'))

    queue.finish(r)

    expect(queue.current?.move).toEqual(parseMove('U'))
    expect(queue.shown.toString()).toBe(solved.apply(parseMoves('R')).toString())
  })

  it('jumps straight to a Cube, dropping what was queued', () => {
    const queue = new MoveQueue(solved)
    queue.enqueue(parseMove('R'))
    queue.enqueue(parseMove('U'))
    const scrambled = solved.apply(parseMoves("F B' L2"))

    queue.jump(scrambled)

    expect(queue.isIdle).toBe(true)
    expect(queue.shown.toString()).toBe(scrambled.toString())
  })

  it('tells subscribers about every change until they unsubscribe', () => {
    const queue = new MoveQueue(solved)
    let calls = 0
    const unsubscribe = queue.subscribe(() => calls++)

    queue.enqueue(parseMove('R'))
    queue.finish(queue.current as QueuedMove)
    queue.jump(solved)
    unsubscribe()
    queue.enqueue(parseMove('U'))

    expect(calls).toBe(3)
  })

  it('gives each queued Move its own duration', () => {
    const queue = new MoveQueue(solved)
    queue.enqueue(parseMove('R'), 80)
    expect(queue.current?.durationMs).toBe(80)
  })
})

describe('moveDuration', () => {
  it('takes 250 ms for a quarter Turn at normal speed', () => {
    expect(moveDuration(parseMove('R'))).toBe(250)
    expect(moveDuration(parseMove("M'"))).toBe(250)
    expect(moveDuration(parseMove('y'))).toBe(250)
  })

  it('takes longer for a half Turn, which is animated as one Move', () => {
    expect(moveDuration(parseMove('U2'))).toBeGreaterThan(250)
    expect(moveDuration(parseMove('U2'))).toBeLessThan(500)
  })

  it('scales with the speed', () => {
    expect(moveDuration(parseMove('R'), 2)).toBe(125)
    expect(moveDuration(parseMove('R'), 0.5)).toBe(500)
  })
})
