import { formatMove, stickerCol, stickerFace, stickerRow, type Sticker } from '../cube/index.ts'
import { DIRECTIONS, turnFor, type Direction } from '../session/index.ts'

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
  onTurn,
}: {
  selected: Sticker | undefined
  onTurn: (direction: Direction) => void
}) {
  return (
    <section className="panel" aria-labelledby="turn-heading">
      <h2 id="turn-heading">Turn</h2>
      {selected === undefined ? (
        <p className="muted">
          Click a Sticker on the front, top or right face. Then use the arrow keys or the buttons here to turn the
          Layers through it.
        </p>
      ) : (
        <>
          <p>Selected: {describeSticker(selected)}</p>
          <div className="turn-pad" role="group" aria-label="Turn the selected Sticker’s Layers">
            {DIRECTIONS.map((direction) => {
              const move = formatMove(turnFor(selected, direction))
              return (
                <button
                  key={direction}
                  type="button"
                  className={`turn-button turn-${direction}`}
                  aria-label={`Turn ${direction}: ${move}`}
                  onClick={() => onTurn(direction)}
                >
                  <span aria-hidden="true">{ARROWS[direction]}</span>
                  <span className="notation">{move}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
