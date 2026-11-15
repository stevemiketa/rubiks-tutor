// Where each Piece sits and how big it is, per Puzzle. This is the per-Piece
// size+position override the shared foundation calls for (ADR 0005): the
// renderer reads a size and a centre position for every Slot, rather than
// assuming the 3x3's unit grid. The 3x3 keeps its grid untouched; the Pocket
// Cube enlarges its eight corner Pieces into a true 2x2x2 and hides the
// eighteen non-corner Pieces. A later Puzzle (the Mirror Cube) reuses the same
// override for its own per-Piece sizes.
import { SLOTS, type Puzzle, type Vec } from '../cube/index.ts'

/** Where one Piece is drawn and how big, for a Puzzle. */
export interface PiecePlacement {
  /** The side of the Piece's body, in world units. A Sticker scales with it. */
  readonly size: number
  /** The centre of the Piece's body. */
  readonly position: Vec
  /** Whether the Piece is drawn at all. A Pocket Cube hides its non-corner Pieces. */
  readonly visible: boolean
}

/** The Piece placements for a Puzzle, by Slot name. */
export type PieceLayout = ReadonlyMap<string, PiecePlacement>

// The ordinary 3x3 size: Pieces sit on a unit grid, each a little smaller than
// its cell so a black gap shows between them. Kept in step with cubeModel's
// PIECE_SIZE, the one the layout and the geometry must agree on.
const PIECE_SIZE = 0.95

// The Pocket Cube's eight Pieces are its corners, enlarged to meet at the
// centre: two along an axis span the whole Cube. Each is twice a 3x3 Piece,
// so the 2x2 reads as the same size as the 3x3 from the fixed camera.
const POCKET_PIECE_SIZE = 2 * PIECE_SIZE

// Half a Piece's size plus half the gap between two Pieces, so two enlarged
// corners along an axis leave the same black gap between them as 3x3 Pieces do.
const POCKET_GAP = 1 - PIECE_SIZE
const POCKET_OFFSET = POCKET_PIECE_SIZE / 2 + POCKET_GAP / 2

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0)
const isCorner = (position: Vec): boolean => position.every((n) => n !== 0)

/**
 * Where every Piece sits and how big it is, for a Puzzle. The 3x3 draws all 26
 * Pieces on its unit grid; the Pocket Cube ('pocket') enlarges its eight
 * corners into a true 2x2x2, pulled to the quadrant positions so they meet at
 * the centre, and hides the other eighteen.
 */
export function pieceLayout(puzzle: Puzzle): PieceLayout {
  const placements = new Map<string, PiecePlacement>()
  for (const slot of SLOTS) {
    if (puzzle === 'pocket') {
      const [x, y, z] = slot.position
      placements.set(slot.name, {
        size: POCKET_PIECE_SIZE,
        position: [sign(x) * POCKET_OFFSET, sign(y) * POCKET_OFFSET, sign(z) * POCKET_OFFSET],
        visible: isCorner(slot.position),
      })
    } else {
      placements.set(slot.name, { size: PIECE_SIZE, position: slot.position, visible: true })
    }
  }
  return placements
}
