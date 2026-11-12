// The control table in spec #3: which Layer each arrow turns for a Sticker on
// the front, right or top face.
import { describe, expect, it } from 'vitest'
import { FACES, formatMove, stickerAt, type Face } from '../cube/index.ts'
import { isSelectable, turnFor, type Direction } from './index.ts'

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
