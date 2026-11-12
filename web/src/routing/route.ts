/**
 * The page the address bar points at. These match the server's page routes
 * (internal/server), which all serve the same entry page.
 */
export type Route = { page: 'splash' } | { page: 'tutor'; snapshotId?: string }

const snapshotPath = /^\/s\/([^/]+)$/

/**
 * The page at pathname, or undefined for any other path. The server answers
 * those with a 404 of its own, so the app is never loaded at one.
 */
export function parseRoute(pathname: string): Route | undefined {
  if (pathname === '/') return { page: 'splash' }
  if (pathname === '/app') return { page: 'tutor' }
  const snapshot = snapshotPath.exec(pathname)
  if (snapshot?.[1]) return { page: 'tutor', snapshotId: snapshot[1] }
  return undefined
}
