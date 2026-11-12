// What the Tutor needs to share Sessions and open share links: the server's
// Snapshot API, and where sharing and opening have got to.
import type { Snapshot } from './session.ts'

/** A Snapshot the server has saved: its ID and the share link that opens it. */
export interface SharedSnapshot {
  readonly id: string
  readonly url: string
}

/** The server's Snapshot API. web/src/api/snapshots.ts calls the real one. */
export interface SnapshotClient {
  /** Saves a Snapshot. Rejects with an Error whose message says, for a person, why it couldn't. */
  share(snapshot: Snapshot): Promise<SharedSnapshot>
  /** The Snapshot with this ID, or undefined if there is none. Rejects if the server can't say. */
  load(id: string): Promise<Snapshot | undefined>
}

/** Where sharing has got to, while the share dialog is open. */
export type Sharing =
  | { readonly status: 'saving' }
  | ({ readonly status: 'shared' } & SharedSnapshot)
  | { readonly status: 'failed'; readonly message: string }

/**
 * Where opening a share link has got to, until the Snapshot opens:
 * 'loading', 'not-found' when no Snapshot has the link's ID, or 'failed'
 * when the server couldn't be asked.
 */
export type Opening = 'loading' | 'not-found' | 'failed'
