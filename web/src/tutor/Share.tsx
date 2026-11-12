import { useEffect, useRef, useState } from 'react'
import type { Sharing } from '../session/index.ts'

/**
 * The Share button and the share dialog. The dialog is open while the tutor
 * is sharing: it says the Snapshot is being saved, then shows the share link
 * with a copy button, or says why sharing failed. It is a native modal
 * dialog, so Esc closes it and keys inside it never reach the Cube.
 */
export function Share({
  sharing,
  disabled,
  onShare,
  onClose,
}: {
  sharing: Sharing | undefined
  /** Whether Share is unavailable, as it is while the Scramble plays. */
  disabled: boolean
  onShare: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const open = sharing !== undefined

  useEffect(() => {
    const el = dialog.current
    if (open && !el?.open) el?.showModal()
    if (!open && el?.open) el.close()
  }, [open])

  return (
    <>
      <button type="button" className="action-button" aria-haspopup="dialog" disabled={disabled} onClick={onShare}>
        Share
      </button>
      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="share-heading"
        onClose={onClose}
        // A click on the backdrop lands on the dialog itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="sheet-body">
          <div className="panel-heading">
            <h2 id="share-heading">Share this Cube</h2>
            <button type="button" className="action-button" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
          {sharing?.status === 'saving' && <p role="status">Saving a Snapshot of this Cube…</p>}
          {sharing?.status === 'shared' && <ShareLink key={sharing.url} url={sharing.url} />}
          {sharing?.status === 'failed' && (
            <>
              <p role="alert">{sharing.message}</p>
              <button type="button" className="action-button" onClick={onShare}>
                Try again
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}

function ShareLink({ url }: { url: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<'copied' | 'failed' | undefined>(undefined)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('copied')
    } catch {
      // Without clipboard access, select the link so the learner can copy it.
      input.current?.select()
      setCopied('failed')
    }
  }

  return (
    <>
      <p>
        Anyone with this link can open this Cube and its Move history. What they change starts their own Session, so
        the link always shows what you shared.
      </p>
      <div className="share-link">
        <input
          ref={input}
          className="notation"
          readOnly
          value={url}
          aria-label="Share link"
          onFocus={(event) => event.currentTarget.select()}
        />
        {/* The link has just arrived, so the button that copies it has the focus. */}
        <button type="button" className="action-button" onClick={() => void copy()} autoFocus>
          Copy link
        </button>
      </div>
      <p role="status" className="muted">
        {copied === 'copied' && 'Copied.'}
        {copied === 'failed' && 'Copying isn’t allowed here: press Ctrl+C or ⌘C to copy the selected link.'}
      </p>
    </>
  )
}
