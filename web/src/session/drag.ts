// Dragging empty space turns the whole Cube freely. When the drag ends, the
// Cube snaps to the nearest square-on orientation, and the Session records
// the Cube rotations that produce it. The 3D scene owns the dragging; this
// works out what to record.
import { LETTERS, isRotation, moveAxis, type Amount, type Move } from '../cube/index.ts'

/**
 * How a drag has turned the whole Cube from where it started, as a unit
 * quaternion in the cube model's space (x toward R, y toward U, z toward F),
 * with positive angles counterclockwise as seen from an axis's tip. A
 * three.js Quaternion is one.
 */
export interface Orientation {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

const AMOUNTS: readonly Amount[] = [1, -1, 2]

const ROTATIONS: readonly Move[] = LETTERS.flatMap((letter) => AMOUNTS.map((amount) => ({ letter, amount }))).filter(
  isRotation,
)

// A Move turns clockwise as seen from its axis's tip, which is a negative
// angle by the right-hand rule.
function orientationOf(move: Move): Orientation {
  const { axis } = moveAxis(move)
  const half = (-move.amount * Math.PI) / 4
  const s = Math.sin(half)
  return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: Math.cos(half) }
}

/** Turning by a, then by b, both about axes fixed in space. */
function then(a: Orientation, b: Orientation): Orientation {
  return {
    w: b.w * a.w - b.x * a.x - b.y * a.y - b.z * a.z,
    x: b.w * a.x + b.x * a.w + b.y * a.z - b.z * a.y,
    y: b.w * a.y - b.x * a.z + b.y * a.w + b.z * a.x,
    z: b.w * a.z + b.x * a.y - b.y * a.x + b.z * a.w,
  }
}

// How alike two orientations are: 1 for the same, falling with the angle
// between them. A quaternion and its negation are the same orientation.
const likeness = (a: Orientation, b: Orientation): number => Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)

const IDENTITY: Orientation = { x: 0, y: 0, z: 0, w: 1 }

// Each of the 24 square-on orientations, with the fewest Cube rotations that
// reach it: none, one, or two (every orientation needs at most two).
// Shorter sequences come first, and among equals x before y before z.
const SQUARE_ON: readonly { readonly orientation: Orientation; readonly rotations: readonly Move[] }[] = (() => {
  const candidates = [
    { orientation: IDENTITY, rotations: [] as Move[] },
    ...ROTATIONS.map((m) => ({ orientation: orientationOf(m), rotations: [m] })),
    ...ROTATIONS.flatMap((a) =>
      ROTATIONS.filter((b) => b.letter !== a.letter).map((b) => ({
        orientation: then(orientationOf(a), orientationOf(b)),
        rotations: [a, b],
      })),
    ),
  ]
  const found: typeof candidates = []
  for (const c of candidates) {
    if (!found.some((f) => likeness(f.orientation, c.orientation) > 0.999)) found.push(c)
  }
  if (found.length !== 24) throw new Error(`found ${found.length} square-on orientations, not 24`)
  return found
})()

/**
 * The Cube rotations to record when a drag ends: at most two, which turn the
 * Cube from where the drag started to the square-on orientation nearest
 * where it ended, or none if that is where it started.
 */
export function snapRotations(orientation: Orientation): Move[] {
  const nearest = SQUARE_ON.reduce((best, c) =>
    likeness(c.orientation, orientation) > likeness(best.orientation, orientation) ? c : best,
  )
  return [...nearest.rotations]
}
