import { useState } from 'react';
import { PhoneScreen, CodeEntry, Btn } from '../../board';
import { PhoneHeader, RotateGuard } from './parts';

const LOGO = `${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`;

/**
 * Four letters and a name.
 *
 * The QR deep-links here with the code already filled, so the common path is one
 * field and one button. The code field is a real input behind four tiles, which is
 * what makes paste, autofill and the phone keyboard behave.
 */
export default function PlayerJoin({ code, setCode, name, setName, onJoin, onHostInstead, pending, error }) {
  const [touched, setTouched] = useState(false);
  const ready = code.length === 4 && name.trim().length > 0;

  const submit = () => {
    setTouched(true);
    if (ready) onJoin();
  };

  return (
    <PhoneScreen>
      <PhoneHeader left="এক দাম" right="JOIN" bengali />

      <div className="ps-join">
        <img className="ps-join__mark" src={LOGO} alt="" />

        <div className="ps-join__field">
          <span className="bd-label" style={{ fontSize: 13 }}>
            ROOM CODE
          </span>
          <CodeEntry value={code} onChange={setCode} tone={error ? 'red' : 'amber'} autoFocus={!code} />
        </div>

        <div className="ps-join__field">
          <span className="bd-label" style={{ fontSize: 13 }}>
            YOUR NAME
          </span>
          <input
            id="player-name"
            className={`bd-field${touched && !name.trim() ? ' bd-field--error' : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={16}
            placeholder="KARIM"
            autoComplete="off"
            aria-label="Your name"
            data-testid="player-name-input"
          />
        </div>

        {error && (
          <span className="bd-mono" style={{ fontSize: 13, color: 'var(--led-red)' }}>
            {error}
          </span>
        )}

        {onHostInstead && (
          <button
            type="button"
            className="bd-label"
            style={{ fontSize: 12, marginTop: 4 }}
            onClick={onHostInstead}
            data-testid="host-instead"
          >
            RUNNING THE BOARD INSTEAD?
          </button>
        )}
      </div>

      <div className="ps-cta">
        <Btn block cta onClick={submit} disabled={pending} data-testid="join-game">
          {pending ? 'JOINING' : 'JOIN GAME'}
        </Btn>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
