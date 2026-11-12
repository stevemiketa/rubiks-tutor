// The page's theme for React: one PageTheme over this browser's storage, the
// page's root element and the OS's color scheme.
import { useSyncExternalStore } from 'react'
import { browserStorage } from '../session/index.ts'
import { PageTheme, type Theme, type ThemeSetting } from './theme.ts'

let page: PageTheme | undefined

function pageTheme(): PageTheme {
  page ??= new PageTheme(
    browserStorage(),
    document.documentElement,
    window.matchMedia?.('(prefers-color-scheme: dark)'),
  )
  return page
}

/** The theme the page shows, kept current as the setting or the OS changes. */
export function useTheme(): Theme {
  const theme = pageTheme()
  return useSyncExternalStore(theme.subscribe, () => theme.current)
}

/** The learner's Theme setting, kept current, and the way to change it. */
export function useThemeSetting(): readonly [ThemeSetting, (setting: ThemeSetting) => void] {
  const theme = pageTheme()
  const setting = useSyncExternalStore(theme.subscribe, () => theme.setting)
  return [setting, (next) => theme.choose(next)]
}
