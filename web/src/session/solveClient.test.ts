import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseMoves } from '../cube/index.ts'
import { requestSolve } from './solveClient.ts'

// A fetch that records the request and answers with a solved Solution.
function recordingFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) })
    return Promise.resolve(Response.json({ solved: true, stages: [] }))
  }
  return { fetch, calls }
}

describe('requestSolve', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the Scramble, the Move history, and the puzzle type to POST /api/solve', async () => {
    const { fetch, calls } = recordingFetch()
    vi.stubGlobal('fetch', fetch)

    await requestSolve(parseMoves('R U'), parseMoves("F'"), 'cube')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/solve')
    expect(calls[0]?.body).toEqual({ scramble: 'R U', moves: "F'", type: '3x3' })
  })

  it('sends type "2x2" for a Pocket Cube', async () => {
    const { fetch, calls } = recordingFetch()
    vi.stubGlobal('fetch', fetch)

    await requestSolve(parseMoves('R U'), [], 'pocket')

    expect(calls[0]?.body).toMatchObject({ type: '2x2' })
  })

  it('sends type "3x3" when no puzzle is given, so the default is the 3x3', async () => {
    const { fetch, calls } = recordingFetch()
    vi.stubGlobal('fetch', fetch)

    await requestSolve(parseMoves('R'), [])

    expect(calls[0]?.body).toMatchObject({ type: '3x3' })
  })
})
