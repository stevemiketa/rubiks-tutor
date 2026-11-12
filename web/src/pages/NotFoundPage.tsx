import { Link } from '../routing/Link.tsx'

export function NotFoundPage() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <Link to="/">Go to Cubular</Link>
    </main>
  )
}
