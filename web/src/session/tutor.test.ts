import { describe, expect, it } from 'vitest'
import { formatMoves, stickerAt } from '../cube/index.ts'
import { Tutor, type KeyPress } from './index.ts'

const frontCenter = stickerAt('F', 1, 1)
const frontRightMiddle = stickerAt('F', 1, 2)

const arrow = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({ key, ...modifiers })

const history = (tutor: Tutor): string => formatMoves(tutor.getState().session.history)
const queued = (tutor: Tutor): string => formatMoves(tutor.queue.pending.map((q) => q.move))

describe('Tutor', () => {
  it('starts with a solved Cube, nothing selected and no hint', () => {
    const tutor = new Tutor()
    const state = tutor.getState()
    expect(state.session.isSolved()).toBe(true)
    expect(state.selected).toBeUndefined()
    expect(state.hint).toBeUndefined()
    expect(tutor.queue.shown.isSolved()).toBe(true)
  })

  it('turns the Layer through the selected Sticker when an arrow is pressed', () => {
    const tutor = new Tutor()
    tutor.select(frontCenter)

    expect(tutor.press(arrow('ArrowUp'))).toBe(true)

    expect(history(tutor)).toBe("M'")
    expect(tutor.getState().session.isSolved()).toBe(false)
  })

  it('maps each arrow key to its direction', () => {
    const tutor = new Tutor()
    tutor.select(frontRightMiddle)
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft']) tutor.press(arrow(key))
    expect(history(tutor)).toBe("R R' E E'")
  })

  it('turns from the on-screen buttons the same way as from the arrow keys', () => {
    const tutor = new Tutor()
    tutor.select(stickerAt('U', 2, 0))
    tutor.turn('right')
    tutor.turn('up')
    expect(history(tutor)).toBe("F L'")
  })

  it('keeps the selection on the same spot after a Turn', () => {
    const tutor = new Tutor()
    tutor.select(frontRightMiddle)
    tutor.press(arrow('ArrowUp'))
    tutor.press(arrow('ArrowUp'))

    expect(tutor.getState().selected).toBe(frontRightMiddle)
    expect(history(tutor)).toBe('R R')
  })

  it('asks for a Sticker when an arrow is pressed with nothing selected', () => {
    const tutor = new Tutor()

    expect(tutor.press(arrow('ArrowRight'))).toBe(true)

    expect(tutor.getState().hint).toBe('select-sticker')
    expect(tutor.getState().session.history).toEqual([])
    expect(tutor.queue.isIdle).toBe(true)
  })

  it('clears the hint once a Sticker is selected', () => {
    const tutor = new Tutor()
    tutor.press(arrow('ArrowRight'))
    tutor.select(frontCenter)
    expect(tutor.getState().hint).toBeUndefined()
  })

  it('ignores a Sticker on a face the camera can’t see', () => {
    const tutor = new Tutor()
    tutor.select(frontCenter)
    tutor.select(stickerAt('D', 1, 1))
    expect(tutor.getState().selected).toBe(frontCenter)
  })

  it('queues every Turn for the scene to animate, in order, even while one is animating', () => {
    const tutor = new Tutor()
    tutor.select(frontCenter)
    tutor.press(arrow('ArrowUp'))
    tutor.press(arrow('ArrowRight'))
    tutor.press(arrow('ArrowDown'))

    expect(queued(tutor)).toBe("M' E M")
    expect(tutor.queue.target.toString()).toBe(tutor.getState().session.cube.toString())
  })

  it('is solved again after a Turn and its inverse', () => {
    const tutor = new Tutor()
    tutor.select(stickerAt('R', 0, 2))
    tutor.press(arrow('ArrowUp'))
    tutor.press(arrow('ArrowDown'))
    expect(history(tutor)).toBe("B B'")
    expect(tutor.getState().session.isSolved()).toBe(true)
  })

  it('leaves other keys, and arrows with Ctrl, Cmd or Alt, to the browser', () => {
    const tutor = new Tutor()
    tutor.select(frontCenter)
    const unhandled = [
      arrow('a'),
      arrow('Enter'),
      arrow('ArrowUp', { ctrlKey: true }),
      arrow('ArrowUp', { metaKey: true }),
      arrow('ArrowLeft', { altKey: true }),
    ]
    expect(unhandled.map((key) => tutor.press(key))).toEqual([false, false, false, false, false])
    expect(tutor.getState().session.history).toEqual([])
  })

  it('gives subscribers a new state after each change', () => {
    const tutor = new Tutor()
    const seen: unknown[] = []
    const unsubscribe = tutor.subscribe(() => seen.push(tutor.getState()))
    const before = tutor.getState()

    tutor.select(frontCenter)
    tutor.turn('up')
    unsubscribe()
    tutor.turn('up')

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(before)
    expect(tutor.getState()).toBe(tutor.getState())
  })
})
