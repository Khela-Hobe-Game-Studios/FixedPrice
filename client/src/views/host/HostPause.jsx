import { Btn } from '../../board';

/**
 * Paused, or about to end.
 *
 * It states the consequence rather than asking twice: what happens to the scores,
 * what the players see, and what happens to the room code. A host ending a game at
 * round 7 with fifteen people watching should not have to guess.
 */
export default function HostPause({ paused, round, onResume, onSettings, onEnd }) {
  return (
    <div className="hs-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="hs-dialog">
        <div
          style={{
            height: 30,
            background: 'var(--amber)',
            color: 'var(--board)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="bd-word" style={{ fontSize: 15, letterSpacing: '0.28em' }}>
            {paused ? 'PAUSED · HOST DISCONNECTED' : `PAUSED · ROUND ${round?.round ?? 1} OF ${round?.total ?? '—'}`}
          </span>
        </div>

        <div className="hs-dialog__body">
          <h2 className="bd-word" style={{ fontSize: 40 }}>
            End the game?
          </h2>
          <p className="bd-mono bd-mono--wrap" style={{ fontSize: 14 }}>
            SCORES ARE KEPT. PLAYERS SEE THE FINAL STANDINGS AND THE PODIUM. THE ROOM CODE STOPS
            WORKING.
          </p>
        </div>

        <div className="hs-dialog__actions">
          <Btn onClick={onResume} style={{ height: 54, fontSize: 20 }} data-testid="resume">
            RESUME
          </Btn>
          <Btn tone="ghost" onClick={onSettings} style={{ height: 54, fontSize: 20 }}>
            SETTINGS
          </Btn>
          <Btn tone="red" onClick={onEnd} style={{ height: 54, fontSize: 20 }} data-testid="end-game">
            END GAME
          </Btn>
        </div>
      </div>
    </div>
  );
}
