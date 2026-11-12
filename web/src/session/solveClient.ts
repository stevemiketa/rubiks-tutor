// Asking the server for a Solution: POST /api/solve.
import { formatMoves, type Move } from '../cube/index.ts'
import { parseSolveResponse, type SolveResult } from './solution.ts'

/** Finds the Solution for the Cube a Scramble and a Move history produce. Rejects if it can't. */
export type Solver = (scramble: readonly Move[], moves: readonly Move[]) => Promise<SolveResult>

/** The Solver the tutor uses: the Go solver, through POST /api/solve. */
export const requestSolve: Solver = async (scramble, moves) => {
  const response = await fetch('/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scramble: formatMoves(scramble), moves: formatMoves(moves) }),
  })
  if (!response.ok) throw new Error(`POST /api/solve answered ${response.status}`)
  return parseSolveResponse(await response.json())
}
