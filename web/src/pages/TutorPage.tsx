// Placeholder: the 3D Cube, controls and Solution panel arrive in later
// tickets. snapshotId is set when the tutor was opened from a share link.
export function TutorPage({ snapshotId }: { snapshotId?: string }) {
  return (
    <main className="page tutor">
      <h1>Tutor</h1>
      <p>{snapshotId ? `Snapshot ${snapshotId} will open here.` : 'Your Cube will appear here.'}</p>
    </main>
  )
}
