import { useEffect } from 'react'
import { navigate } from '../routing/navigation.ts'

/**
 * Keeps the address bar on the share link of the Snapshot the tutor shows
 * unchanged (TutorState.snapshotId), and otherwise on the tutor's own
 * address. So after Share the address is the share link, and after the
 * first Move it is /app again, where a reload restores the changed Session.
 * It replaces the address rather than adding to the browser's history: it's
 * the same Session either way.
 */
export function useSnapshotAddress(snapshotId: string | undefined): void {
  useEffect(() => {
    const path = snapshotId === undefined ? '/app' : `/s/${snapshotId}`
    if (window.location.pathname !== path) navigate(path, { replace: true })
  }, [snapshotId])
}
