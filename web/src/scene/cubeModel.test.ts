import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Cube, SLOTS, parseMove } from '../cube/index.ts'
import type { Theme } from '../theme/theme.ts'
import { CubeModel } from './cubeModel.ts'
import { PAINT } from './look.ts'

// The two themes' backgrounds behind the Cube.
const DARK = '#11131a'
const LIGHT = '#f3f4f7'

const HIGHLIGHTED = 'white-green edge'

/** Every mesh the model draws, by id, with its color and where it is. */
function drawn(model: CubeModel): Map<string, { color: string; at: THREE.Vector3; sticker?: number }> {
  model.updateMatrixWorld(true)
  const meshes = new Map<string, { color: string; at: THREE.Vector3; sticker?: number }>()
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const material = object.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
    meshes.set(object.uuid, {
      color: material.color.getHexString(),
      at: object.getWorldPosition(new THREE.Vector3()),
      sticker: CubeModel.stickerOf(object),
    })
  })
  return meshes
}

/** How far apart two colors are, in sRGB. */
const distance = (a: string, b: string): number => {
  const [x, y] = [new THREE.Color(`#${a}`), new THREE.Color(b)].map((c) => c.getRGB(new THREE.Color(), THREE.SRGBColorSpace))
  return Math.hypot(x!.r - y!.r, x!.g - y!.g, x!.b - y!.b)
}

/** How colorful a color is: its strongest sRGB channel less its weakest. */
const chroma = (hex: string): number => {
  const { r, g, b } = new THREE.Color(hex).getRGB(new THREE.Color(), THREE.SRGBColorSpace)
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/** A solved Cube whose Pieces are all dimmed but one, faded toward background as theme fades them. */
function highlightedCube(background: string, theme: Theme): CubeModel {
  const model = new CubeModel(background, theme)
  model.show(Cube.solved())
  model.highlight([HIGHLIGHTED])
  return model
}

describe('CubeModel', () => {
  it.each<[Theme, string]>([
    ['dark', DARK],
    ['light', LIGHT],
  ])('fades dimmed Pieces toward the %s background behind the Cube, and leaves the highlighted Piece its paint', (theme, background) => {
    const cube = Cube.solved()
    const stickers = [...drawn(highlightedCube(background, theme)).values()].filter((mesh) => mesh.sticker !== undefined)
    const isHighlighted = (sticker: number): boolean =>
      cube.pieceAt(SLOTS.find((slot) => slot.stickers.includes(sticker))!.name) === HIGHLIGHTED

    const painted = stickers.filter(({ sticker }) => isHighlighted(sticker!))
    expect(painted).toHaveLength(2) // The highlighted edge's two Stickers.
    for (const { sticker, color } of painted) expect(`#${color}`).toBe(PAINT[cube.at(sticker!)])
    for (const { sticker, color } of stickers.filter((mesh) => !painted.includes(mesh))) {
      // On light, white is all but the background already: it has nowhere to fade.
      if (theme === 'light' && cube.at(sticker!) === 'white') continue
      expect(distance(color, background)).toBeLessThan(distance(PAINT[cube.at(sticker!)].slice(1), background))
    }
  })

  it.each<[Theme, string]>([
    ['dark', DARK],
    ['light', LIGHT],
  ])('keeps a quarter of each dimmed Sticker’s color in the %s theme, so the color still reads', (theme, background) => {
    const cube = Cube.solved()
    for (const { sticker, color } of drawn(highlightedCube(background, theme)).values()) {
      if (sticker === undefined || cube.at(sticker) === 'white') continue // White has no color to keep.
      expect(chroma(`#${color}`)).toBeGreaterThanOrEqual(chroma(PAINT[cube.at(sticker)]) / 4)
    }
  })

  it('restyles the dimmed Pieces at once when the theme changes, mid-Move, and nothing else', () => {
    const model = highlightedCube(DARK, 'dark')
    model.select(0)
    model.beginTurn(parseMove('R'))
    model.poseTurn(0.5)
    const before = drawn(model)

    model.fadeToward(LIGHT, 'light')
    const after = drawn(model)

    const changed = [...after].filter(([id, mesh]) => mesh.color !== before.get(id)?.color)
    // Every Sticker but the highlighted edge's two; not the plastic or the selection marker.
    expect(changed.map(([, mesh]) => mesh.sticker).filter((s) => s !== undefined)).toHaveLength(52)
    expect(changed).toHaveLength(52)
    for (const [, mesh] of changed) expect(distance(mesh.color, LIGHT)).toBeLessThan(distance(mesh.color, DARK))
    // The Move in progress is still posed where it was.
    for (const [id, mesh] of after) expect(mesh.at.distanceTo(before.get(id)!.at)).toBeLessThan(1e-9)
  })
})
