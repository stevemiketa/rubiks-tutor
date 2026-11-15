// A still picture of the Cube: its top, front and right faces drawn as SVG
// from the cube model, framed as the 3D view's camera frames them. It needs
// no WebGL and never moves, so the splash page shows it under reduced motion.
import {
  DEFAULT_PUZZLE,
  FACES,
  SLOTS,
  faceNormal,
  stickerFace,
  type Cube,
  type Face,
  type Puzzle,
  type Sticker,
  type Vec,
} from '../cube/index.ts'
import { CAMERA, PAINT, PLASTIC, STICKER_SIZE } from './look.ts'
import { pieceLayout } from './pieceLayout.ts'

type Point = readonly [number, number]

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (v: Vec, s: number): Vec => [v[0] * s, v[1] * s, v[2] * s]
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v: Vec): Vec => scale(v, 1 / Math.sqrt(dot(v, v)))

// The camera looks from CAMERA.position at the Cube's center, with y up.
const EYE: Vec = CAMERA.position
const FORWARD = unit(scale(EYE, -1))
const RIGHT = unit(cross(FORWARD, [0, 1, 0]))
const UP = cross(RIGHT, FORWARD)
const FOCAL = 1 / Math.tan((CAMERA.fov * Math.PI) / 360)

/** Where a point shows in the square view, -1 to 1 each way, with y growing downward. */
function project(p: Vec): Point {
  const d = add(p, scale(EYE, -1))
  const depth = dot(d, FORWARD)
  return [(dot(d, RIGHT) / depth) * FOCAL, (-dot(d, UP) / depth) * FOCAL]
}

/** The corners of a square of side size centered on c, facing along normal, in order round it. */
function square(c: Vec, normal: Vec, size: number): string {
  const axis = normal.findIndex((n) => n !== 0)
  const e = (i: number): Vec => [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]
  const a = scale(e((axis + 1) % 3), size / 2)
  const b = scale(e((axis + 2) % 3), size / 2)
  const corners = [add(a, b), add(a, scale(b, -1)), scale(add(a, b), -1), add(scale(a, -1), b)]
  return corners.map((k) => project(add(c, k)).map((n) => n.toFixed(4)).join(',')).join(' ')
}

// The faces the camera sees, with how much each is shaded, as if lit from
// above and in front.
const SHADE: Partial<Record<Face, number>> = { U: 0, F: 0.12, R: 0.26 }
const VISIBLE = FACES.filter((f) => dot(faceNormal(f), add(EYE, scale(faceNormal(f), -1.5))) > 0)

// The 3x3 reference Piece size, the one the layout's sizes are measured in.
const PIECE_SIZE = 0.95

interface FaceShape {
  readonly face: Face
  readonly points: string
}
interface StickerShape {
  readonly sticker: Sticker
  readonly points: string
}

// The 3x3 draws its Pieces on a grid of unit spacing, so each face is 3 wide,
// trimmed a little to leave an edge; its Sticker sits half a cell proud of the
// Piece centre. Kept as it was so the picture is unchanged.
const CUBE_FACE_SHAPES: readonly FaceShape[] = VISIBLE.map((face) => ({
  face,
  points: square(scale(faceNormal(face), 1.5), faceNormal(face), 2.96),
}))
const CUBE_STICKER_SHAPES: readonly StickerShape[] = SLOTS.flatMap((slot) =>
  slot.stickers
    .filter((s) => VISIBLE.includes(stickerFace(s)))
    .map((sticker) => {
      const normal = faceNormal(stickerFace(sticker))
      return { sticker, points: square(add(slot.position, scale(normal, 0.5)), normal, STICKER_SIZE) }
    }),
)

// The Pocket Cube draws only its eight enlarged corner Pieces, each at its
// layout centre and size, so the picture shows the same true 2x2x2 as the 3D
// view (see pieceLayout). The outer surface of a corner is its half-size proud
// of its centre, which sets where each 2-wide face sits and how big it is.
function pocketShapes(): { faces: readonly FaceShape[]; stickers: readonly StickerShape[] } {
  const layout = pieceLayout('pocket')
  const visible = SLOTS.filter((slot) => layout.get(slot.name)?.visible)
  // A corner's outer surface, along the axis it faces: its centre plus half
  // its size. Every corner is the same size, so one reaches for all.
  const surface = visible.length === 0 ? 1.5 : Math.abs(layout.get(visible[0]!.name)!.position[0]) + layout.get(visible[0]!.name)!.size / 2
  const faces = VISIBLE.map((face) => ({
    face,
    // The 2x2 face is 2 corners wide; trim it as the 3x3's 2.96/3 does.
    points: square(scale(faceNormal(face), surface), faceNormal(face), (2 * surface * 2.96) / 3),
  }))
  const stickers = visible.flatMap((slot) => {
    const placement = layout.get(slot.name)!
    const factor = placement.size / PIECE_SIZE
    return slot.stickers
      .filter((s) => VISIBLE.includes(stickerFace(s)))
      .map((sticker) => {
        const normal = faceNormal(stickerFace(sticker))
        const centre = add(placement.position, scale(normal, placement.size / 2))
        return { sticker, points: square(centre, normal, STICKER_SIZE * factor) }
      })
  })
  return { faces, stickers }
}

const POCKET = pocketShapes()

function shapesFor(puzzle: Puzzle): { faces: readonly FaceShape[]; stickers: readonly StickerShape[] } {
  return puzzle === 'pocket' ? POCKET : { faces: CUBE_FACE_SHAPES, stickers: CUBE_STICKER_SHAPES }
}

/** The Cube as a still picture, the same size and from the same angle as CubeView shows it. */
export function CubePicture({
  cube,
  label,
  className,
  puzzle = DEFAULT_PUZZLE,
}: {
  cube: Cube
  label: string
  className?: string
  puzzle?: Puzzle
}) {
  const { faces, stickers } = shapesFor(puzzle)
  return (
    <div className={['cube-view', 'cube-picture', className].filter(Boolean).join(' ')} role="img" aria-label={label}>
      <svg viewBox="-1 -1 2 2" aria-hidden="true">
        {faces.map(({ face, points }) => (
          <polygon key={face} points={points} fill={PLASTIC} stroke={PLASTIC} strokeWidth={0.03} strokeLinejoin="round" />
        ))}
        {stickers.map(({ sticker, points }) => {
          const paint = PAINT[cube.at(sticker)]
          return <polygon key={sticker} points={points} fill={paint} stroke={paint} strokeWidth={0.008} strokeLinejoin="round" />
        })}
        {faces.map(({ face, points }) => (
          <polygon key={face} points={points} fill="#000" fillOpacity={SHADE[face] ?? 0} />
        ))}
      </svg>
    </div>
  )
}
