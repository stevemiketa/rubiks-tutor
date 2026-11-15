// Sharing through the server: POST /api/snapshots saves a Snapshot, and
// GET /api/snapshots/{id} opens one.
import { puzzleFromWireType, puzzleWireType } from '../cube/index.ts'
import type { Snapshot } from './session.ts'
import type { SharedSnapshot, SnapshotClient } from './sharing.ts'

/** The SnapshotClient the tutor uses: the server's Snapshot API. */
export const snapshotApi: SnapshotClient = {
  async share(snapshot: Snapshot): Promise<SharedSnapshot> {
    const response = await call('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // type is '3x3' or '2x2' on the wire; a missing one is the 3x3 (ADR 0005).
      body: JSON.stringify({
        scramble: snapshot.scramble,
        moves: snapshot.moves,
        type: puzzleWireType(puzzleFromWireType(snapshot.type)),
      }),
    })
    if (response.status === 429) throw new Error(tooManyShares(response.headers.get('Retry-After')))
    if (!response.ok) throw new Error(`The Snapshot couldn’t be saved (error ${response.status}). Try again.`)
    const { id, url } = (await response.json()) as Partial<Record<string, unknown>>
    if (typeof id !== 'string' || typeof url !== 'string') throw new Error(unexpected)
    return { id, url }
  },

  async load(id: string): Promise<Snapshot | undefined> {
    const response = await call(`/api/snapshots/${encodeURIComponent(id)}`)
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`The Snapshot couldn’t be loaded (error ${response.status}).`)
    const { scramble, moves, type } = (await response.json()) as Partial<Record<string, unknown>>
    if (typeof scramble !== 'string' || typeof moves !== 'string') throw new Error(unexpected)
    // A Snapshot saved before 2x2 support has no type: it reads as the 3x3.
    return { scramble, moves, type: puzzleWireType(puzzleFromWireType(type)) }
  },
}

const unexpected = 'The server sent an answer the tutor doesn’t understand.'

async function call(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch {
    throw new Error('The server couldn’t be reached. Check your connection and try again.')
  }
}

/** What to tell a learner who has shared too often, given the server's Retry-After seconds. */
function tooManyShares(retryAfter: string | null): string {
  const seconds = Number(retryAfter)
  const wait =
    !Number.isFinite(seconds) || seconds <= 0
      ? 'a little while'
      : seconds <= 90
        ? `${Math.ceil(seconds)} seconds`
        : `${Math.ceil(seconds / 60)} minutes`
  return `You’ve shared a lot in a short time. Try again in ${wait}.`
}
