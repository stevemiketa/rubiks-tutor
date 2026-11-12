import { Link } from '../routing/Link.tsx'
import { CubeView } from '../scene/CubeView.tsx'
import { isSelectable } from '../session/index.ts'
import { MoveHistory } from '../tutor/MoveHistory.tsx'
import { NotationSheet } from '../tutor/NotationSheet.tsx'
import { RotateControls } from '../tutor/RotateControls.tsx'
import { ScramblePanel } from '../tutor/ScramblePanel.tsx'
import { Share } from '../tutor/Share.tsx'
import { SnapshotMissing } from '../tutor/SnapshotMissing.tsx'
import { SolutionPanel } from '../tutor/SolutionPanel.tsx'
import { TurnControls } from '../tutor/TurnControls.tsx'
import { useSnapshotAddress } from '../tutor/useSnapshotAddress.ts'
import { useTutor } from '../tutor/useTutor.ts'

// snapshotId is set when the tutor was opened from a share link, which
// opens that Snapshot. The page stays mounted when the address switches
// between /app and a share link, so it is read only once.
export function TutorPage({ snapshotId }: { snapshotId?: string }) {
  const { tutor, state } = useTutor(snapshotId)
  useSnapshotAddress(state.snapshotId)
  const { session, opening } = state
  const solved = session.isSolved()
  // Moves, Solve and Share wait for the Scramble and for a share link's Snapshot.
  const waiting = state.scrambling || opening !== undefined

  return (
    <main className="tutor">
      <header className="tutor-header">
        <Link className="brand" to="/">
          Cubular
        </Link>
        <h1>Tutor</h1>
        <div className="tutor-tools">
          <Share
            sharing={state.sharing}
            disabled={waiting}
            onShare={() => void tutor.share()}
            onClose={() => tutor.closeShare()}
          />
          <NotationSheet />
        </div>
      </header>

      {opening === 'not-found' || opening === 'failed' ? (
        <SnapshotMissing
          opening={opening}
          onRetry={() => state.snapshotId !== undefined && void tutor.openSnapshot(state.snapshotId)}
          onNewSession={() => tutor.newScramble()}
        />
      ) : (
        <div className="tutor-body">
          <div className="tutor-stage">
            <CubeView
              queue={tutor.queue}
              selected={state.selected}
              onSelect={(sticker) => tutor.select(sticker)}
              selectable={isSelectable}
              onRotate={(rotations) => tutor.recordDrag(rotations)}
              label="The Cube, seen from the front, top and right"
            />
            <div className="tutor-status">
              <p role="status">{solved && opening === undefined && <span className="solved">Solved</span>}</p>
              <p role="status">
                {state.scrambling && <span className="scrambling">Scrambling…</span>}
                {opening === 'loading' && <span className="scrambling">Opening the Snapshot…</span>}
              </p>
              <p role="status" className="hint">
                {state.hint === 'select-sticker' &&
                  'Select a Sticker first: click one on the front, top or right face, or press W, A, S or D.'}
              </p>
            </div>
          </div>

          <div className="tutor-panel">
            <ScramblePanel
              scramble={session.scramble}
              confirming={state.confirming === 'new-scramble'}
              // Undone Moves count too: redo could bring them back. So do Moves played from a Solution.
              movesMade={session.history.length + session.undone.length + session.position}
              onNewScramble={() => tutor.newScramble()}
              onConfirm={() => tutor.confirmNewScramble()}
              onCancel={() => tutor.cancelNewScramble()}
            />
            <SolutionPanel
              session={session}
              status={state.solveStatus}
              disabled={waiting}
              onSolve={() => void tutor.solve()}
              playback={tutor}
            />
            <TurnControls selected={state.selected} disabled={waiting} onTurn={(direction) => tutor.turn(direction)} />
            <RotateControls disabled={waiting} onRotate={(direction) => tutor.rotate(direction)} />
            <MoveHistory
              moves={session.history}
              canUndo={session.canUndo && !waiting}
              canRedo={session.canRedo && !waiting}
              onUndo={() => tutor.undo()}
              onRedo={() => tutor.redo()}
            />
          </div>
        </div>
      )}
    </main>
  )
}
