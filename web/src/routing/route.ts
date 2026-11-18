/**
 * The page the address bar points at. These match the server's page routes
 * (internal/server), which all serve the same entry page.
 */
import type { Puzzle } from '../cube/index.ts'

export type Route = { page: 'splash' } | { page: 'tutor'; puzzle?: Puzzle; snapshotId?: string }

const snapshotPath = /^\/s\/([^/]+)$/

/**
 * The page at pathname, or undefined for any other path. The server answers
 * those with a 404 of its own, so the app is never loaded at one. /app is the
 * 3x3; /app/2x2 is the Pocket Cube. A share link carries no puzzle in its
 * path: the Session reads it from the loaded Snapshot (ADR 0005).
 */
export function parseRoute(pathname: string): Route | undefined {
  if (pathname === '/') return { page: 'splash' }
  if (pathname === '/app') return { page: 'tutor', puzzle: 'cube' }
  if (pathname === '/app/2x2') return { page: 'tutor', puzzle: 'pocket' }
  const snapshot = snapshotPath.exec(pathname)
  if (snapshot?.[1]) return { page: 'tutor', snapshotId: snapshot[1] }
  return undefined
}
