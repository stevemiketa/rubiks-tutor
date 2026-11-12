import { MotionConfig, motion } from 'motion/react'
import { Link } from '../routing/Link.tsx'
import { CubePicture } from '../scene/CubePicture.tsx'
import { CubeView } from '../scene/CubeView.tsx'
import { usePrefersReducedMotion } from '../scene/usePrefersReducedMotion.ts'
import { SPLASH_STILL } from '../splash/recording.ts'
import { useSplashLoop } from '../splash/useSplashLoop.ts'

const rise = (from: number, delay = 0) => ({
  initial: { opacity: 0, y: from },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: 'easeOut' },
} as const)

// The splash page: the name, the Cube scrambling and solving itself over a
// slowly moving gradient, and the way into the tutor. It makes no server
// calls; the Cube plays a recording. Under reduced motion the Cube is a still
// image and the gradient stops.
export function SplashPage() {
  const reduceMotion = usePrefersReducedMotion()

  return (
    // Under reduced motion, transitions fade instead of moving.
    <MotionConfig reducedMotion="user">
      <motion.main
        className="splash"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {reduceMotion ? <StillCube /> : <LoopingCube />}
        <motion.header className="splash-title" {...rise(-24)}>
          <h1>Cubular</h1>
          <p>Learn to solve the Cube one Stage at a time.</p>
        </motion.header>
        <motion.div
          className="splash-start"
          {...rise(24, 0.35)}
          whileHover={{ scale: 1.05, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
        >
          <Link className="button" to="/app">
            Start solving
          </Link>
        </motion.div>
      </motion.main>
    </MotionConfig>
  )
}

function LoopingCube() {
  const queue = useSplashLoop()
  return <CubeView queue={queue} label="The Cube scrambling and then solving itself" className="splash-cube" />
}

// A picture rather than a 3D view, so it needs no WebGL.
function StillCube() {
  return (
    <CubePicture
      cube={SPLASH_STILL}
      label="The Cube partway through being solved, with its white layer finished"
      className="splash-cube"
    />
  )
}
