import { PLAYBACK_SPEEDS, type Session, type Tutor } from '../session/index.ts'

/**
 * What the Solution panel asks Playback to do. The page's Tutor does all of
 * it; call these as methods (playback.play()), not as detached functions.
 */
export type Playback = Pick<
  Tutor,
  'play' | 'pause' | 'reverse' | 'stepForward' | 'stepBack' | 'seek' | 'jumpToStage' | 'setSpeed' | 'setAutoPause'
>

/**
 * Playback through the loaded Solution: Reverse, Play, Step back and Step
 * forward, a scrubber showing how far through it is, the speed, and whether
 * it pauses at the end of each Stage. Space plays and pauses too (useTutor).
 */
export function PlaybackControls({ session, playback }: { session: Session; playback: Playback }) {
  const { position, playing, reversing, speed, autoPause } = session
  const total = session.solution?.moves.length ?? 0
  const progress = `${position} of ${total} Moves played`

  return (
    <div className="playback" role="group" aria-label="Playback">
      {/* Two rows: playing backward or forward, then stepping back or forward. */}
      <div className="playback-buttons">
        <button
          type="button"
          className="action-button"
          disabled={!reversing && position === 0}
          onClick={() => (reversing ? playback.pause() : playback.reverse())}
        >
          {reversing ? 'Pause' : 'Reverse'}
        </button>
        <button
          type="button"
          className="action-button"
          disabled={!playing && position === total}
          aria-keyshortcuts="Space"
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={() => (playing ? playback.pause() : playback.play())}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="action-button"
          disabled={position === 0}
          onClick={() => playback.stepBack()}
        >
          Step back
        </button>
        <button
          type="button"
          className="action-button"
          disabled={position === total}
          onClick={() => playback.stepForward()}
        >
          Step forward
        </button>
      </div>

      {/* Its own keys (the arrows, Home, End, Page Up and Page Down) move it a Move or more at a time. */}
      <input
        type="range"
        className="scrubber"
        min={0}
        max={total}
        step={1}
        value={position}
        aria-label="Position in the Solution"
        aria-valuetext={progress}
        onChange={(event) => playback.seek(event.currentTarget.valueAsNumber)}
      />
      <p className="muted">{progress}</p>

      <div className="playback-options">
        <div className="speeds" role="group" aria-labelledby="speed-label">
          <span id="speed-label" className="muted">
            Speed
          </span>
          {PLAYBACK_SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              className="action-button speed"
              aria-pressed={option === speed}
              onClick={() => playback.setSpeed(option)}
            >
              {option}×
            </button>
          ))}
        </div>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={autoPause}
          onClick={() => playback.setAutoPause(!autoPause)}
        >
          Pause at the end of each Stage
        </button>
      </div>
    </div>
  )
}
