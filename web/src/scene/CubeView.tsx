// The 3D Cube, from a fixed camera that sees the front, top and right faces.
// It shows a MoveQueue: the queue's Cube at rest, and each queued Move
// animated in turn. The tutor and the splash page both draw the Cube with it.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { moveAxis, type Move, type Sticker } from '../cube/index.ts'
import { QUARTER_TURN_MS, snapRotations, type MoveQueue, type QueuedMove } from '../session/index.ts'
import { CubeModel } from './cubeModel.ts'

/** Where the fixed camera sits, looking at the Cube's center. */
const CAMERA = { position: [5, 4.6, 7.6] as const, fov: 37 }

export interface CubeViewProps {
  /** What to show and animate. */
  readonly queue: MoveQueue
  /** The selected Sticker's position, marked on the Cube. */
  readonly selected?: Sticker
  /** Called when the learner clicks or taps a Sticker. Omit for a Cube that can't be clicked. */
  readonly onSelect?: (sticker: Sticker) => void
  /** Which Stickers onSelect accepts, for the pointer cursor. All of them if omitted. */
  readonly selectable?: (sticker: Sticker) => boolean
  /**
   * Called when a drag of the empty space around the Cube ends, with the
   * Cube rotations (none, one or two) to the square-on orientation nearest
   * where it ended. It should queue them with durationMs 0, as
   * Tutor.recordDrag does, since the drag already showed them. Omit for a
   * Cube that can't be dragged.
   */
  readonly onRotate?: (rotations: readonly Move[]) => void
  /** A text description of the view, for screen readers. */
  readonly label: string
  readonly className?: string
}

export function CubeView({ queue, selected, onSelect, selectable, onRotate, label, className }: CubeViewProps) {
  const classes = ['cube-view', onRotate && 'draggable', className].filter(Boolean).join(' ')
  return (
    <div className={classes} role="img" aria-label={label}>
      {/* flat: no tone mapping, so the Stickers keep their true colors. */}
      <Canvas frameloop="demand" flat dpr={[1, 2]} camera={{ position: [...CAMERA.position], fov: CAMERA.fov }}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[3, 8, 5]} intensity={1.8} />
        <directionalLight position={[-4, -2, 6]} intensity={0.5} />
        <AnimatedCube queue={queue} selected={selected} onSelect={onSelect} selectable={selectable} onRotate={onRotate} />
      </Canvas>
    </div>
  )
}

type AnimatedCubeProps = Pick<CubeViewProps, 'queue' | 'selected' | 'onSelect' | 'selectable' | 'onRotate'>

// A drag turns the Cube this far for each pixel, so dragging across half the
// view makes about a quarter turn.
const RADIANS_PER_VIEW_HEIGHT = Math.PI
// How fast the Cube settles square-on once a drag ends: as fast as a Cube
// rotation animates.
const SETTLE_RADIANS_PER_SECOND = Math.PI / 2 / (QUARTER_TURN_MS / 1000)
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const SQUARE_ON = new THREE.Quaternion()

/** The turn a Move makes, as three.js sees it: clockwise from the axis's tip is a negative angle. */
function quaternionOf(move: Move): THREE.Quaternion {
  const [x, y, z] = moveAxis(move).axis
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), (-move.amount * Math.PI) / 2)
}

const prefersReducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function AnimatedCube({ queue, selected, onSelect, selectable, onRotate }: AnimatedCubeProps) {
  const model = useMemo(() => new CubeModel(), [])
  // Turns the whole Cube while it is dragged and as it settles square-on.
  // The Moves it shows are in the model, so between drags it is at rest.
  const dragGroup = useMemo(() => new THREE.Group(), [])
  const invalidate = useThree((state) => state.invalidate)
  const canvas = useThree((state) => state.gl.domElement)
  const camera = useThree((state) => state.camera)
  // The Move being animated and how far into it the animation is.
  const animation = useRef<{ item: QueuedMove; elapsedMs: number } | undefined>(undefined)
  // The pointer dragging the Cube, and where it last was.
  const dragging = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined)
  // A finished drag's Cube rotations, once recorded: until the queue shows
  // the last of them, the drag group holds the Cube where the drag left it.
  // Then the group takes the rest of the way to square-on, and settles.
  const snap = useRef<{ last: QueuedMove; rest: THREE.Quaternion } | undefined>(undefined)

  useEffect(() => () => model.dispose(), [model])

  // Render a frame whenever the queue changes; useFrame then animates.
  useEffect(() => {
    invalidate()
    return queue.subscribe(invalidate)
  }, [queue, invalidate])

  useEffect(() => {
    model.select(selected)
    invalidate()
  }, [model, selected, invalidate])

  useEffect(() => {
    if (onRotate === undefined) return
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const hitsCube = (event: PointerEvent): boolean => {
      const rect = canvas.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObject(model, true).length > 0
    }

    const onPointerDown = (event: PointerEvent) => {
      // Only empty space drags, and only from rest, so a drag always starts
      // from the Cube the Session has.
      if (!event.isPrimary || event.button !== 0 || dragging.current !== undefined) return
      if (snap.current !== undefined || !queue.isIdle || hitsCube(event)) return
      canvas.setPointerCapture(event.pointerId)
      dragging.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.style.cursor = 'grabbing'
    }

    const yaw = new THREE.Quaternion()
    const pitch = new THREE.Quaternion()
    const across = new THREE.Vector3()
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragging.current
      if (drag === undefined || event.pointerId !== drag.pointerId) return
      const radiansPerPixel = RADIANS_PER_VIEW_HEIGHT / Math.max(canvas.clientHeight, 1)
      // Sideways turns the Cube about its vertical axis; up and down about
      // the screen's horizontal axis, so the Cube follows the pointer.
      yaw.setFromAxisAngle(WORLD_UP, (event.clientX - drag.x) * radiansPerPixel)
      across.set(1, 0, 0).applyQuaternion(camera.quaternion)
      pitch.setFromAxisAngle(across, (event.clientY - drag.y) * radiansPerPixel)
      dragGroup.quaternion.premultiply(yaw).premultiply(pitch).normalize()
      drag.x = event.clientX
      drag.y = event.clientY
      invalidate()
    }

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragging.current
      if (drag === undefined || event.pointerId !== drag.pointerId) return
      dragging.current = undefined
      canvas.style.cursor = ''
      invalidate()
      const rotations = snapRotations(dragGroup.quaternion)
      if (rotations.length === 0) return // It settles back where it started.
      const queued = queue.pending.length
      onRotate(rotations)
      const last = queue.pending.at(-1)
      if (last === undefined || queue.pending.length === queued) return
      const turned = rotations.reduce((q, m) => q.premultiply(quaternionOf(m)), new THREE.Quaternion())
      snap.current = { last, rest: dragGroup.quaternion.clone().multiply(turned.invert()) }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [onRotate, canvas, camera, model, dragGroup, queue, invalidate])

  useFrame((_, delta) => {
    let active = animation.current
    if (active !== undefined && active.item !== queue.current) {
      // The queue dropped this Move (MoveQueue.jump).
      model.endTurn()
      active = undefined
    }
    // Starting from rest, delta is the idle time before this frame, which
    // mustn't count toward the first Move. Otherwise time carries over from
    // one Move to the next, so fast sequences keep their pace.
    let budgetMs = active === undefined ? 0 : delta * 1000
    for (;;) {
      if (active === undefined) {
        const item = queue.current
        if (item === undefined) break
        model.show(queue.shown)
        model.beginTurn(item.move)
        active = { item, elapsedMs: 0 }
      }
      const remainingMs = active.item.durationMs - active.elapsedMs
      if (budgetMs < remainingMs) {
        active.elapsedMs += budgetMs
        model.poseTurn(active.elapsedMs / active.item.durationMs)
        break
      }
      budgetMs -= remainingMs
      model.endTurn()
      queue.finish(active.item)
      active = undefined
    }
    animation.current = active
    if (active === undefined) model.show(queue.shown)
    else invalidate()

    // The model now shows the drag's Cube rotations (or the queue dropped
    // them), so the group keeps only what is left of the drag.
    if (snap.current !== undefined && !queue.pending.includes(snap.current.last)) {
      dragGroup.quaternion.copy(snap.current.rest)
      snap.current = undefined
    }
    if (dragging.current === undefined && snap.current === undefined && dragGroup.quaternion.angleTo(SQUARE_ON) > 0) {
      const step = prefersReducedMotion() ? Math.PI : SETTLE_RADIANS_PER_SECOND * Math.min(delta, 0.05)
      dragGroup.quaternion.rotateTowards(SQUARE_ON, step)
      invalidate()
    }
  })

  const stickerAt = (event: ThreeEvent<PointerEvent | MouseEvent>): Sticker | undefined => {
    const sticker = CubeModel.stickerOf(event.object)
    return sticker !== undefined && (selectable?.(sticker) ?? true) ? sticker : undefined
  }

  if (onSelect === undefined) {
    return (
      <primitive object={dragGroup}>
        <primitive object={model} />
      </primitive>
    )
  }
  return (
    <primitive object={dragGroup}>
      <primitive
        object={model}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          // Only the nearest thing under the pointer counts.
          event.stopPropagation()
          const sticker = stickerAt(event)
          if (sticker !== undefined) onSelect(sticker)
        }}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          if (dragging.current !== undefined) return
          canvas.style.cursor = stickerAt(event) === undefined ? 'default' : 'pointer'
        }}
        onPointerOut={() => {
          if (dragging.current === undefined) canvas.style.cursor = ''
        }}
      />
    </primitive>
  )
}
