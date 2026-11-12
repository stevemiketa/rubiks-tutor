// The cube model: the Cube as its 54 Stickers as currently seen. It matches
// the Go model in internal/cube, and both run the shared test cases in
// testdata/cube (ADR 0002). See internal/cube/doc.go for the Sticker layout.
export {
  LETTERS,
  ParseError,
  formatMove,
  formatMoves,
  inverse,
  invert,
  isRotation,
  parseMove,
  parseMoves,
  type Amount,
  type Letter,
  type Move,
} from './notation.ts'
export {
  COLORS,
  FACES,
  SOLVED_COLORS,
  relabel,
  stickerAt,
  stickerCol,
  stickerFace,
  stickerName,
  stickerRow,
  type Color,
  type Face,
  type Sticker,
  type Vec,
} from './geometry.ts'
export { PIECE_NAMES, SLOTS, type Location, type Slot } from './pieces.ts'
export { Cube } from './cube.ts'
