// Faces, Stickers and where they sit in space; how each Move permutes the
// Stickers. Matches internal/cube/cube.go and geometry.go.
import {
  LETTERS,
  formatMove,
  inverse,
  isRotation,
  type Amount,
  type Letter,
  type Move,
} from './notation.ts'

/** A Sticker color. */
export type Color = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange'

/** The six colors, in the order Piece names list them. */
export const COLORS: readonly Color[] = ['white', 'yellow', 'green', 'blue', 'red', 'orange']

/** Each color's letter in a printed state, in COLORS order. */
export const COLOR_LETTERS = 'WYGBRO'

/** A side of the Cube by position, not color: U is whichever face is on top. */
export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

/** The six faces, in Sticker index order. */
export const FACES: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B']

/** The color of each face of a solved Cube in the standard orientation. */
export const SOLVED_COLORS: Readonly<Record<Face, Color>> = {
  U: 'white',
  R: 'red',
  F: 'green',
  D: 'yellow',
  L: 'orange',
  B: 'blue',
}

/** One of the 54 Stickers, 0 to 53: face * 9 + row * 3 + col. */
export type Sticker = number

/** The Sticker at a row and column (each 0 to 2) of a face. */
export function stickerAt(face: Face, row: number, col: number): Sticker {
  return FACES.indexOf(face) * 9 + row * 3 + col
}

/** The face a Sticker is on. */
export function stickerFace(sticker: Sticker): Face {
  const face = FACES[Math.floor(sticker / 9)]
  if (face === undefined) throw new RangeError(`no Sticker ${sticker}`)
  return face
}

/** A Sticker's row on its face, 0 to 2. */
export function stickerRow(sticker: Sticker): number {
  return Math.floor((sticker % 9) / 3)
}

/** A Sticker's column on its face, 0 to 2. */
export function stickerCol(sticker: Sticker): number {
  return sticker % 3
}

/** Names a Sticker by face and position on it, such as "U7". */
export function stickerName(sticker: Sticker): string {
  return `${stickerFace(sticker)}${sticker % 9}`
}

/** A point or direction: x toward R, y toward U, z toward F. */
export type Vec = readonly [number, number, number]

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

// Rotates v a quarter turn clockwise as seen looking at the origin from the
// tip of the unit axis a: v' = a(a·v) - a×v.
const clockwise = (a: Vec, v: Vec): Vec => add(scale(a, dot(a, v)), scale(cross(a, v), -1))

// Each face's outward normal, and the directions of increasing column and
// row in the net in internal/cube/doc.go.
const FRAMES: Readonly<Record<Face, { normal: Vec; right: Vec; down: Vec }>> = {
  U: { normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  R: { normal: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] },
  F: { normal: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] },
  D: { normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] },
  L: { normal: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] },
  B: { normal: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] },
}

/** A face's outward normal. */
export function faceNormal(face: Face): Vec {
  return FRAMES[face].normal
}

// Where a Sticker sits: the position of its Piece and the direction it faces.
interface Place {
  readonly piece: Vec
  readonly normal: Vec
}

const placeKey = (p: Place): string => `${p.piece.join(',')}|${p.normal.join(',')}`

function placeOf(sticker: Sticker): Place {
  const frame = FRAMES[stickerFace(sticker)]
  const piece = add(
    add(frame.normal, scale(frame.right, stickerCol(sticker) - 1)),
    scale(frame.down, stickerRow(sticker) - 1),
  )
  return { piece, normal: frame.normal }
}

const STICKERS: readonly Sticker[] = Array.from({ length: 54 }, (_, i) => i)

const stickerByPlace = new Map(STICKERS.map((s) => [placeKey(placeOf(s)), s]))

/** The Sticker at a Piece position, facing along a normal. */
export function stickerAtPlace(piece: Vec, normal: Vec): Sticker {
  const sticker = stickerByPlace.get(placeKey({ piece, normal }))
  if (sticker === undefined) throw new RangeError(`no Sticker at ${piece} facing ${normal}`)
  return sticker
}

