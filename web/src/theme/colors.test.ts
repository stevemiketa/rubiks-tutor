// The color tokens in both themes, read from the CSS that defines them, so a
// retune can't silently break contrast.
import { describe, expect, it } from 'vitest'
import appCss from '../index.css?raw'
import { PLASTIC } from '../scene/look.ts'
import tokensCss from './colors.css?raw'

type Theme = 'light' | 'dark'
const THEMES: readonly Theme[] = ['light', 'dark']

/** A color as sRGB channels, 0 to 255, and alpha, 0 to 1. */
interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

function parseColor(text: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1]
  if (hex !== undefined) {
    const digits = hex.length === 3 ? [...hex].map((d) => d + d) : [0, 2, 4].map((i) => hex.slice(i, i + 2))
    const [r = 0, g = 0, b = 0] = digits.map((d) => parseInt(d, 16))
    return { r, g, b, a: 1 }
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(text)
  if (rgb !== null) {
    const [, r = '', g = '', b = '', a = '1'] = rgb
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }
  }
  throw new Error(`can't read the color ${text}`)
}

// Splits light-dark(a, b) into a and b; a value without it is the same in both.
function themeValues(value: string): Record<Theme, Rgba> {
  const pair = /^light-dark\((.*)\)$/.exec(value)?.[1]
  if (pair === undefined) return { light: parseColor(value), dark: parseColor(value) }
  let depth = 0
  for (let i = 0; i < pair.length; i++) {
    if (pair[i] === '(') depth++
    else if (pair[i] === ')') depth--
    else if (pair[i] === ',' && depth === 0) {
      return { light: parseColor(pair.slice(0, i).trim()), dark: parseColor(pair.slice(i + 1).trim()) }
    }
  }
  throw new Error(`light-dark() needs two colors: ${value}`)
}

/** Every --color-* token defined, by name without the prefix. */
const TOKENS: ReadonlyMap<string, Record<Theme, Rgba>> = new Map(
  [...tokensCss.matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [
    name,
    themeValues(value.trim()),
  ]),
)

function token(name: string, theme: Theme): Rgba {
  const value = TOKENS.get(name)
  if (value === undefined) throw new Error(`no token --color-${name}`)
  return value[theme]
}

// WCAG 2.2's relative luminance and contrast ratio.
const linear = (channel: number): number => {
  const s = channel / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ({ r, g, b }: Rgba): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const ratio = (a: Rgba, b: Rgba): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}
const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
})
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 }
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

/**
 * The contrast of a color on a background. A see-through background is
 * checked over both black and white, so it holds whatever shows through.
 */
const contrast = (color: Rgba, background: Rgba): number =>
  Math.min(ratio(color, over(background, BLACK)), ratio(color, over(background, WHITE)))

/** The hue of a color, in degrees. */
function hue({ r, g, b }: Rgba): number {
  const max = Math.max(r, g, b)
  const range = max - Math.min(r, g, b)
  const h = max === r ? ((g - b) / range) % 6 : max === g ? (b - r) / range + 2 : (r - g) / range + 4
  return (h * 60 + 360) % 360
}

const SPLASH = ['splash-1', 'splash-2', 'splash-3', 'splash-4']

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for control borders, focus rings and the
// other graphics a learner needs to see, each against what it's drawn on.
const TEXT = 4.5
const GRAPHIC = 3
const PAIRS: readonly (readonly [color: string, backgrounds: readonly string[], minimum: number])[] = [
  [
    'text',
    [
      'bg',
      'surface',
      'surface-overlay',
      'surface-raised',
      'surface-card',
      'surface-warning',
      'control',
      'control-hover',
      'field',
      'danger',
      'danger-hover',
      ...SPLASH,
    ],
    TEXT,
  ],
  ['text-muted', ['bg', 'surface', 'surface-raised', 'surface-card'], TEXT],
  ['link', ['bg', 'surface', 'surface-card'], TEXT],
  ['on-accent', ['accent', 'accent-hover'], TEXT],
  ['on-success', ['success'], TEXT],
  ['on-warning', ['warning'], TEXT],
  ['splash-subtitle', SPLASH, TEXT],
  ['border-control', ['bg', 'surface', 'surface-raised'], GRAPHIC],
  ['focus', ['bg', 'surface', 'surface-raised'], GRAPHIC],
  ['accent', ['bg', 'surface'], GRAPHIC],
  ['danger-border', ['surface', 'surface-raised'], GRAPHIC],
  ['warning', ['surface', 'surface-raised', 'surface-warning'], GRAPHIC],
  ['caution', ['surface', 'surface-raised'], GRAPHIC],
  ['hint', ['bg', 'surface-raised'], GRAPHIC],
]

/**
 * Tokens no contrast rule covers: decoration, and the text of disabled
 * controls, which WCAG exempts (SC 1.4.3). A new token must join PAIRS or
 * this list.
 */
const UNCHECKED = [
  'border',
  'text-disabled',
  'accent-glow',
  'backdrop',
  'splash-title-shadow',
  'splash-subtitle-shadow',
]

describe('the color tokens', () => {
  it.each(THEMES)('meet WCAG 2.2 AA in the %s theme: 4.5:1 for text, 3:1 for borders and focus rings', (theme) => {
    const failures = PAIRS.flatMap(([color, backgrounds, minimum]) =>
      backgrounds
        .map((background) => ({ color, background, minimum, ratio: contrast(token(color, theme), token(background, theme)) }))
        .filter((pair) => pair.ratio < pair.minimum)
        .map((pair) => `--color-${pair.color} on --color-${pair.background}: ${pair.ratio.toFixed(2)}:1, below ${pair.minimum}:1`),
    )
    expect(failures).toEqual([])
  })

  it('are each checked for contrast, or known to need no check', () => {
    const checked = new Set([...PAIRS.flatMap(([color, backgrounds]) => [color, ...backgrounds]), ...UNCHECKED])
    expect([...TOKENS.keys()].filter((name) => !checked.has(name))).toEqual([])
    expect([...checked].filter((name) => !TOKENS.has(name))).toEqual([])
  })

  // Within 2°, as near as 8-bit channels allow.
  it.each(THEMES)('keep the blue accent at the hue of today’s #3b82f6, 217°, in the %s theme', (theme) => {
    for (const name of ['accent', 'accent-hover', 'link', 'focus']) {
      expect(Math.abs(hue(token(name, theme)) - 217), `--color-${name}`).toBeLessThan(2)
    }
  })

  it.each(THEMES)('keep the hint’s pink at the selection marker’s hue, 314°, in the %s theme', (theme) => {
    expect(Math.abs(hue(token('hint', theme)) - 314)).toBeLessThan(2)
  })

  it('keep the Cube’s black plastic readable against the light background', () => {
    expect(contrast(parseColor(PLASTIC), token('bg', 'light'))).toBeGreaterThanOrEqual(GRAPHIC)
  })
})

describe('the app’s CSS', () => {
  const lines = appCss.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')

  it('takes every color from a color token', () => {
    const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|\b(?:white|black)\b/i
    expect(lines.filter((line) => literal.test(line)).map((line) => line.trim())).toEqual([])
  })

  it('uses only color tokens that are defined', () => {
    const used = new Set([...appCss.matchAll(/var\(--color-([a-z0-9-]+)/g)].map(([, name = '']) => name))
    expect(used.size).toBeGreaterThan(0)
    expect([...used].filter((name) => !TOKENS.has(name))).toEqual([])
  })
})
