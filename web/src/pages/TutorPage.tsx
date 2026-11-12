import { Link } from '../routing/Link.tsx'
import { CubeView } from '../scene/CubeView.tsx'
import { isSelectable } from '../session/index.ts'
import { MoveHistory } from '../tutor/MoveHistory.tsx'
import { TurnControls } from '../tutor/TurnControls.tsx'
import { useTutor } from '../tutor/useTutor.ts'

// snapshotId is set when the tutor was opened from a share link; opening the
// Snapshot arrives in a later ticket.
export function TutorPage({ snapshotId }: { snapshotId?: string }) {
  const { tutor, state } = useTutor()
  const solved = state.session.isSolved()

  return (
    <main className="tutor">
      <header className="tutor-header">
        <Link className="brand" to="/">
          Cubular
        </Link>
        <h1>Tutor</h1>
      </header>
      {snapshotId && <p className="notice">Snapshot {snapshotId} will open here.</p>}

      <div className="tutor-body">
        <div className="tutor-stage">
          <CubeView
            queue={tutor.queue}
            selected={state.selected}
            onSelect={(sticker) => tutor.select(sticker)}
            selectable={isSelectable}
            label="The Cube, seen from the front, top and right"
          />
          <div className="tutor-status">
            <p role="status">{solved && <span className="solved">Solved</span>}</p>
            <p role="status" className="hint">
              {state.hint === 'select-sticker' && 'Select a Sticker first: click one on the front, top or right face.'}
            </p>
          </div>
        </div>

        <div className="tutor-panel">
          <TurnControls selected={state.selected} onTurn={(direction) => tutor.turn(direction)} />
          <MoveHistory moves={state.session.history} />
        </div>
      </div>
    </main>
  )
}
