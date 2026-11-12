/**
 * The page the address bar points at. These match the server's page routes
 * (internal/server), which all serve the same entry page.
 */
export type Route =
  | { page: 'splash' }
  | { page: 'tutor'; snapshotId?: string }
  | { page: 'not-found' }

const snapshotPath = /^\/s\/([^/]+)$/

export function parseRoute(pathname: string): Route {
  if (pathname === '/') return { page: 'splash' }
  if (pathname === '/app') return { page: 'tutor' }
  const snapshot = snapshotPath.exec(pathname)
  if (snapshot?.[1]) return { page: 'tutor', snapshotId: snapshot[1] }
  return { page: 'not-found' }
}
