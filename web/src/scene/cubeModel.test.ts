import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Cube, parseMove } from '../cube/index.ts'
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

/** A solved Cube whose Pieces are all dimmed but one, faded toward background. */
function highlightedCube(background: string): CubeModel {
  const model = new CubeModel(background)
  model.show(Cube.solved())
  model.highlight([HIGHLIGHTED])
  return model
}

describe('CubeModel', () => {
  it.each([
    ['dark', DARK],
    ['light', LIGHT],
  ])('fades dimmed Pieces toward the %s background behind the Cube, and leaves the highlighted Piece its paint', (_, background) => {
    const cube = Cube.solved()
    const stickers = [...drawn(highlightedCube(background)).values()].filter((mesh) => mesh.sticker !== undefined)

    const painted = stickers.filter(({ sticker, color }) => `#${color}` === PAINT[cube.at(sticker!)])
    expect(painted).toHaveLength(2) // The highlighted edge's two Stickers.
    for (const { sticker, color } of stickers.filter((mesh) => !painted.includes(mesh))) {
      expect(distance(color, background)).toBeLessThan(distance(color, PAINT[cube.at(sticker!)]))
    }
  })

  it('restyles the dimmed Pieces at once when the background changes, mid-Move, and nothing else', () => {
    const model = highlightedCube(DARK)
    model.select(0)
    model.beginTurn(parseMove('R'))
    model.poseTurn(0.5)
    const before = drawn(model)

    model.fadeToward(LIGHT)
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
