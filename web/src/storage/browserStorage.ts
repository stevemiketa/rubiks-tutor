// This browser's storage, for what the app keeps between visits. Storage is a
// convenience: whatever keeps something in it carries on without it.

/**
 * The browser's localStorage, or undefined where it isn't available: some
 * browsers throw on reading it when site data is blocked.
 */
export function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}
