// Asking the server for a Solution: POST /api/solve.
import { formatMoves, type Move } from '../cube/index.ts'
import { parseSolveResponse, type SolveResult } from './solution.ts'

/**
 * Finds the Solution for the Cube a Scramble and a Move history produce.
 * Rejects if it can't: with a SolveRefused when asking again with the same
 * Moves can't help, and with any other error when it might.
 */
export type Solver = (scramble: readonly Move[], moves: readonly Move[]) => Promise<SolveResult>

/**
 * The server refused a Solve, with an HTTP status that asking again with the
 * same Moves won't change, such as 413 for a Session with more Moves than
 * Solve takes.
 */
export class SolveRefused extends Error {
  /** The HTTP status the server answered with. */
  readonly status: number

  constructor(status: number) {
    super(`POST /api/solve answered ${status}`)
    this.name = 'SolveRefused'
    this.status = status
  }
}

// Client errors that can pass if the request is sent again later.
const RETRYABLE = new Set([408, 429])

/** The Solver the tutor uses: the Go solver, through POST /api/solve. */
export const requestSolve: Solver = async (scramble, moves) => {
  const response = await fetch('/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scramble: formatMoves(scramble), moves: formatMoves(moves) }),
  })
  if (response.status >= 400 && response.status < 500 && !RETRYABLE.has(response.status)) {
    throw new SolveRefused(response.status)
  }
  if (!response.ok) throw new Error(`POST /api/solve answered ${response.status}`)
  return parseSolveResponse(await response.json())
}
