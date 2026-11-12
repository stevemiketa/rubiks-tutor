import { formatMove, type Move } from '../cube/index.ts'

/**
 * An on-screen button that makes one Move, showing an arrow glyph and the
 * Move's notation. Its accessible name is "<name>: <notation>", such as
 * "Turn up: M'" or "Rotate left: y". The turn and rotate pads are made of these.
 */
export function MoveButton({
  move,
  name,
  glyph,
  className,
  keyShortcuts,
  disabled,
  onClick,
}: {
  move: Move
  name: string
  glyph: string
  /** Places the button in its pad's grid, such as 'turn-up'. */
  className: string
  /** The key that does the same, in aria-keyshortcuts form, if any. */
  keyShortcuts?: string
  disabled: boolean
  onClick: () => void
}) {
  const notation = formatMove(move)
  return (
    <button
      type="button"
      className={`turn-button ${className}`}
      aria-label={`${name}: ${notation}`}
      aria-keyshortcuts={keyShortcuts}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true">{glyph}</span>
      <span className="notation">{notation}</span>
    </button>
  )
}
