// The Cube as three.js objects: 26 Pieces with their Stickers, a group that
// turns one Layer, and the selection marker. It draws a Cube state and poses
// one Move at a time; CubeView decides which Move and how far.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import {
  COLORS,
  SLOTS,
  faceNormal,
  moveAxis,
  stickerFace,
  type Color,
  type Cube,
  type Move,
  type Sticker,
  type Vec,
} from '../cube/index.ts'
import { PAINT, PLASTIC, STICKER_SIZE } from './look.ts'

/**
 * How far a dimmed Piece's Stickers fade toward this color, the Cube's
 * background: enough to step back, not so far that their colors are lost.
 */
const DIM_TOWARD = '#11131a'
const DIM_AMOUNT = 0.8

/** The selection marker's color: unlike any Sticker, and bright on black. */
const MARKER_COLOR = '#ff3fd2'

// Pieces sit on a grid of unit spacing; each is a little smaller, so a black
// gap shows between them.
const PIECE_SIZE = 0.95
const STICKER_LIFT = PIECE_SIZE / 2 + 0.002
const MARKER_LIFT = PIECE_SIZE / 2 + 0.006

function roundedSquare(size: number, radius: number): THREE.Shape {
  const h = size / 2
  const shape = new THREE.Shape()
  shape.moveTo(-h + radius, -h)
  shape.lineTo(h - radius, -h)
  shape.quadraticCurveTo(h, -h, h, -h + radius)
  shape.lineTo(h, h - radius)
  shape.quadraticCurveTo(h, h, h - radius, h)
  shape.lineTo(-h + radius, h)
  shape.quadraticCurveTo(-h, h, -h, h - radius)
  shape.lineTo(-h, -h + radius)
  shape.quadraticCurveTo(-h, -h, -h + radius, -h)
  return shape
}

const toVector = (v: Vec): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2])
const FACING = new THREE.Vector3(0, 0, 1)

// Each Sticker's Slot, so its mesh can sit on the right Piece.
const SLOT_OF = new Map(SLOTS.flatMap((slot) => slot.stickers.map((s) => [s, slot] as const)))

function slotOf(sticker: Sticker) {
  const slot = SLOT_OF.get(sticker)
  if (slot === undefined) throw new RangeError(`no Sticker ${sticker}`)
  return slot
}

// Smooth start and stop.
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * The Cube's meshes. Each Sticker mesh always stands for the same position
 * (Sticker index): between Moves every Piece is back at its Slot and show
 * repaints the Stickers, so no rounding builds up and what is drawn is
 * exactly the Cube state it was given.
 */
export class CubeModel extends THREE.Group {
  readonly #pieces = new THREE.Group()
  // The turning Layer: its Pieces move in here for the length of a Move and
  // the whole group rotates.
  readonly #layer = new THREE.Group()
  readonly #pieceBySlot = new Map<string, THREE.Group>()
  readonly #stickers: THREE.Mesh[] = []
  readonly #marker: THREE.Mesh
  readonly #paints: Readonly<Record<Color, THREE.Material>>
  readonly #dimPaints: Readonly<Record<Color, THREE.Material>>
  // The Cube state drawn, and the Pieces highlighted (by name), if any are.
  #cube: Cube | undefined
  #highlighted: ReadonlySet<string> | undefined
  readonly #disposables: { dispose(): void }[] = []
  #turn: { axis: THREE.Vector3; angle: number } | undefined

