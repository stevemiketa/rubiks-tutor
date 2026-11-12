import { describe, expect, it } from 'vitest'
import { formatMoves, parseMoves, stickerAt, stickerName, type Face } from '../cube/index.ts'
import { Session, Tutor, type KeyPress } from './index.ts'

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
      arrow('q'),
      arrow('Enter'),
      arrow('ArrowUp', { ctrlKey: true }),
      arrow('ArrowUp', { metaKey: true }),
      arrow('ArrowLeft', { altKey: true }),
      arrow('ArrowLeft', { altKey: true, shiftKey: true }),
      arrow('c', { ctrlKey: true }),
      arrow('z', { altKey: true, ctrlKey: true }),
      arrow('w', { ctrlKey: true }),
      arrow('W', { shiftKey: true }),
    ]
    expect(unhandled.map((key) => tutor.press(key))).toEqual(unhandled.map(() => false))
    expect(tutor.getState().session.history).toEqual([])
    expect(tutor.getState().selected).toBe(frontCenter)
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

describe('Tutor Cube rotations', () => {
  it('rotates the whole Cube with Shift + an arrow', () => {
    const tutor = new Tutor()
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      expect(tutor.press(arrow(key, { shiftKey: true }))).toBe(true)
    }
    expect(history(tutor)).toBe("y y' x x'")
  })

  it('rotates from the on-screen buttons, including rolling the Cube with z', () => {
    const tutor = new Tutor()
    tutor.rotate('clockwise')
    tutor.rotate('counterclockwise')
    tutor.rotate('left')
    expect(history(tutor)).toBe("z z' y")
  })

  it('rotates with nothing selected, and keeps the selection where it was', () => {
    const tutor = new Tutor()
    tutor.press(arrow('ArrowLeft', { shiftKey: true }))
    expect(tutor.getState().hint).toBeUndefined()

    tutor.select(frontRightMiddle)
    tutor.press(arrow('ArrowUp', { shiftKey: true }))
    expect(tutor.getState().selected).toBe(frontRightMiddle)
  })

  it('animates a Cube rotation like a Turn', () => {
    const tutor = new Tutor()
    tutor.rotate('left')
    expect(queued(tutor)).toBe('y')
    expect(tutor.queue.pending[0]?.durationMs).toBeGreaterThan(0)
    expect(tutor.queue.target.toString()).toBe(tutor.getState().session.cube.toString())
  })

  it('turns the Layers as the Cube is now seen: after y, ↑ on the front’s right column is still R', () => {
    const tutor = new Tutor()
    tutor.select(frontRightMiddle)
    tutor.press(arrow('ArrowLeft', { shiftKey: true }))
    tutor.press(arrow('ArrowUp'))

    expect(history(tutor)).toBe('y R')
    // y brings red to the front and blue to the right. R then turns the blue
    // side, which stays blue, and lifts the front's red right column on top.
    const cube = tutor.getState().session.cube
    const colors = (face: Face, positions: number[]) =>
      positions.map((p) => cube.at(stickerAt(face, Math.floor(p / 3), p % 3)))
    expect(colors('R', [0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual(Array(9).fill('blue'))
    expect(colors('U', [2, 5, 8])).toEqual(['red', 'red', 'red'])
    expect(colors('U', [0, 1, 3, 4, 6, 7])).toEqual(Array(6).fill('white'))
  })

  it('records the Cube rotations a drag already showed, without animating them again', () => {
    const tutor = new Tutor()
    tutor.recordDrag(parseMoves("y x'"))
    expect(history(tutor)).toBe("y x'")
    expect(tutor.queue.pending.map((q) => q.durationMs)).toEqual([0, 0])
    expect(tutor.queue.target.toString()).toBe(tutor.getState().session.cube.toString())
  })

  it('records nothing for a drag that ends where it started', () => {
    const tutor = new Tutor()
    const before = tutor.getState()
    tutor.recordDrag([])
    expect(tutor.getState()).toBe(before)
    expect(tutor.queue.isIdle).toBe(true)
  })

  it('refuses a Turn as a drag’s rotation', () => {
    expect(() => new Tutor().recordDrag(parseMoves('R'))).toThrow(RangeError)
  })
})

describe('Tutor undo and redo', () => {
  const ctrl = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({ key, ctrlKey: true, ...modifiers })

  /** A Tutor after pressing arrow keys with the front face's center selected. */
  function turned(...keys: string[]): Tutor {
    const tutor = new Tutor()
    tutor.select(frontCenter)
    for (const key of keys) tutor.press(arrow(key))
    return tutor
  }

  it('undoes the last Move with Ctrl+Z or Cmd+Z, animating it backward', () => {
    const tutor = turned('ArrowUp', 'ArrowRight')
    expect(history(tutor)).toBe("M' E")

    expect(tutor.press(ctrl('z'))).toBe(true)
    expect(history(tutor)).toBe("M'")
    expect(queued(tutor)).toBe("M' E E'")
    expect(tutor.queue.pending.at(-1)?.durationMs).toBeGreaterThan(0)

    expect(tutor.press({ key: 'z', metaKey: true })).toBe(true)
    expect(history(tutor)).toBe('')
    expect(tutor.queue.target.isSolved()).toBe(true)
    expect(tutor.getState().session.isSolved()).toBe(true)
  })

  it('redoes with Shift+Ctrl+Z or Shift+Cmd+Z', () => {
    const tutor = turned('ArrowUp', 'ArrowRight')
    tutor.undo()
    tutor.undo()

    expect(tutor.press(ctrl('Z', { shiftKey: true }))).toBe(true)
    expect(tutor.press({ key: 'Z', shiftKey: true, metaKey: true })).toBe(true)

    expect(history(tutor)).toBe("M' E")
    expect(queued(tutor)).toBe("M' E E' M M' E")
    expect(tutor.queue.target.toString()).toBe(tutor.getState().session.cube.toString())
  })

  it('undoes and redoes from the on-screen buttons the same way as from the keys', () => {
    const tutor = turned('ArrowUp')
    tutor.undo()
    expect(history(tutor)).toBe('')
    tutor.redo()
    expect(history(tutor)).toBe("M'")
  })

  it('undoes a Cube rotation from a drag with an animation', () => {
    const tutor = new Tutor()
    tutor.recordDrag(parseMoves('y'))
    tutor.undo()
    expect(queued(tutor)).toBe("y y'")
    expect(tutor.queue.pending[1]?.durationMs).toBeGreaterThan(0)
  })

  it('clears the redo stack when a new Move is made', () => {
    const tutor = turned('ArrowUp', 'ArrowRight')
    tutor.undo()
    tutor.press(arrow('ArrowDown'))
    const before = queued(tutor)

    tutor.redo()

    expect(history(tutor)).toBe("M' M")
    expect(queued(tutor)).toBe(before)
    expect(tutor.getState().session.canRedo).toBe(false)
  })

  it('does nothing when there is nothing to undo or redo', () => {
    const tutor = new Tutor()
    const before = tutor.getState()
    tutor.undo()
    tutor.redo()
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.getState()).toBe(before)
  })
})

describe('Tutor when nothing can animate', () => {
  // Without WebGL there is no scene to play the queue, so every Move shows at once.
  it('shows Turns, Cube rotations, undo and redo at once instead of queueing them', () => {
    const tutor = new Tutor(Session.start(), { animates: () => false })
    tutor.select(frontCenter)
    tutor.press(arrow('ArrowUp'))
    tutor.rotate('left')
    tutor.recordDrag(parseMoves('x'))
    tutor.undo()
    tutor.undo()
    tutor.redo()

    expect(history(tutor)).toBe("M' y")
    expect(tutor.queue.isIdle).toBe(true)
    expect(tutor.queue.shown.toString()).toBe(tutor.getState().session.cube.toString())
  })
})

describe('Tutor keyboard selection', () => {
  it('clears the selection with Esc', () => {
    const tutor = new Tutor()
    tutor.select(frontCenter)
    expect(tutor.press(arrow('Escape'))).toBe(true)
    expect(tutor.getState().selected).toBeUndefined()
  })

  it('selects the front face’s center with the first of W, A, S or D, and clears the hint', () => {
    const tutor = new Tutor()
    tutor.press(arrow('ArrowUp'))
    expect(tutor.getState().hint).toBe('select-sticker')

    expect(tutor.press(arrow('w'))).toBe(true)

    expect(tutor.getState().selected).toBe(frontCenter)
    expect(tutor.getState().hint).toBeUndefined()
  })

  it('moves the selection with W, A, S and D, so every Layer can be turned without a mouse', () => {
    const tutor = new Tutor()
    const selected = () => stickerName(tutor.getState().selected ?? -1)
    // The front center, then right onto the right face's left column.
    for (const key of ['d', 'd', 'd']) tutor.press(arrow(key))
    expect(selected()).toBe('R3')
    tutor.press(arrow('ArrowUp'))

    // Back to the front face, then up onto the top face's front row.
    for (const key of ['a', 'w', 'w']) tutor.press(arrow(key))
    expect(selected()).toBe('U8')
    tutor.press(arrow('ArrowRight'))

    tutor.press(arrow('s'))
    expect(selected()).toBe('F2')
    expect(history(tutor)).toBe("F' F")
  })

  it('accepts W, A, S and D in upper case, as Caps Lock sends them', () => {
    const tutor = new Tutor()
    tutor.press(arrow('D'))
    tutor.press(arrow('D'))
    expect(tutor.getState().selected).toBe(frontRightMiddle)
  })
})
