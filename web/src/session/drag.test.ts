// Snapping a drag: the 3D scene hands over the orientation a drag left the
// Cube in, as a quaternion, and gets back the Cube rotations to record.
import { describe, expect, it } from 'vitest'
import { Cube, formatMoves, type Color, type Vec } from '../cube/index.ts'
import { snapRotations, type Orientation } from './index.ts'

// Space as in the cube model: x toward R, y toward U, z toward F, so a
// positive angle turns counterclockwise as seen from an axis's tip (the
// right-hand rule, as in three.js).
const DEG = Math.PI / 180

function about(axis: Vec, degrees: number): Orientation {
  const length = Math.hypot(...axis)
  const s = Math.sin((degrees * DEG) / 2) / length
  return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: Math.cos((degrees * DEG) / 2) }
}

/** The orientation after turning by a, then by b, both about fixed axes in space. */
function then(a: Orientation, b: Orientation): Orientation {
  return {
    w: b.w * a.w - b.x * a.x - b.y * a.y - b.z * a.z,
    x: b.w * a.x + b.x * a.w + b.y * a.z - b.z * a.y,
    y: b.w * a.y - b.x * a.z + b.y * a.w + b.z * a.x,
    z: b.w * a.z + b.x * a.y - b.y * a.x + b.z * a.w,
  }
}

const UP: Vec = [0, 1, 0]
const RIGHT: Vec = [1, 0, 0]
const TOWARD_VIEWER: Vec = [0, 0, 1]
const IDENTITY: Orientation = { x: 0, y: 0, z: 0, w: 1 }

/** The colors of the top, front and right centers once the rotations are made on a solved Cube. */
function centers(orientation: Orientation): { U: Color; F: Color; R: Color } {
  const cube = Cube.solved().apply(snapRotations(orientation))
  return { U: cube.at(4), F: cube.at(22), R: cube.at(13) }
}

describe('snapRotations', () => {
  it('records nothing for a drag that ends where it started', () => {
    expect(snapRotations(IDENTITY)).toEqual([])
  })

  it('records nothing for a drag that ends less than halfway to a quarter turn', () => {
    expect(snapRotations(about(UP, 40))).toEqual([])
    expect(snapRotations(then(about(UP, -30), about(RIGHT, 25)))).toEqual([])
  })

  it('records nothing for a drag all the way round', () => {
    expect(snapRotations(about(UP, 360))).toEqual([])
    expect(snapRotations(about(RIGHT, -350))).toEqual([])
  })

  // Spec #3: y turns the Cube as U does, so the front goes to the left; x as
  // R does, so the front goes up; z as F does, clockwise as the viewer sees
  // it.
  it.each([
    ['the front to the left', UP, -90, 'y'],
    ['the front to the right', UP, 70, "y'"],
    ['the front up', RIGHT, -60, 'x'],
    ['the front down', RIGHT, 100, "x'"],
    ['the Cube clockwise', TOWARD_VIEWER, -80, 'z'],
    ['the Cube counterclockwise', TOWARD_VIEWER, 95, "z'"],
    ['the back round to the front', UP, 170, 'y2'],
    ['the Cube upside down', RIGHT, -185, 'x2'],
  ] as const)('records one Cube rotation for a drag that turns %s', (_, axis, degrees, moves) => {
    expect(formatMoves(snapRotations(about(axis, degrees)))).toBe(moves)
  })

  it('snaps an untidy drag to the nearest square-on orientation', () => {
    // Mostly a quarter turn to the left, with a wobble up and a slight roll.
    const drag = then(then(about(UP, -80), about(RIGHT, -20)), about(TOWARD_VIEWER, 10))
    expect(formatMoves(snapRotations(drag))).toBe('y')
  })

  it('records two Cube rotations for a drag left, then up', () => {
    // Left brings red to the front and blue to the right; up then lifts the
    // red front to the top and brings the yellow bottom to the front.
    const drag = then(about(UP, -90), about(RIGHT, -90))
    expect(snapRotations(drag)).toHaveLength(2)
    expect(centers(drag)).toEqual({ U: 'red', F: 'yellow', R: 'blue' })
  })

  it('records two Cube rotations for a drag round a corner', () => {
    // A third of a turn about the axis through the top-front-right corner
    // takes the right face to the top, the top to the front, and the front
    // to the right.
    const drag = about([1, 1, 1], 120)
    expect(snapRotations(drag)).toHaveLength(2)
    expect(centers(drag)).toEqual({ U: 'red', F: 'white', R: 'green' })
  })

  it('records two Cube rotations for a half turn about an edge', () => {
    // Half a turn about the axis through the front-right edge swaps the front
    // and right faces and turns the Cube upside down.
    const drag = about([1, 0, 1], 180)
    expect(snapRotations(drag)).toHaveLength(2)
    expect(centers(drag)).toEqual({ U: 'yellow', F: 'red', R: 'green' })
  })

  it('reaches each of the 24 square-on orientations with at most two Cube rotations', () => {
    const seen = new Set<string>()
    const turns = [0, 90, 180, 270]
    for (const a of turns) for (const b of turns) for (const c of turns) {
      const drag = then(then(about(UP, a), about(RIGHT, b)), about(TOWARD_VIEWER, c))
      const rotations = snapRotations(drag)
      expect(rotations.length).toBeLessThanOrEqual(2)
      seen.add(Cube.solved().apply(rotations).toString())
    }
    expect(seen.size).toBe(24)
  })
})
