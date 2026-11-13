// Keeping the Session between visits, in browser storage, so a reload picks
// up where the learner left off. Storage is a convenience: when it is missing,
// full or holds something unreadable, the tutor carries on without it.
import { Session } from './session.ts'

/** The parts of browser storage the store uses. window.localStorage is one. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** The key the Session is saved under. */
const KEY = 'cubular.session'

export class SessionStore {
  readonly #storage: StorageLike | undefined

  /** A store over browser storage. Without storage it saves nothing and restores nothing. */
  constructor(storage: StorageLike | undefined) {
    this.#storage = storage
  }

  /**
   * The saved Session, or undefined if there is none, it can't be read, it
   * was saved in an older format, or storage isn't available.
   */
  load(): Session | undefined {
    try {
      const json = this.#storage?.getItem(KEY)
      return json == null ? undefined : Session.restore(JSON.parse(json))
    } catch {
      return undefined
    }
  }

  /** Saves a Session in place of the one saved before. Does nothing if storage isn't available or is full. */
  save(session: Session): void {
    try {
      this.#storage?.setItem(KEY, JSON.stringify(session))
    } catch {
      // Without storage the tutor still works; it just won't survive a reload.
    }
  }
}
