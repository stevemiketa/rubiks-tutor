import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { SplashPage } from './pages/SplashPage.tsx'
import { TutorPage } from './pages/TutorPage.tsx'
import { useRoute } from './routing/navigation.ts'

export function App() {
  const route = useRoute()
  switch (route.page) {
    case 'splash':
      return <SplashPage />
    case 'tutor':
      return <TutorPage snapshotId={route.snapshotId} />
    case 'not-found':
      return <NotFoundPage />
  }
}
