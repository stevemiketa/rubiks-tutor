import { useRef, type ReactNode } from 'react'

/**
 * The notation cheat sheet: a button that opens a dialog explaining every
 * part of the notation the tutor uses, and the keys. It is a native modal
 * dialog, so Esc closes it and keys inside it never reach the Cube.
 */
export function NotationSheet() {
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button type="button" className="action-button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        Notation cheat sheet
      </button>
      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="notation-heading"
        // A click on the backdrop lands on the dialog itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="sheet-body">
          <div className="panel-heading">
            <h2 id="notation-heading">Notation</h2>
            <button type="button" className="action-button" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>

          <p>
            A Move is a letter, sometimes followed by a suffix. Moves are written in a row, separated by spaces, and
            made from left to right: <N>R U R' U'</N> is four Moves.
          </p>
          <p>
            Letters name a Layer by where it is now, not by its color. After a Cube rotation, <N>R</N> is whichever
            Layer is now on the right.
          </p>

          <h3>Outer Layers</h3>
          <p>A letter alone turns that Layer a quarter turn clockwise, as you see it looking straight at that face.</p>
          <Terms
            rows={[
              ['R', 'Right'],
              ['L', 'Left'],
              ['U', 'Up: the top Layer'],
              ['D', 'Down: the bottom Layer'],
              ['F', 'Front: the Layer facing you'],
              ['B', 'Back'],
            ]}
          />

          <h3>Middle Layers</h3>
          <Terms
            rows={[
              ['M', 'The middle Layer between L and R. It turns the same way as L.'],
              ['E', 'The middle Layer between U and D. It turns the same way as D.'],
              ['S', 'The middle Layer between F and B. It turns the same way as F.'],
            ]}
          />

          <h3>Cube rotations</h3>
          <p>A Cube rotation turns the whole Cube. It changes which side faces you, not how the Pieces are arranged.</p>
          <Terms
            rows={[
              ['x', 'The whole Cube turns the way R does: the front goes up.'],
              ['y', 'The whole Cube turns the way U does: the front goes to the left.'],
              ['z', 'The whole Cube turns the way F does: clockwise, as you look at it.'],
            ]}
          />

          <h3>Suffixes</h3>
          <Terms
            rows={[
              ['R', 'No suffix: a quarter turn clockwise.'],
              ["R'", 'A prime (said “R prime”): a quarter turn counterclockwise, undoing R.'],
              ['R2', 'A 2: a half turn. Either way round gives the same result.'],
            ]}
          />

          <h3>Keys</h3>
          <dl className="terms keys">
            <Key keys="← → ↑ ↓">Turn the Layers through the selected Sticker, the way the arrow points.</Key>
            <Key keys="W A S D">Move the selection up, left, down or right, across the front, top and right faces.</Key>
            <Key keys="Esc">Clear the selection.</Key>
            <Key keys="Shift + ← →">
              Rotate the Cube left (<N>y</N>) or right (<N>y'</N>).
            </Key>
            <Key keys="Shift + ↑ ↓">
              Rotate the Cube up (<N>x</N>) or down (<N>x'</N>).
            </Key>
            <Key keys="Ctrl+Z or ⌘Z">Undo the last Move.</Key>
            <Key keys="Shift+Ctrl+Z or Shift+⌘Z">Redo it.</Key>
          </dl>
        </div>
      </dialog>
    </>
  )
}

function N({ children }: { children: ReactNode }) {
  return <code className="notation">{children}</code>
}

function Terms({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="terms">
      {rows.map(([term, meaning]) => (
        <div key={term}>
          <dt className="notation">{term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}

function Key({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <div>
      <dt>
        <kbd>{keys}</kbd>
      </dt>
      <dd>{children}</dd>
    </div>
  )
}
