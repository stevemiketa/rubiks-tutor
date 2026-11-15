import type { Puzzle } from '../cube/index.ts'
import { navigate } from '../routing/navigation.ts'
import { Link } from '../routing/Link.tsx'
import { CubeView } from '../scene/CubeView.tsx'
import { isSelectable } from '../session/index.ts'
import { MoveHistory } from '../tutor/MoveHistory.tsx'
import { NotationSheet } from '../tutor/NotationSheet.tsx'
import { PuzzleSwitch } from '../tutor/PuzzleSwitch.tsx'
import { RotateControls } from '../tutor/RotateControls.tsx'
import { ScramblePanel } from '../tutor/ScramblePanel.tsx'
import { Share } from '../tutor/Share.tsx'
import { SnapshotMissing } from '../tutor/SnapshotMissing.tsx'
import { SolutionPanel } from '../tutor/SolutionPanel.tsx'
import { ThemeControl } from '../tutor/ThemeControl.tsx'
import { TurnControls } from '../tutor/TurnControls.tsx'
import { useSnapshotAddress } from '../tutor/useSnapshotAddress.ts'
import { useTutor } from '../tutor/useTutor.ts'

// The path the address bar shows for a Puzzle, so the in-tutor switch keeps the
// URL honest (the page stays mounted, so this doesn't reload it).
const PATH_FOR: Readonly<Record<Puzzle, string>> = { cube: '/app', pocket: '/app/2x2' }

// snapshotId is set when the tutor was opened from a share link, which
// opens that Snapshot. puzzle is the Puzzle the route asks a new Session to
// solve (the 3x3 by default, the Pocket Cube at /app/2x2). The page stays
// mounted when the address switches between /app and a share link, so both
// are read only once.
export function TutorPage({ snapshotId, puzzle }: { snapshotId?: string; puzzle?: Puzzle }) {
  const { tutor, state } = useTutor(snapshotId, puzzle)
  const { session, opening } = state
  useSnapshotAddress(state.snapshotId, PATH_FOR[session.puzzle])
  const solved = session.isSolved()
  // Moves, Solve and Share wait for the Scramble and for a share link's Snapshot.
  const waiting = state.scrambling || opening !== undefined

  // Switching Puzzle starts a fresh Session of it and points the address bar at
  // its route; staying on the same Puzzle is just a new Scramble.
  function switchPuzzle(next: Puzzle) {
    tutor.newPuzzle(next)
    if (next !== session.puzzle) navigate(PATH_FOR[next])
  }

  return (
    <main className="tutor">
      <header className="tutor-header">
        <Link className="brand" to="/">
          Cubular
        </Link>
        <h1>Tutor</h1>
        <div className="tutor-tools">
          <PuzzleSwitch puzzle={session.puzzle} disabled={waiting} onSwitch={switchPuzzle} />
          <Share
            sharing={state.sharing}
            disabled={waiting}
            onShare={() => void tutor.share()}
            onClose={() => tutor.closeShare()}
          />
          <NotationSheet />
          <ThemeControl />
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
              // A fresh CubeView per Puzzle, so its model is built with the
              // right per-Piece layout (the 3x3 grid or the true 2x2x2).
              key={session.puzzle}
              puzzle={session.puzzle}
              queue={tutor.queue}
              selected={state.selected}
              onSelect={(sticker) => tutor.select(sticker)}
              selectable={isSelectable}
              onRotate={(rotations) => tutor.recordDrag(rotations)}
              // The Pieces of the Stage Playback is in, until the Cube is solved.
              highlighted={solved ? undefined : session.teaching?.stage.pieces}
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
              movesMade={session.movesMade}
              onNewScramble={() => tutor.newScramble()}
              onConfirm={() => tutor.confirmNewScramble()}
              onCancel={() => tutor.cancelNewScramble()}
            />
            <SolutionPanel
              session={session}
              status={state.solveStatus}
              disabled={waiting}
              onSolve={() => void tutor.solve()}
              onClose={() => tutor.closeSolution()}
              playback={tutor}
            />
            <TurnControls selected={state.selected} disabled={waiting} onTurn={(direction) => tutor.turn(direction)} />
            <RotateControls disabled={waiting} onRotate={(direction) => tutor.rotate(direction)} />
            <MoveHistory
              moves={session.history}
              canUndo={session.canUndo && !waiting}
              canRedo={session.canRedo && !waiting}
              solutionPlayable={session.playable}
              onUndo={() => tutor.undo()}
              onRedo={() => tutor.redo()}
            />
          </div>
        </div>
      )}
    </main>
  )
}
