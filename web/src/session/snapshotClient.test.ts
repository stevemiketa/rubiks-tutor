import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotApi } from './snapshotClient.ts'

// A fetch that records the request and answers with answer for the next call.
function stubFetch(answer: Response | ((url: string, init?: RequestInit) => Response)) {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
    return Promise.resolve(typeof answer === 'function' ? answer(url, init) : answer)
  }
  vi.stubGlobal('fetch', fetch)
  return calls
}

describe('snapshotApi.share', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the Scramble, the Moves, and the puzzle type', async () => {
    const calls = stubFetch(Response.json({ id: 'id1', url: '/s/id1' }))

    await snapshotApi.share({ scramble: 'R U', moves: "F'", type: '2x2' })

    expect(calls[0]?.url).toBe('/api/snapshots')
    expect(calls[0]?.body).toEqual({ scramble: 'R U', moves: "F'", type: '2x2' })
  })

  it('posts type "3x3" when the Snapshot carries no type', async () => {
    const calls = stubFetch(Response.json({ id: 'id1', url: '/s/id1' }))

    await snapshotApi.share({ scramble: 'R', moves: '' })

    expect(calls[0]?.body).toMatchObject({ type: '3x3' })
  })
})

describe('snapshotApi.load', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads the puzzle type the server stored', async () => {
    stubFetch(Response.json({ scramble: 'R U', moves: "F'", type: '2x2' }))

    const snapshot = await snapshotApi.load('id1')

    expect(snapshot).toEqual({ scramble: 'R U', moves: "F'", type: '2x2' })
  })

  it('reads a Snapshot with no type as the 3x3, so old share links still open', async () => {
    stubFetch(Response.json({ scramble: 'R U', moves: "F'" }))

    const snapshot = await snapshotApi.load('id1')

    expect(snapshot).toEqual({ scramble: 'R U', moves: "F'", type: '3x3' })
  })
})
