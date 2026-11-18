import { useEffect } from 'react'
import { navigate } from '../routing/navigation.ts'

/**
 * Keeps the address bar on the share link of the Snapshot the tutor shows
 * unchanged (TutorState.snapshotId), and otherwise on the Puzzle's own
 * address (homePath: /app for the 3x3, /app/2x2 for the Pocket Cube). So
 * after Share the address is the share link, and after the first Move it is
 * the Puzzle's address again, where a reload restores the changed Session.
 * It replaces the address rather than adding to the browser's history: it's
 * the same Session either way.
 */
export function useSnapshotAddress(snapshotId: string | undefined, homePath = '/app'): void {
  useEffect(() => {
    const path = snapshotId === undefined ? homePath : `/s/${snapshotId}`
    if (window.location.pathname !== path) navigate(path, { replace: true })
  }, [snapshotId, homePath])
}
