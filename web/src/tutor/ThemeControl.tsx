import { useId } from 'react'
import type { ThemeSetting } from '../theme/theme.ts'
import { useThemeSetting } from '../theme/useTheme.ts'

const SETTINGS: readonly (readonly [ThemeSetting, string])[] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
]

/**
 * The Theme control: System follows the OS; Light or Dark overrides it in
 * this browser. A change applies at once.
 */
export function ThemeControl() {
  const id = useId()
  const [setting, choose] = useThemeSetting()
  return (
    <span className="theme-control">
      <label htmlFor={id}>Theme</label>
      <select
        id={id}
        value={setting}
        onChange={(event) => {
          const chosen = SETTINGS.find(([value]) => value === event.currentTarget.value)
          if (chosen !== undefined) choose(chosen[0])
        }}
      >
        {SETTINGS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </span>
  )
}
