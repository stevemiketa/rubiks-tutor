// The server's Snapshot API (internal/server/snapshots.go), over fetch.
import type { SharedSnapshot, Snapshot, SnapshotClient } from '../session/index.ts'

/** The body of every API error. */
interface ApiError {
  readonly code?: unknown
  readonly message?: unknown
}

export const snapshotApi: SnapshotClient = {
  async share(snapshot: Snapshot): Promise<SharedSnapshot> {
    const response = await call('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scramble: snapshot.scramble, moves: snapshot.moves }),
    })
    if (!response.ok) throw new Error(await failure(response))
    const { id, url } = (await response.json()) as Partial<Record<string, unknown>>
    if (typeof id !== 'string' || typeof url !== 'string') throw new Error('The server sent an unexpected answer.')
    return { id, url }
  },

  async load(id: string): Promise<Snapshot | undefined> {
    const response = await call(`/api/snapshots/${encodeURIComponent(id)}`)
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(await failure(response))
    const { scramble, moves } = (await response.json()) as Partial<Record<string, unknown>>
    if (typeof scramble !== 'string' || typeof moves !== 'string') throw new Error('The server sent an unexpected answer.')
    return { scramble, moves }
  },
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.")
  }
}

// The server's message says what went wrong, such as when to try again
// after too many shares.
async function failure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError
    if (typeof body.message === 'string' && body.message !== '') return body.message
  } catch {
    // Not one of the API's errors; fall through.
  }
  return `The server couldn't do that (error ${response.status}). Try again.`
}
