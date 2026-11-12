// The tutor's controls: which Layer an arrow turns through the selected
// Sticker, which Cube rotation each rotation control makes, and how keys move
// the selection. The selection is a position on screen, not a Piece, so the
// mapping depends only on where the Sticker is and never on the Cube's
// colors, and it still holds after a Cube rotation.
import {
  inverse,
  parseMove,
  stickerAt,
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

/**
 * Which way a Cube rotation turns the whole Cube, as the viewer sees its
 * front face move: left, right, up or down, or rolled clockwise or
 * counterclockwise around the axis pointing at the viewer.
 */
export type RotationDirection = Direction | 'clockwise' | 'counterclockwise'

export const ROTATION_DIRECTIONS: readonly RotationDirection[] = [
  'left',
  'right',
  'up',
  'down',
  'clockwise',
  'counterclockwise',
]

// y turns as U does, so the front goes left; x turns as R does, so the front
// goes up; z turns as F does.
const ROTATIONS: Readonly<Record<RotationDirection, Move>> = {
  left: parseMove('y'),
  right: parseMove("y'"),
  up: parseMove('x'),
  down: parseMove("x'"),
  clockwise: parseMove('z'),
  counterclockwise: parseMove("z'"),
}

/** The Cube rotation that turns the whole Cube one way. Shift + an arrow makes the first four. */
export function rotationFor(direction: RotationDirection): Move {
  return ROTATIONS[direction]
}

/** The parts of a keyboard event the controls read. A KeyboardEvent is one. */
export interface KeyPress {
  readonly key: string
  readonly shiftKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly altKey?: boolean
}

/** Something the learner asks the tutor to do, from a key or a button. Tutor.run does it. */
export type Command =
  | { readonly kind: 'turn'; readonly direction: Direction }
  | { readonly kind: 'rotate'; readonly direction: RotationDirection }
  | { readonly kind: 'step-selection'; readonly direction: Direction }
  | { readonly kind: 'clear-selection' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'play-pause' }

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

// The keys that move the selection, for choosing a Sticker without a mouse.
// The arrows are taken by Turns, so these sit where the left hand rests.
const SELECTION_KEYS: Readonly<Record<string, Direction>> = { w: 'up', a: 'left', s: 'down', d: 'right' }

/**
 * The Command a key asks for, if any:
 * - an arrow turns a Layer through the selected Sticker, and Shift + an
 *   arrow rotates the whole Cube
 * - W, A, S and D move the selection, and Esc clears it
 * - Ctrl/Cmd+Z undoes and Shift+Ctrl/Cmd+Z redoes
 * - Space plays or pauses Playback
 *
 * Other keys held with Ctrl, Cmd or Alt are left to the browser, which uses
 * them for its own shortcuts.
 */
export function commandForKey(press: KeyPress): Command | undefined {
  if (press.altKey) return undefined
  // Letters arrive in upper case with Shift or Caps Lock.
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key
  if (press.ctrlKey || press.metaKey) {
    if (key !== 'z') return undefined
    return { kind: press.shiftKey ? 'redo' : 'undo' }
  }
  const arrow = ARROWS[key]
  if (arrow !== undefined) {
    return press.shiftKey ? { kind: 'rotate', direction: arrow } : { kind: 'turn', direction: arrow }
  }
  if (key === 'Escape') return { kind: 'clear-selection' }
  if (key === ' ' && !press.shiftKey) return { kind: 'play-pause' }
  const step = SELECTION_KEYS[key]
  if (step !== undefined && !press.shiftKey) return { kind: 'step-selection', direction: step }
  return undefined
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

// The visible faces laid out flat, the way the arrows treat them: the top
// face above the front face and the right face to its right, so rows run on
// from the front to the right face and columns from the front to the top.
// Where each face's top-left Sticker sits in that layout.
const LAYOUT: Partial<Record<Face, { readonly col: number; readonly row: number }>> = {
  U: { col: 0, row: 0 },
  F: { col: 0, row: 3 },
  R: { col: 3, row: 3 },
}

const STEPS: Readonly<Record<Direction, readonly [col: number, row: number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/**
 * The Sticker next to the selected one in a direction, for choosing a
 * Sticker from the keyboard. The selection crosses between faces where they
 * meet (top and front, front and right) and stays put at the outside edges.
 * With nothing selected it starts at the front face's center. Throws a
 * RangeError for a Sticker that isn't selectable.
 */
export function stepSelection(selected: Sticker | undefined, direction: Direction): Sticker {
  if (selected === undefined) return stickerAt('F', 1, 1)
  const from = LAYOUT[stickerFace(selected)]
  if (from === undefined) throw new RangeError(`Stickers on face ${stickerFace(selected)} can't be selected`)
  const [dc, dr] = STEPS[direction]
  const col = from.col + stickerCol(selected) + dc
  const row = from.row + stickerRow(selected) + dr
  for (const [face, corner] of Object.entries(LAYOUT)) {
    const c = col - corner.col
    const r = row - corner.row
    if (c >= 0 && c < 3 && r >= 0 && r < 3) return stickerAt(face as Face, r, c)
  }
  return selected
}
