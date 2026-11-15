import { useId } from 'react'
import { isPuzzle, type Puzzle } from '../cube/index.ts'

/** Each Puzzle's name, in the order the switch lists them. */
const LABELS: Readonly<Record<Puzzle, string>> = { cube: '3×3 Cube', pocket: '2×2 Pocket Cube' }

/**
 * The in-tutor Puzzle switch: picking another Puzzle starts a fresh Session of
 * it; picking the one being solved starts a new Scramble. It is disabled while
 * the Scramble plays or a share link opens.
 */
export function PuzzleSwitch({
  puzzle,
  disabled,
  onSwitch,
}: {
  puzzle: Puzzle
  disabled?: boolean
  onSwitch: (puzzle: Puzzle) => void
}) {
  const id = useId()
  return (
    <span className="puzzle-switch">
      <label htmlFor={id}>Puzzle</label>
      <select
        id={id}
        value={puzzle}
        disabled={disabled}
        onChange={(event) => {
          const chosen = event.currentTarget.value
          if (isPuzzle(chosen)) onSwitch(chosen)
        }}
      >
        {Object.entries(LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </span>
  )
}
