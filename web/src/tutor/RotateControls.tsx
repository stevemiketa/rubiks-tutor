import { formatMove } from '../cube/index.ts'
import { rotationFor, type RotationDirection } from '../session/index.ts'

// Each button's name, what it shows, and the key that does the same.
const BUTTONS: readonly { direction: RotationDirection; name: string; glyph: string; key?: string }[] = [
  { direction: 'counterclockwise', name: 'Roll counterclockwise', glyph: '↺' },
  { direction: 'up', name: 'Rotate up', glyph: '↑', key: 'Shift+ArrowUp' },
  { direction: 'clockwise', name: 'Roll clockwise', glyph: '↻' },
  { direction: 'left', name: 'Rotate left', glyph: '←', key: 'Shift+ArrowLeft' },
  { direction: 'right', name: 'Rotate right', glyph: '→', key: 'Shift+ArrowRight' },
  { direction: 'down', name: 'Rotate down', glyph: '↓', key: 'Shift+ArrowDown' },
]

/** On-screen buttons for all six Cube rotations, each labeled with its Move. */
export function RotateControls({
  disabled = false,
  onRotate,
}: {
  /** Whether Cube rotations must wait, as they do while the Scramble plays. */
  disabled?: boolean
  onRotate: (direction: RotationDirection) => void
}) {
  return (
    <section className="panel" aria-labelledby="rotate-heading">
      <h2 id="rotate-heading">Rotate the Cube</h2>
      <p className="muted">Shift + an arrow key, or drag the space around the Cube.</p>
      <div className="rotate-pad" role="group" aria-labelledby="rotate-heading">
        {BUTTONS.map(({ direction, name, glyph, key }) => {
          const move = formatMove(rotationFor(direction))
          return (
            <button
              key={direction}
              type="button"
              className={`turn-button rotate-${direction}`}
              aria-label={`${name}: ${move}`}
              aria-keyshortcuts={key}
              disabled={disabled}
              onClick={() => onRotate(direction)}
            >
              <span aria-hidden="true">{glyph}</span>
              <span className="notation">{move}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
