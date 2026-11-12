import type { Opening } from '../session/index.ts'

/**
 * What the tutor shows in place of the Cube when a share link's Snapshot
 * can't be opened: there's no Snapshot with its ID, or the server couldn't
 * be asked. Either way the learner can start a new Session.
 */
export function SnapshotMissing({
  opening,
  onRetry,
  onNewSession,
}: {
  opening: Exclude<Opening, 'loading'>
  onRetry: () => void
  onNewSession: () => void
}) {
  const notFound = opening === 'not-found'
  return (
    <section className="panel snapshot-missing" aria-labelledby="snapshot-missing-heading">
      <h2 id="snapshot-missing-heading">{notFound ? 'Snapshot not found' : 'Couldn’t open the Snapshot'}</h2>
      <p>
        {notFound
          ? 'No Snapshot has the ID in this link. Check that the whole link was copied, or start a new Session.'
          : 'The server couldn’t be reached. Try again, or start a new Session.'}
      </p>
      <div className="confirm-actions">
        {!notFound && (
          <button type="button" className="action-button" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="action-button" onClick={onNewSession}>
          Start a new Session
        </button>
      </div>
    </section>
  )
}
