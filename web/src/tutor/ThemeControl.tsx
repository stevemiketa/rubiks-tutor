import { useId } from 'react'
import type { ThemeSetting } from '../theme/theme.ts'
import { useThemeSetting } from '../theme/useTheme.ts'

/** Each Theme setting's name, in the order the control lists them. */
const LABELS: Readonly<Record<ThemeSetting, string>> = { system: 'System', light: 'Light', dark: 'Dark' }

const isSetting = (value: string): value is ThemeSetting => Object.hasOwn(LABELS, value)

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
          const chosen = event.currentTarget.value
          if (isSetting(chosen)) choose(chosen)
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
