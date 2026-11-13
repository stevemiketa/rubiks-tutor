// The page's color theme. The learner's Theme setting is System, Light or
// Dark: System follows the OS's color scheme, live, and Light or Dark
// overrides it. A chosen Light or Dark is kept in browser storage and marked
// on the page's root as data-theme, which colors.css reads. index.html marks
// a saved one before the first paint; PageTheme keeps the page in step after
// that. The theme belongs to the browser: it's never sent to the server, and
// Snapshots and share links never carry it.

/** The learner's Theme setting. */
export type ThemeSetting = 'system' | 'light' | 'dark'

/** The theme the page shows. */
export type Theme = 'light' | 'dark'

/** The parts of browser storage the theme uses. window.localStorage is one. */
export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The page's root element, whose data-theme pins a chosen theme. */
export interface ThemeRoot {
  readonly dataset: DOMStringMap
}

/** Whether the OS asks for dark, and news when that changes: matchMedia('(prefers-color-scheme: dark)'). */
export interface OsColorScheme {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

/** The key a chosen Light or Dark is saved under. index.html's script reads it too. */
const KEY = 'cubular.theme'

export class PageTheme {
  readonly #storage: ThemeStorage | undefined
  readonly #root: ThemeRoot
  readonly #os: OsColorScheme | undefined
  readonly #listeners = new Set<() => void>()
  #setting: ThemeSetting

  /**
   * The theme of the page with this root, from the setting saved in storage.
   * Without storage, or with nothing readable saved, the setting is System.
   * Without os the OS is taken to be light, as browsers default to.
   */
  constructor(storage: ThemeStorage | undefined, root: ThemeRoot, os: OsColorScheme | undefined) {
    this.#storage = storage
    this.#root = root
    this.#os = os
    this.#setting = this.#load()
    this.#mark()
  }

  /** The learner's Theme setting. */
  get setting(): ThemeSetting {
    return this.#setting
  }

  /** The theme the page shows now. */
  get current(): Theme {
    if (this.#setting !== 'system') return this.#setting
    return this.#os?.matches ? 'dark' : 'light'
  }

  /**
   * Changes the setting, at once: saves Light or Dark, or forgets the choice
   * for System. When storage refuses, the choice still holds until a reload.
   */
  choose(setting: ThemeSetting): void {
    this.#setting = setting
    try {
      if (setting === 'system') this.#storage?.removeItem(KEY)
      else this.#storage?.setItem(KEY, setting)
    } catch {
      // Without storage the choice just won't survive a reload.
    }
    this.#mark()
    for (const listener of [...this.#listeners]) listener()
  }

  /** Calls onChange whenever the setting or the OS's color scheme changes. Returns the unsubscribe. */
  subscribe = (onChange: () => void): (() => void) => {
    this.#listeners.add(onChange)
    this.#os?.addEventListener('change', onChange)
    return () => {
      this.#listeners.delete(onChange)
      this.#os?.removeEventListener('change', onChange)
    }
  }

  #load(): ThemeSetting {
    try {
      const saved = this.#storage?.getItem(KEY)
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  }

  // Pins the page to a chosen theme; on System it unpins it, and colors.css
  // follows the OS.
  #mark(): void {
    if (this.#setting === 'system') delete this.#root.dataset.theme
    else this.#root.dataset.theme = this.#setting
  }
}
