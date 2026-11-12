// A Solution from the Go solver (POST /api/solve): the Stages of the
// beginner's Method that take the Cube to solved, as the tutor reads them.
import { formatMoves, parseMoves, type Move } from '../cube/index.ts'

/** One of a Stage's Moves, with its short note if it isn't part of an Algorithm. */
export interface SolutionMove {
  readonly move: Move
  readonly note: string | undefined
}

/** One use of a named Algorithm in a Stage: its Moves are the Stage's Moves from start on. */
export interface AlgorithmUse {
  readonly name: string
  readonly moves: readonly Move[]
  readonly start: number
}

/** One Stage of the Method, as it applies to the Cube that was solved. */
export interface Stage {
  /** Stable, such as 'white-cross'. */
  readonly id: string
  readonly name: string
  /** One sentence. */
  readonly goal: string
  readonly moves: readonly SolutionMove[]
  readonly algorithms: readonly AlgorithmUse[]
  /** The Pieces the Stage works on, by name, such as 'white-green edge'. */
  readonly pieces: readonly string[]
}

/** The Stages that solve a Cube, in Method order. */
export interface Solution {
  readonly stages: readonly Stage[]
  /** Every Move of every Stage, in order: what Playback plays. */
  readonly moves: readonly Move[]
}

/**
 * Where each Stage starts in the Solution's Moves, in Stage order: the
 * position Playback is at once every earlier Stage has been played. Each
 * Stage ends where the next starts, and the last at the end of the Solution.
 */
export function stageStarts(solution: Solution): readonly number[] {
  let start = 0
  return solution.stages.map((stage) => {
    const at = start
    start += stage.moves.length
    return at
  })
}

/** What Solve answers: the Cube was already solved, or here is its Solution. */
export type SolveResult = { readonly solved: true } | { readonly solved: false; readonly solution: Solution }

/**
 * Reads a POST /api/solve response body. Throws a TypeError on anything that
 * isn't one, including Algorithms that don't match the Moves where they say
 * they are.
 */
export function parseSolveResponse(data: unknown): SolveResult {
  const body = record(data, 'the response')
  if (body.solved === true) return { solved: true }
  if (!Array.isArray(body.stages)) throw new TypeError('the response has no Stages')
  const stages = body.stages.map(parseStage)
  return { solved: false, solution: { stages, moves: stages.flatMap((s) => s.moves.map((m) => m.move)) } }
}

function parseStage(data: unknown): Stage {
  const stage = record(data, 'a Stage')
  const id = text(stage.id, 'a Stage ID')
  const moves = parseMoves(text(stage.moves, `Stage ${id}'s Moves`))

  const notes = new Map<number, string>()
  for (const item of list(stage.notes, `Stage ${id}'s notes`)) {
    const note = record(item, 'a note')
    const at = index(note.at, moves.length, 'a note')
    notes.set(at, text(note.text, 'a note'))
  }

  const algorithms = list(stage.algorithms, `Stage ${id}'s Algorithms`).map((item): AlgorithmUse => {
    const use = record(item, 'an Algorithm')
    const name = text(use.name, 'an Algorithm name')
    const algorithm = parseMoves(text(use.notation, `Algorithm ${name}`))
    const start = index(use.start, moves.length, `Algorithm ${name}`)
    if (use.length !== algorithm.length || formatMoves(moves.slice(start, start + algorithm.length)) !== formatMoves(algorithm)) {
      throw new TypeError(`Algorithm ${name} isn't at ${start} in Stage ${id}'s Moves`)
    }
    return { name, moves: algorithm, start }
  })

  return {
    id,
    name: text(stage.name, `Stage ${id}'s name`),
    goal: text(stage.goal, `Stage ${id}'s goal`),
    moves: moves.map((move, i) => ({ move, note: notes.get(i) })),
    algorithms,
    pieces: list(stage.pieces, `Stage ${id}'s Pieces`).map((p) => text(p, 'a Piece name')),
  }
}

function record(data: unknown, what: string): Partial<Record<string, unknown>> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new TypeError(`${what} isn't an object`)
  return data as Partial<Record<string, unknown>>
}

function list(data: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(data)) throw new TypeError(`${what} isn't a list`)
  return data
}

function text(data: unknown, what: string): string {
  if (typeof data !== 'string') throw new TypeError(`${what} isn't text`)
  return data
}

function index(data: unknown, length: number, what: string): number {
  if (typeof data !== 'number' || !Number.isInteger(data) || data < 0 || data >= length) {
    throw new TypeError(`${what} points at no Move`)
  }
  return data
}
