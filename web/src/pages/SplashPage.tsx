import { Link } from '../routing/Link.tsx'

// Placeholder: the animated, self-solving Cube arrives in a later ticket.
export function SplashPage() {
  return (
    <main className="page splash">
      <h1>Cubular</h1>
      <p>Learn to solve the Cube one Stage at a time.</p>
      <Link className="button" to="/app">
        Start solving
      </Link>
    </main>
  )
}
