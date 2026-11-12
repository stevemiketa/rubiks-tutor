import { Link } from '../routing/Link.tsx'
import { CubeView } from '../scene/CubeView.tsx'
import { isSelectable } from '../session/index.ts'
import { MoveHistory } from '../tutor/MoveHistory.tsx'
import { NotationSheet } from '../tutor/NotationSheet.tsx'
import { RotateControls } from '../tutor/RotateControls.tsx'
import { ScramblePanel } from '../tutor/ScramblePanel.tsx'
import { SolutionPanel } from '../tutor/SolutionPanel.tsx'
import { TurnControls } from '../tutor/TurnControls.tsx'
import { useTutor } from '../tutor/useTutor.ts'

// snapshotId is set when the tutor was opened from a share link; opening the
// Snapshot arrives in a later ticket.
export function TutorPage({ snapshotId }: { snapshotId?: string }) {
  const { tutor, state } = useTutor()
  const { session } = state
  const solved = session.isSolved()

  return (
    <main className="tutor">
      <header className="tutor-header">
        <Link className="brand" to="/">
          Cubular
        </Link>
        <h1>Tutor</h1>
        <div className="tutor-tools">
          <NotationSheet />
        </div>
      </header>
      {snapshotId && <p className="notice">Snapshot {snapshotId} will open here.</p>}

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
            <p role="status">{solved && <span className="solved">Solved</span>}</p>
            <p role="status">{state.scrambling && <span className="scrambling">Scrambling…</span>}</p>
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
            solution={session.solution}
            position={session.position}
            playing={session.playing}
            status={state.solveStatus}
            disabled={state.scrambling}
            onSolve={() => void tutor.solve()}
            onPlay={() => tutor.play()}
            onPause={() => tutor.pause()}
          />
          <TurnControls
            selected={state.selected}
            disabled={state.scrambling}
            onTurn={(direction) => tutor.turn(direction)}
          />
          <RotateControls disabled={state.scrambling} onRotate={(direction) => tutor.rotate(direction)} />
          <MoveHistory
            moves={session.history}
            canUndo={session.canUndo && !state.scrambling}
            canRedo={session.canRedo && !state.scrambling}
            onUndo={() => tutor.undo()}
            onRedo={() => tutor.redo()}
          />
        </div>
      </div>
    </main>
  )
}
