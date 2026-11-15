import { describe, expect, it } from 'vitest'
import { SLOTS, type Vec } from '../cube/index.ts'
import { pieceLayout } from './pieceLayout.ts'

// The eight corner Slots: the ones whose position has no zero component.
const CORNERS = SLOTS.filter((slot) => slot.position.every((n) => n !== 0)).map((slot) => slot.name)
const NON_CORNERS = SLOTS.filter((slot) => slot.position.some((n) => n === 0)).map((slot) => slot.name)

describe('pieceLayout for the 3x3', () => {
  const layout = pieceLayout('cube')

  it('places every Piece on the unit grid at its Slot, unchanged', () => {
    for (const slot of SLOTS) {
      const placement = layout.get(slot.name)
      expect(placement?.position).toEqual(slot.position)
      expect(placement?.visible).toBe(true)
    }
  })

  it('draws all 26 Pieces at one size', () => {
    const sizes = new Set([...layout.values()].map((p) => p.size))
    expect(layout.size).toBe(26)
    expect(sizes.size).toBe(1)
    expect([...layout.values()].every((p) => p.visible)).toBe(true)
  })
})

describe('pieceLayout for the Pocket Cube', () => {
  const layout = pieceLayout('pocket')

  it('shows the eight corner Pieces and hides the eighteen others', () => {
    for (const name of CORNERS) expect(layout.get(name)?.visible, name).toBe(true)
    for (const name of NON_CORNERS) expect(layout.get(name)?.visible, name).toBe(false)
    const visible = [...layout.values()].filter((p) => p.visible)
    expect(visible).toHaveLength(8)
  })

  it('enlarges the corner Pieces beyond their 3x3 size', () => {
    const cube = pieceLayout('cube')
    for (const name of CORNERS) {
      expect(layout.get(name)!.size).toBeGreaterThan(cube.get(name)!.size)
    }
  })

  it('pulls each corner toward the centre, keeping its octant', () => {
    for (const slot of SLOTS.filter((s) => CORNERS.includes(s.name))) {
      const at = layout.get(slot.name)!.position
      // Same sign on every axis as the Slot: still the same corner of the Cube.
      slot.position.forEach((n, i) => expect(Math.sign(at[i]!)).toBe(Math.sign(n)))
      // Closer to the centre than the 3x3 grid position it came from.
      const distance = (v: Vec): number => Math.hypot(...v)
      expect(distance(at)).toBeLessThan(distance(slot.position))
    }
  })

  it('makes the eight corners a true 2x2x2: two along an axis just meet at the centre', () => {
    // UFR and DFR share the front-right edge but opposite U/D: their facing
    // surfaces should touch at (or near) the centre plane, with only the gap
    // between them, not overlap and not a 3x3's worth of space.
    const ufr = layout.get('UFR')!
    const dfr = layout.get('DFR')!
    const gap = ufr.position[1]! - ufr.size / 2 - (dfr.position[1]! + dfr.size / 2)
    expect(gap).toBeGreaterThanOrEqual(0) // They don't overlap.
    expect(gap).toBeLessThan(0.1) // They meet at the centre, bar the black gap.
  })
})
