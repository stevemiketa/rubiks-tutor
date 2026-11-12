// Slots and Piece names. Matches internal/cube/piece.go.
import {
  COLORS,
  FACES,
  SOLVED_COLORS,
  faceNormal,
  stickerAtPlace,
  stickerFace,
  type Color,
  type Face,
  type Sticker,
  type Vec,
} from './geometry.ts'

/**
 * One of the 26 places a Piece can be, named by the faces it touches in the
 * order U/D, F/B, R/L, such as "U", "UF" or "UFR".
 */
export interface Slot {
  readonly name: string
  /** The Slot's Sticker on each face in name, in that order. */
  readonly stickers: readonly Sticker[]
  /** x toward R, y toward U, z toward F; each -1, 0 or 1. */
  readonly position: Vec
}

/** Where a Piece currently is. */
export interface Location {
  /** The Slot's name, such as "UFR". */
  readonly slot: string
  /** The Sticker each of the Piece's colors is on, in the order its name lists them. */
  readonly stickers: readonly Sticker[]
}

const SLOT_NAMES = [
  'U', 'R', 'F', 'D', 'L', 'B',
  'UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL',
  'UFR', 'UFL', 'UBR', 'UBL', 'DFR', 'DFL', 'DBR', 'DBL',
] as const

const isFace = (letter: string): letter is Face => (FACES as readonly string[]).includes(letter)

/**
 * All 26 Slots: centers first in face order, then edges
 * (UF UR UB UL DF DR DB DL FR FL BR BL), then corners
 * (UFR UFL UBR UBL DFR DFL DBR DBL).
 */
export const SLOTS: readonly Slot[] = Object.freeze(
  SLOT_NAMES.map((name) => {
    const faces = [...name].filter(isFace)
    const position = faces.reduce<Vec>((p, f) => {
      const n = faceNormal(f)
      return [p[0] + n[0], p[1] + n[1], p[2] + n[2]]
    }, [0, 0, 0])
    return Object.freeze({
      name,
      stickers: Object.freeze(faces.map((f) => stickerAtPlace(position, faceNormal(f)))),
      position,
    })
  }),
)

const byColorOrder = (a: Color, b: Color): number => COLORS.indexOf(a) - COLORS.indexOf(b)

/** Names the Piece with these Sticker colors: the colors in COLORS order, then its kind. */
function pieceName(colors: readonly Color[]): string {
  const kind = ['', 'center', 'edge', 'corner'][colors.length] ?? ''
  return `${[...colors].sort(byColorOrder).join('-')} ${kind}`
}

/**
 * The names of all 26 Pieces, in SLOTS order: the Piece each Slot holds in a
 * solved Cube in the standard orientation, such as "white-green edge".
 */
export const PIECE_NAMES: readonly string[] = Object.freeze(
  SLOTS.map((slot) => pieceName(slot.stickers.map((s) => SOLVED_COLORS[stickerFace(s)]))),
)

type ColorAt = (sticker: Sticker) => Color

/** The Piece in a Slot. Throws for an unknown Slot or a state no Moves can reach. */
export function pieceAt(colorAt: ColorAt, slotName: string): string {
  const slot = SLOTS.find((s) => s.name === slotName)
  if (slot === undefined) throw new RangeError(`unknown Slot "${slotName}"`)
  const name = pieceName(slot.stickers.map(colorAt))
  if (!PIECE_NAMES.includes(name)) throw new Error(`Slot ${slotName} holds no real Piece (${name})`)
  return name
}

/** Finds a Piece by its exact name. Throws for an unknown name. */
export function locate(colorAt: ColorAt, piece: string): Location {
  if (!PIECE_NAMES.includes(piece)) throw new RangeError(`unknown Piece "${piece}"`)
  for (const slot of SLOTS) {
    const colors = slot.stickers.map(colorAt)
    if (pieceName(colors) !== piece) continue
    const stickers = [...colors].sort(byColorOrder).map((c) => slot.stickers[colors.indexOf(c)] as Sticker)
    return { slot: slot.name, stickers }
  }
  throw new Error(`Piece "${piece}" is not on this Cube`)
}
