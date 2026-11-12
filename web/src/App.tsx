import { AnimatePresence } from 'motion/react'
import { SplashPage } from './pages/SplashPage.tsx'
import { TutorPage } from './pages/TutorPage.tsx'
import { useRoute } from './routing/navigation.ts'
import type { Route } from './routing/route.ts'

// A page with an exit transition (the splash page) finishes it before the
// next page appears.
export function App() {
  const route = useRoute()
  return <AnimatePresence mode="wait">{route && page(route)}</AnimatePresence>
}

function page(route: Route) {
  switch (route.page) {
    case 'splash':
      return <SplashPage key="splash" />
    case 'tutor':
      return <TutorPage key="tutor" snapshotId={route.snapshotId} />
  }
}
