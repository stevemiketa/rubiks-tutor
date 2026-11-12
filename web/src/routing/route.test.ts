import { describe, expect, it } from 'vitest'
import { parseRoute } from './route.ts'

describe('parseRoute', () => {
  it.each([
    ['/', { page: 'splash' }],
    ['/app', { page: 'tutor' }],
    ['/s/Ab3_x-9QzK', { page: 'tutor', snapshotId: 'Ab3_x-9QzK' }],
  ])('maps %s to its page', (pathname, route) => {
    expect(parseRoute(pathname)).toEqual(route)
  })

  // The server answers these with a 404 of its own, so the app never sees them.
  it.each(['/nope', '/app/extra', '/s/', '/s/a/b'])('maps %s to no page, as the server serves none there', (pathname) => {
    expect(parseRoute(pathname)).toBeUndefined()
  })
})
