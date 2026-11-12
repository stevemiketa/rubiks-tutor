// The 3D Cube, from a fixed camera that sees the front, top and right faces.
// It shows a MoveQueue: the queue's Cube at rest, and each queued Move
// animated in turn. The tutor and the splash page both draw the Cube with it.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Sticker } from '../cube/index.ts'
import type { MoveQueue, QueuedMove } from '../session/index.ts'
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
  /** A text description of the view, for screen readers. */
  readonly label: string
  readonly className?: string
}

export function CubeView({ queue, selected, onSelect, selectable, label, className }: CubeViewProps) {
  return (
    <div className={['cube-view', className].filter(Boolean).join(' ')} role="img" aria-label={label}>
      {/* flat: no tone mapping, so the Stickers keep their true colors. */}
      <Canvas frameloop="demand" flat dpr={[1, 2]} camera={{ position: [...CAMERA.position], fov: CAMERA.fov }}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[3, 8, 5]} intensity={1.8} />
        <directionalLight position={[-4, -2, 6]} intensity={0.5} />
        <AnimatedCube queue={queue} selected={selected} onSelect={onSelect} selectable={selectable} />
      </Canvas>
    </div>
  )
}

type AnimatedCubeProps = Pick<CubeViewProps, 'queue' | 'selected' | 'onSelect' | 'selectable'>

function AnimatedCube({ queue, selected, onSelect, selectable }: AnimatedCubeProps) {
  const model = useMemo(() => new CubeModel(), [])
  const invalidate = useThree((state) => state.invalidate)
  const canvas = useThree((state) => state.gl.domElement)
  // The Move being animated and how far into it the animation is.
  const animation = useRef<{ item: QueuedMove; elapsedMs: number } | undefined>(undefined)

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
  })

  const stickerAt = (event: ThreeEvent<PointerEvent | MouseEvent>): Sticker | undefined => {
    const sticker = CubeModel.stickerOf(event.object)
    return sticker !== undefined && (selectable?.(sticker) ?? true) ? sticker : undefined
  }

  if (onSelect === undefined) return <primitive object={model} />
  return (
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
        canvas.style.cursor = stickerAt(event) === undefined ? '' : 'pointer'
      }}
      onPointerOut={() => {
        canvas.style.cursor = ''
      }}
    />
  )
}