// The axis each Letter turns clockwise around, and which Layers along it
// move: the outer one (depth 1), the middle one (depth 0), or the whole Cube.
const AXES: Readonly<Record<Letter, { axis: Vec; depth: 1 | 0 | 'all' }>> = {
  R: { axis: [1, 0, 0], depth: 1 },
  L: { axis: [-1, 0, 0], depth: 1 },
  U: { axis: [0, 1, 0], depth: 1 },
  D: { axis: [0, -1, 0], depth: 1 },
  F: { axis: [0, 0, 1], depth: 1 },
  B: { axis: [0, 0, -1], depth: 1 },
  M: { axis: [-1, 0, 0], depth: 0 },
  E: { axis: [0, -1, 0], depth: 0 },
  S: { axis: [0, 0, 1], depth: 0 },
  x: { axis: [1, 0, 0], depth: 'all' },
  y: { axis: [0, 1, 0], depth: 'all' },
  z: { axis: [0, 0, 1], depth: 'all' },
}

/**
 * What a Move turns, for drawing it (TypeScript only): the axis it turns
 * clockwise around, as seen looking at the origin from the axis's tip, and
 * which Pieces along that axis move. depth is the position along the axis of
 * the Layer that turns (1 for an outer Layer, 0 for a middle one), or 'all'
 * for a Cube rotation.
 */
export function moveAxis(move: Move): { readonly axis: Vec; readonly depth: 1 | 0 | 'all' } {
  return AXES[move.letter]
}

/** Where each Sticker goes: the Sticker at index i moves to perm[i]. */
export type Perm = readonly Sticker[]

const AMOUNTS: readonly Amount[] = [1, -1, 2]

/** Every Move, in notation order: each Letter clockwise, counterclockwise, half. */
export const ALL_MOVES: readonly Move[] = LETTERS.flatMap((letter) =>
  AMOUNTS.map((amount) => ({ letter, amount })),
)

function buildPerm({ letter, amount }: Move): Perm {
  const { axis, depth } = AXES[letter]
  const quarters = (amount + 4) % 4
  return STICKERS.map((s) => {
    let place = placeOf(s)
    if (depth !== 'all' && dot(place.piece, axis) !== depth) return s
    for (let q = 0; q < quarters; q++) {
      place = { piece: clockwise(axis, place.piece), normal: clockwise(axis, place.normal) }
    }
    return stickerAtPlace(place.piece, place.normal)
  })
}

const PERMS: readonly Perm[] = ALL_MOVES.map(buildPerm)

/** The index of a Move in ALL_MOVES. */
export function moveIndex(move: Move): number {
  const letter = LETTERS.indexOf(move.letter)
  const amount = AMOUNTS.indexOf(move.amount)
  if (letter < 0 || amount < 0) throw new RangeError(`invalid Move ${JSON.stringify(move)}`)
  return letter * 3 + amount
}

/** How a Move permutes the Stickers. */
export function movePerm(move: Move): Perm {
  return PERMS[moveIndex(move)] as Perm
}

/** Applies a permutation to 54 values indexed by Sticker. */
export function permute<T>(state: readonly T[], perm: Perm): T[] {
  const next = new Array<T>(state.length)
  perm.forEach((to, from) => {
    next[to] = state[from] as T
  })
  return next
}

// RELABELED[r][m] is ALL_MOVES[m] relabeled through ALL_MOVES[r]: the one
// Move with the same effect as undoing r, applying m, then applying r again.
// Only Cube rotations have a row.
const RELABELED: ReadonlyMap<number, readonly Move[]> = (() => {
  const key = (m: Move): string => permute(STICKERS, movePerm(m)).join(',')
  const byEffect = new Map(ALL_MOVES.map((m) => [key(m), m]))
  const table = new Map<number, Move[]>()
  for (const r of ALL_MOVES.filter(isRotation)) {
    const row = ALL_MOVES.map((m) => {
      const effect = [inverse(r), m, r].reduce<readonly Sticker[]>((s, step) => permute(s, movePerm(step)), STICKERS)
      const relabeled = byEffect.get(effect.join(','))
      if (relabeled === undefined) throw new Error(`no Move relabels ${JSON.stringify(m)}`)
      return relabeled
    })
    table.set(moveIndex(r), row)
  }
  return table
})()

/**
 * The Move that does physically what a Move did, once the Cube has been
 * reoriented by a Cube rotation: applying move then rotation gives the same
 * Cube as applying rotation then relabel(move, rotation). For example, F
 * relabeled through y is L, because y brings the front Layer to the left.
 * Throws if rotation is not a Cube rotation.
 */
export function relabel(move: Move, rotation: Move): Move {
  const row = RELABELED.get(moveIndex(rotation))
  if (row === undefined) throw new RangeError(`relabeling through ${formatMove(rotation)}, which is not a Cube rotation`)
  return row[moveIndex(move)] as Move
}
