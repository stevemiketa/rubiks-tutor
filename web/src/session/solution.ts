// A Solution from the Go solver (POST /api/solve): the Stages of the
// beginner's Method that take the Cube to solved, as the tutor reads them.
import { formatMoves, parseMoves, relabel, type Move } from '../cube/index.ts'

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

/** The note on a Cube rotation the learner made during Playback. */
const ROTATION_NOTE = 'you rotated the Cube here; the Moves after it are relabeled to match'

/**
 * The Solution with a Cube rotation the learner made put in at a position,
 * and every Move after it relabeled, so that it still solves the Cube: each
 * relabeled Move does physically what the old one did. The rotation goes
 * into the Stage of the last Move played, or the first Stage at position 0,
 * and into the Algorithm it lands inside, if any, so every Algorithm still
 * matches its Stage's Moves. Returns undefined for a Solution with no Stages.
 */
export function insertRotation(solution: Solution, position: number, rotation: Move): Solution | undefined {
  const starts = stageStarts(solution)
  // The last Stage that starts before position holds the last Move played.
  const into = position === 0 ? 0 : starts.findLastIndex((start) => start < position)
  if (into === -1 || solution.stages[into] === undefined) return undefined
  const after = (move: Move): Move => relabel(move, rotation)

  const stages = solution.stages.map((stage, i): Stage => {
    if (i < into) return stage
    const relabeled = (moves: readonly SolutionMove[]) => moves.map((m) => ({ ...m, move: after(m.move) }))
    if (i > into) {
      return {
        ...stage,
        moves: relabeled(stage.moves),
        algorithms: stage.algorithms.map((use) => ({ ...use, moves: use.moves.map(after) })),
      }
    }
    const at = position - (starts[i] ?? 0)
    return {
      ...stage,
      moves: [...stage.moves.slice(0, at), { move: rotation, note: ROTATION_NOTE }, ...relabeled(stage.moves.slice(at))],
      algorithms: stage.algorithms.map((use): AlgorithmUse => {
        if (use.start >= at) return { ...use, start: use.start + 1, moves: use.moves.map(after) }
        if (use.start + use.moves.length <= at) return use
        const split = at - use.start
        return { ...use, moves: [...use.moves.slice(0, split), rotation, ...use.moves.slice(split).map(after)] }
      }),
    }
  })
  return { stages, moves: stages.flatMap((s) => s.moves.map((m) => m.move)) }
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
  return { solved: false, solution: readSolution(body.stages) }
}

/**
 * A Solution's Stages as plain data, in the format POST /api/solve answers
 * with: what browser storage keeps, and readSolution reads back.
 */
export function writeSolution(solution: Solution): unknown[] {
  return solution.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    goal: stage.goal,
    moves: formatMoves(stage.moves.map((m) => m.move)),
    notes: stage.moves.flatMap(({ note }, at) => (note === undefined ? [] : [{ at, text: note }])),
    algorithms: stage.algorithms.map((use) => ({
      name: use.name,
      notation: formatMoves(use.moves),
      start: use.start,
      length: use.moves.length,
    })),
    pieces: stage.pieces,
  }))
}

/**
 * The Solution a list of Stages describes, in the format POST /api/solve
 * answers with. Throws a TypeError on anything else, as parseSolveResponse does.
 */
export function readSolution(data: unknown): Solution {
  const stages = list(data, 'the Stages').map(parseStage)
  return { stages, moves: stages.flatMap((s) => s.moves.map((m) => m.move)) }
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
