import { stickerCol, stickerFace, stickerRow, type Sticker } from '../cube/index.ts'
import { DIRECTIONS, turnFor, type Direction } from '../session/index.ts'
import { MoveButton } from './MoveButton.tsx'

const ARROWS: Readonly<Record<Direction, string>> = { up: '↑', left: '←', right: '→', down: '↓' }

const FACE_NAMES: Readonly<Record<string, string>> = { U: 'top', R: 'right', F: 'front' }

// Positions on a face as laid out in internal/cube/doc.go. The top face is
// laid out with the back at its top edge.
const ROWS: Readonly<Record<string, readonly string[]>> = {
  U: ['back', '', 'front'],
  R: ['top', '', 'bottom'],
  F: ['top', '', 'bottom'],
}
const COLUMNS = ['left', '', 'right']

/** Names a Sticker's position for people, such as "front face, top-right". */
function describeSticker(sticker: Sticker): string {
  const face = stickerFace(sticker)
  const row = ROWS[face]?.[stickerRow(sticker)] ?? ''
  const col = COLUMNS[stickerCol(sticker)] ?? ''
  const where = [row, col].filter(Boolean).join('-') || 'center'
  return `${FACE_NAMES[face] ?? face} face, ${where}`
}

/** The on-screen arrows for the selected Sticker, each labeled with its Move. */
export function TurnControls({
  selected,
  disabled = false,
  onTurn,
}: {
  selected: Sticker | undefined
  /** Whether Turns must wait, as they do while the Scramble plays. */
  disabled?: boolean
  onTurn: (direction: Direction) => void
}) {
  return (
    <section className="panel" aria-labelledby="turn-heading">
      <h2 id="turn-heading">Turn</h2>
      {/* Announced as it changes, so choosing a Sticker from the keyboard is heard. */}
      <p aria-live="polite">
        {selected === undefined ? 'No Sticker selected.' : `Selected: ${describeSticker(selected)}`}
      </p>
      {selected === undefined ? (
        <p className="muted">
          Click a Sticker on the front, top or right face, or choose one with the W, A, S and D keys. Then use the
          arrow keys or the buttons here to turn the Layers through it.
        </p>
      ) : (
        <div className="turn-pad" role="group" aria-label="Turn the selected Sticker’s Layers">
          {DIRECTIONS.map((direction) => (
            <MoveButton
              key={direction}
              move={turnFor(selected, direction)}
              name={`Turn ${direction}`}
              glyph={ARROWS[direction]}
              className={`turn-${direction}`}
              disabled={disabled}
              onClick={() => onTurn(direction)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
