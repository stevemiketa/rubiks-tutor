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

  it.each(['/nope', '/app/extra', '/s/', '/s/a/b'])(
    'maps %s to not found, like the server does',
    (pathname) => {
      expect(parseRoute(pathname)).toEqual({ page: 'not-found' })
    },
  )
})