  constructor() {
    super()
    this.name = 'Cube'

    const body = new RoundedBoxGeometry(PIECE_SIZE, PIECE_SIZE, PIECE_SIZE, 3, 0.08)
    const plastic = new THREE.MeshStandardMaterial({ color: PLASTIC, roughness: 0.55 })
    const sticker = new THREE.ShapeGeometry(roundedSquare(STICKER_SIZE, 0.09))
    const paints = {} as Record<Color, THREE.Material>
    const dimPaints = {} as Record<Color, THREE.Material>
    for (const c of COLORS) {
      paints[c] = new THREE.MeshStandardMaterial({ color: PAINT[c], roughness: 0.4 })
      const dim = new THREE.Color(PAINT[c]).lerp(new THREE.Color(DIM_TOWARD), DIM_AMOUNT)
      dimPaints[c] = new THREE.MeshStandardMaterial({ color: dim, roughness: 0.6 })
    }
    this.#paints = paints
    this.#dimPaints = dimPaints

    for (const slot of SLOTS) {
      const piece = new THREE.Group()
      piece.name = slot.name
      piece.position.copy(toVector(slot.position))
      piece.add(new THREE.Mesh(body, plastic))
      this.#pieceBySlot.set(slot.name, piece)
      this.#pieces.add(piece)
    }
    for (let s = 0; s < 54; s++) {
      const normal = toVector(faceNormal(stickerFace(s)))
      const mesh = new THREE.Mesh(sticker, paints.white)
      mesh.position.copy(normal).multiplyScalar(STICKER_LIFT)
      mesh.quaternion.setFromUnitVectors(FACING, normal)
      mesh.userData.sticker = s
      this.#pieceBySlot.get(slotOf(s).name)?.add(mesh)
      this.#stickers.push(mesh)
    }

    const ring = roundedSquare(PIECE_SIZE - 0.02, 0.12)
    ring.holes.push(roundedSquare(STICKER_SIZE + 0.04, 0.1))
    const ringGeometry = new THREE.ShapeGeometry(ring)
    const markerPaint = new THREE.MeshBasicMaterial({ color: MARKER_COLOR })
    this.#marker = new THREE.Mesh(ringGeometry, markerPaint)
    this.#marker.visible = false
    // Clicks go through the marker to the Sticker under it.
    this.#marker.raycast = () => {}

    this.add(this.#pieces, this.#layer, this.#marker)
    this.#disposables.push(
      body,
      plastic,
      sticker,
      ringGeometry,
      markerPaint,
      ...Object.values(paints),
      ...Object.values(dimPaints),
    )
  }

  /** The Sticker a pointer hit, if it hit one. */
  static stickerOf(object: THREE.Object3D): Sticker | undefined {
    const sticker: unknown = object.userData.sticker
    return typeof sticker === 'number' ? sticker : undefined
  }

  /** Paints every Sticker from a Cube state. Call it only between Moves. */
  show(cube: Cube): void {
    this.#cube = cube
    this.#paint()
  }

  /**
   * Highlights some Pieces, by name, and dims all the others; undefined
   * highlights none and dims none. A Piece is found by its colors wherever
   * it is, so the highlight follows it through every Move. Mid-Move, the
   * Pieces turning keep it as they turn.
   */
  highlight(pieces: readonly string[] | undefined): void {
    this.#highlighted = pieces && new Set(pieces)
    this.#paint()
  }

  // Paints each Sticker its color in the Cube state drawn, dimmed unless its
  // Piece is highlighted (when some are).
  #paint(): void {
    const cube = this.#cube
    if (cube === undefined) return
    const highlighted = this.#highlighted
    const dimmed = new Set<string>()
    if (highlighted !== undefined) {
      for (const slot of SLOTS) if (!highlighted.has(cube.pieceAt(slot.name))) dimmed.add(slot.name)
    }
    this.#stickers.forEach((mesh, s) => {
      mesh.material = (dimmed.has(slotOf(s).name) ? this.#dimPaints : this.#paints)[cube.at(s)]
    })
  }

  /** Marks a Sticker's position as selected, or clears the marker. */
  select(sticker: Sticker | undefined): void {
    this.#marker.visible = sticker !== undefined
    if (sticker === undefined) return
    const normal = toVector(faceNormal(stickerFace(sticker)))
    this.#marker.position.copy(toVector(slotOf(sticker).position)).addScaledVector(normal, MARKER_LIFT)
    this.#marker.quaternion.setFromUnitVectors(FACING, normal)
  }

  /** Gathers the Pieces a Move turns into one group, ready to rotate. */
  beginTurn(move: Move): void {
    this.endTurn()
    const { axis, depth } = moveAxis(move)
    for (const slot of SLOTS) {
      const along = slot.position[0] * axis[0] + slot.position[1] * axis[1] + slot.position[2] * axis[2]
      if (depth === 'all' || along === depth) {
        const piece = this.#pieceBySlot.get(slot.name)
        if (piece) this.#layer.add(piece)
      }
    }
    // A positive angle turns counterclockwise as seen from the axis's tip.
    this.#turn = { axis: toVector(axis), angle: (-move.amount * Math.PI) / 2 }
  }

  /** Rotates the turning group to a fraction (0 to 1) of the Move, eased. */
  poseTurn(fraction: number): void {
    if (this.#turn === undefined) return
    const t = ease(Math.min(Math.max(fraction, 0), 1))
    this.#layer.quaternion.setFromAxisAngle(this.#turn.axis, this.#turn.angle * t)
  }

  /** Puts every Piece back in its Slot. Follow with show for the new state. */
  endTurn(): void {
    for (const piece of [...this.#layer.children]) this.#pieces.add(piece)
    this.#layer.quaternion.identity()
    this.#turn = undefined
  }

  /** Frees the GPU resources. */
  dispose(): void {
    for (const d of this.#disposables) d.dispose()
  }
}
