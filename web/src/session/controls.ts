// The turning controls: which Layer an arrow turns through the selected
// Sticker. The selection is a position on screen, not a Piece, so the mapping
// depends only on where the Sticker is and never on the Cube's colors.
import {
  inverse,
  parseMove,
  stickerCol,
  stickerFace,
  stickerRow,
  type Face,
  type Move,
  type Sticker,
} from '../cube/index.ts'

/** An arrow, as seen on the selected Sticker's face. */
export type Direction = 'left' | 'right' | 'up' | 'down'

export const DIRECTIONS: readonly Direction[] = ['up', 'left', 'right', 'down']

// For each face the fixed camera sees: the Move → makes for each row, and the
// Move ↑ makes for each column, as the face is laid out in
// internal/cube/doc.go. The rows and columns continue around the visible
// faces, so an arrow always moves Stickers the way it points. ← and ↓ make
// the inverse Moves.
const CONTROLS: Partial<Record<Face, { right: readonly Move[]; up: readonly Move[] }>> = {
  F: { right: moves("U'", 'E', 'D'), up: moves("L'", "M'", 'R') },
  R: { right: moves("U'", 'E', 'D'), up: moves("F'", "S'", 'B') },
  // U is laid out with the back at its top edge, so its last row is the one
  // next to the front, and ↑ points away from the viewer.
  U: { right: moves("B'", 'S', 'F'), up: moves("L'", "M'", 'R') },
}

function moves(...tokens: string[]): Move[] {
  return tokens.map(parseMove)
}

/** The parts of a keyboard event the controls read. A KeyboardEvent is one. */
export interface KeyPress {
  readonly key: string
  readonly shiftKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly altKey?: boolean
}

/**
 * Something the learner asks the tutor to do, from a key or a button. Later
 * controls (Cube rotations, undo and redo, clearing the selection) add kinds
 * here and a case to Tutor.run.
 */
export type Command = { readonly kind: 'turn'; readonly direction: Direction }

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * The Command a key asks for, if any. Keys held with Ctrl, Cmd or Alt are
 * left to the browser, which uses them for its own shortcuts.
 */
export function commandForKey(press: KeyPress): Command | undefined {
  if (press.ctrlKey || press.metaKey || press.altKey) return undefined
  const direction = ARROWS[press.key]
  if (direction === undefined || press.shiftKey) return undefined
  return { kind: 'turn', direction }
}

/** Whether a Sticker can be selected: it is on the front, right or top face. */
export function isSelectable(sticker: Sticker): boolean {
  return CONTROLS[stickerFace(sticker)] !== undefined
}

/**
 * The Turn an arrow makes for the selected Sticker, following the control
 * table in spec #3. Throws a RangeError for a Sticker that isn't selectable.
 */
export function turnFor(sticker: Sticker, direction: Direction): Move {
  const face = stickerFace(sticker)
  const controls = CONTROLS[face]
  if (controls === undefined) throw new RangeError(`Stickers on face ${face} can't be selected`)
  const horizontal = direction === 'left' || direction === 'right'
  const move = horizontal ? controls.right[stickerRow(sticker)] : controls.up[stickerCol(sticker)]
  if (move === undefined) throw new RangeError(`no Sticker ${sticker}`)
  return direction === 'right' || direction === 'up' ? move : inverse(move)
}
