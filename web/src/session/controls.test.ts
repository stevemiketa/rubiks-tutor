// The control table in spec #3: which Layer each arrow turns for a Sticker on
// the front, right or top face.
import { describe, expect, it } from 'vitest'
import { FACES, formatMove, stickerAt, stickerName, type Face, type Sticker } from '../cube/index.ts'
import {
  DIRECTIONS,
  ROTATION_DIRECTIONS,
  isSelectable,
  rotationFor,
  stepSelection,
  turnFor,
  type Direction,
} from './index.ts'

// Each grid lists the Move for every position on a face, row by row as the
// face is laid out in internal/cube/doc.go: the front and right faces seen
// from outside with the top face above; the top face seen from above with the
// back at its top edge, so its last row is the one next to the front.
const TABLE: Record<'F' | 'R' | 'U', Record<Direction, string[]>> = {
  F: {
    right: ["U' U' U'", 'E E E', 'D D D'],
    left: ['U U U', "E' E' E'", "D' D' D'"],
    up: ["L' M' R", "L' M' R", "L' M' R"],
    down: ["L M R'", "L M R'", "L M R'"],
  },
  R: {
    right: ["U' U' U'", 'E E E', 'D D D'],
    left: ['U U U', "E' E' E'", "D' D' D'"],
    up: ["F' S' B", "F' S' B", "F' S' B"],
    down: ["F S B'", "F S B'", "F S B'"],
  },
  U: {
    right: ["B' B' B'", 'S S S', 'F F F'],
    left: ['B B B', "S' S' S'", "F' F' F'"],
    up: ["L' M' R", "L' M' R", "L' M' R"],
    down: ["L M R'", "L M R'", "L M R'"],
  },
}

const cases = Object.entries(TABLE).flatMap(([face, keys]) =>
  Object.entries(keys).flatMap(([direction, rows]) =>
    rows.flatMap((row, r) =>
      row.split(' ').map((move, c) => ({ face: face as Face, row: r, col: c, direction: direction as Direction, move })),
    ),
  ),
)

describe('turnFor', () => {
  it('covers every face, key and position in the table', () => {
    expect(cases).toHaveLength(3 * 4 * 9)
  })

  it.each(cases)('$face row $row col $col, $direction: $move', ({ face, row, col, direction, move }) => {
    expect(formatMove(turnFor(stickerAt(face, row, col), direction))).toBe(move)
  })

  it.each(['D', 'L', 'B'] as const)('rejects a Sticker on the hidden %s face', (face) => {
    expect(() => turnFor(stickerAt(face, 1, 1), 'up')).toThrow(RangeError)
  })
})

describe('isSelectable', () => {
  it('accepts exactly the Stickers on the front, right and top faces', () => {
    const selectable = FACES.filter((face) => [0, 1, 2].every((r) => [0, 1, 2].every((c) => isSelectable(stickerAt(face, r, c)))))
    const hidden = FACES.filter((face) => [0, 1, 2].every((r) => [0, 1, 2].every((c) => !isSelectable(stickerAt(face, r, c)))))
    expect(selectable).toEqual(['U', 'R', 'F'])
    expect(hidden).toEqual(['D', 'L', 'B'])
  })
})

describe('rotationFor', () => {
  // Spec #3: Shift+← is y and Shift+→ y'; Shift+↑ is x and Shift+↓ x'; the
  // on-screen buttons add z and z', which roll the Cube around the axis
  // pointing at the viewer.
  it.each([
    ['left', 'y'],
    ['right', "y'"],
    ['up', 'x'],
    ['down', "x'"],
    ['clockwise', 'z'],
    ['counterclockwise', "z'"],
  ] as const)('rotates %s with %s', (direction, move) => {
    expect(formatMove(rotationFor(direction))).toBe(move)
  })

  it('offers all six Cube rotations', () => {
    expect(ROTATION_DIRECTIONS.map((d) => formatMove(rotationFor(d))).sort()).toEqual(['x', "x'", 'y', "y'", 'z', "z'"])
  })
})

// The three faces the camera sees, laid out flat the way the arrows treat
// them: the top face above the front face, and the right face to its right.
// The top face's last row is the one next to the front. Positions are named
// like "U7": the face, then 0 to 8 row by row (internal/cube/doc.go).
describe('stepSelection', () => {
  it.each(DIRECTIONS)('selects the front face’s center first, whichever way is pressed (%s)', (direction) => {
    expect(stickerName(stepSelection(undefined, direction))).toBe('F4')
  })

  it.each([
    // Within a face.
    ['F4', 'up', 'F1'],
    ['F4', 'down', 'F7'],
    ['F4', 'left', 'F3'],
    ['F4', 'right', 'F5'],
    ['U4', 'up', 'U1'],
    ['R4', 'right', 'R5'],
    // Across the edges the faces share on screen.
    ['F1', 'up', 'U7'],
    ['F0', 'up', 'U6'],
    ['U8', 'down', 'F2'],
    ['F5', 'right', 'R3'],
    ['F8', 'right', 'R6'],
    ['R0', 'left', 'F2'],
    // Stopping at the outside edges.
    ['U1', 'up', 'U1'],
    ['U3', 'left', 'U3'],
    ['U5', 'right', 'U5'],
    ['F3', 'left', 'F3'],
    ['F7', 'down', 'F7'],
    ['R1', 'up', 'R1'],
    ['R5', 'right', 'R5'],
    ['R7', 'down', 'R7'],
  ] as const)('%s, %s: %s', (from, direction, to) => {
    expect(stickerName(stepSelection(named(from), direction))).toBe(to)
  })

  it('never leaves the faces the camera sees', () => {
    const visible = Array.from({ length: 54 }, (_, s) => s).filter(isSelectable)
    for (const s of visible) for (const d of DIRECTIONS) expect(isSelectable(stepSelection(s, d))).toBe(true)
  })
})

function named(name: string): Sticker {
  const position = Number(name[1])
  return stickerAt(name[0] as Face, Math.floor(position / 3), position % 3)
}
