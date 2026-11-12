import { describe, expect, it } from 'vitest'
import { PageTheme, type ThemeSetting, type ThemeStorage } from './theme.ts'

// Browser storage as the page sees it: a Map behind Storage's interface.
class MemoryStorage {
  readonly items = new Map<string, string>()
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
  removeItem(key: string): void {
    this.items.delete(key)
  }
}

// The OS's color scheme as matchMedia('(prefers-color-scheme: dark)') reports
// it, which the test can change as the learner would in their settings.
class OsColorScheme {
  matches: boolean
  readonly #listeners = new Set<() => void>()
  constructor(dark: boolean) {
    this.matches = dark
  }
  addEventListener(_: 'change', listener: () => void): void {
    this.#listeners.add(listener)
  }
  removeEventListener(_: 'change', listener: () => void): void {
    this.#listeners.delete(listener)
  }
  /** Switches the OS to dark or light. */
  set(dark: boolean): void {
    this.matches = dark
    for (const listener of [...this.#listeners]) listener()
  }
}

// The page's root element: colors.css reads its data-theme.
const pageRoot = () => ({ dataset: {} as DOMStringMap })

function open({ storage = new MemoryStorage(), osDark = false }: { storage?: ThemeStorage; osDark?: boolean } = {}) {
  const root = pageRoot()
  const os = new OsColorScheme(osDark)
  return { theme: new PageTheme(storage, root, os), root, os, storage }
}

describe('PageTheme', () => {
  it('is on System by default and follows the OS: light on a light OS, dark on a dark one', () => {
    const light = open({ osDark: false })
    expect(light.theme.setting).toBe('system')
    expect(light.theme.current).toBe('light')
    expect(light.root.dataset.theme).toBeUndefined()

    expect(open({ osDark: true }).theme.current).toBe('dark')
  })

  it.each([
    ['dark', 'light', false],
    ['light', 'dark', true],
  ] as const)('choosing %s saves it under cubular.theme and shows it whatever the OS says', (chosen, _, osDark) => {
    const storage = new MemoryStorage()
    const { theme, root } = open({ storage, osDark })

    theme.choose(chosen)

    expect(theme.setting).toBe(chosen)
    expect(theme.current).toBe(chosen)
    expect(root.dataset.theme).toBe(chosen)
    expect([...storage.items]).toEqual([['cubular.theme', chosen]])
  })

  it('choosing System removes the saved choice and follows the OS again', () => {
    const storage = new MemoryStorage()
    const { theme, root } = open({ storage, osDark: true })
    theme.choose('light')

    theme.choose('system')

    expect(theme.setting).toBe('system')
    expect(theme.current).toBe('dark')
    expect(root.dataset.theme).toBeUndefined()
    expect(storage.items.size).toBe(0)
  })

  it('keeps a choice for the next visit, and shows it from the start', () => {
    const storage = new MemoryStorage()
    open({ storage, osDark: true }).theme.choose('light')

    const next = open({ storage, osDark: true })

    expect(next.theme.setting).toBe('light')
    expect(next.theme.current).toBe('light')
    expect(next.root.dataset.theme).toBe('light')
  })

  it.each([
    ['an empty value', ''],
    ['another word', 'blue'],
    ['the wrong case', 'Dark'],
    ['JSON', '"dark"'],
    ['System itself', 'system'],
  ])('reads %s as System', (_, saved) => {
    const storage = new MemoryStorage()
    storage.setItem('cubular.theme', saved)
    const { theme, root } = open({ storage })
    expect(theme.setting).toBe('system')
    expect(root.dataset.theme).toBeUndefined()
  })

  it('works without storage, for this visit only', () => {
    const refusing: ThemeStorage = {
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
      removeItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    }
    for (const storage of [undefined, refusing]) {
      const root = pageRoot()
      const theme = new PageTheme(storage, root, new OsColorScheme(false))
      expect(theme.setting).toBe('system')

      for (const setting of ['dark', 'system', 'light'] as const satisfies readonly ThemeSetting[]) {
        expect(() => theme.choose(setting)).not.toThrow()
        expect(theme.setting).toBe(setting)
      }
      expect(theme.current).toBe('light')
      expect(root.dataset.theme).toBe('light')
    }
  })

  it('follows the OS without matchMedia as light, the browser default', () => {
    expect(new PageTheme(new MemoryStorage(), pageRoot(), undefined).current).toBe('light')
  })

  it('tells subscribers of every change: a choice, and the OS changing while on System', () => {
    const { theme, os } = open({ osDark: false })
    const seen: string[] = []
    const unsubscribe = theme.subscribe(() => seen.push(`${theme.setting}:${theme.current}`))

    os.set(true)
    theme.choose('light')
    os.set(false)
    os.set(true)
    theme.choose('system')
    unsubscribe()
    os.set(false)
    theme.choose('dark')

    // The OS changing under Light changes nothing the page shows.
    expect(seen.filter((change, i) => change !== seen[i - 1])).toEqual(['system:dark', 'light:light', 'system:dark'])
  })
})
