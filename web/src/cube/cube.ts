// The Cube: its 54 Stickers as currently seen. Matches internal/cube.
import {
  COLORS,
  COLOR_LETTERS,
  FACES,
  SOLVED_COLORS,
  movePerm,
  permute,
  type Color,
  type Sticker,
} from './geometry.ts'
import type { Move } from './notation.ts'
import { locate, pieceAt, type Location } from './pieces.ts'

/**
 * The color of each of the 54 Stickers as currently seen, indexed by Sticker.
 * Immutable: apply returns a new Cube. Compare two Cubes by toString().
 */
export class Cube {
  readonly #stickers: readonly Color[]

  private constructor(stickers: readonly Color[]) {
    this.#stickers = stickers
  }

  /** A solved Cube in the standard orientation. */
  static solved(): Cube {
    return new Cube(FACES.flatMap((face) => Array<Color>(9).fill(SOLVED_COLORS[face])))
  }

  /**
   * Parses a state in the format toString prints. Checks the format, not
   * whether the state can be reached by Moves. Throws an Error.
   */
  static parse(state: string): Cube {
    const groups = state.split(' ')
    if (groups.length !== 6) throw new Error(`cube state "${state}": want 6 space-separated faces`)
    const stickers: Color[] = []
    groups.forEach((group, f) => {
      if (group.length !== 9) {
        throw new Error(`cube state "${state}": face ${FACES[f]} has ${group.length} Stickers, want 9`)
      }
      for (let i = 0; i < 9; i++) {
        const letter = group.charAt(i)
        const color = COLORS[COLOR_LETTERS.indexOf(letter)]
        if (color === undefined) {
          throw new Error(`cube state "${state}": "${letter}" is not a color letter (${COLOR_LETTERS})`)
        }
        stickers.push(color)
      }
    })
    return new Cube(stickers)
  }

  /** The color of a Sticker. */
  at(sticker: Sticker): Color {
    const color = this.#stickers[sticker]
    if (color === undefined) throw new RangeError(`no Sticker ${sticker}`)
    return color
  }

  /** The Cube after the Moves, in order. */
  apply(moves: readonly Move[]): Cube {
    let stickers = this.#stickers
    for (const move of moves) stickers = permute(stickers, movePerm(move))
    return new Cube(stickers)
  }

  /** Whether every face is a single color, in any orientation. */
  isSolved(): boolean {
    return this.#stickers.every((color, s) => color === this.#stickers[Math.floor(s / 9) * 9 + 4])
  }

  /**
   * The name of the Piece currently in a Slot, such as "white-green edge" in
   * "UF" of a solved Cube. Throws for an unknown Slot, or if the Slot's
   * Stickers don't form a real Piece, which only happens for a state no Moves
   * can reach.
   */
  pieceAt(slot: string): string {
    return pieceAt((s) => this.at(s), slot)
  }

  /**
   * Finds a Piece by name, such as "white-green-red corner". Names must be
   * exactly as PIECE_NAMES lists them. Throws for an unknown name.
   */
  locate(piece: string): Location {
    return locate((s) => this.at(s), piece)
  }

  /**
   * The state as six space-separated groups of nine color letters, one per
   * face in index order.
   */
  toString(): string {
    const letters = this.#stickers.map((color) => COLOR_LETTERS[COLORS.indexOf(color)]).join('')
    return letters.match(/.{9}/g)?.join(' ') ?? ''
  }
}
