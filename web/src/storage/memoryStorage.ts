// For tests: browser storage as the app sees it, a Map behind Storage's
// interface.

export class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly items = new Map<string, string>()
  /** The one thing saved, or undefined if nothing is. */
  get saved(): string | undefined {
    return [...this.items.values()][0]
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
  removeItem(key: string): void {
    this.items.delete(key)
  }
}
