import { Band, BandCell, Num, playerColor } from '../../board';

/**
 * The phone's header is the one place the player's own colour appears on their own
 * device, so they can match themselves to their row on the TV without asking.
 * During a round it becomes the category band instead — the phone and the board
 * change temperature together.
 */
export function PhoneHeader({ tone = 'green', color, ink, left, right, bengali = false }) {
  return (
    <Band height="var(--band-phone)">
      <BandCell fill tone={color ? 'none' : tone} color={color} ink={ink} align="between">
        <span
          className={`bd-word${bengali ? ' bd-bn' : ''}`}
          style={{ fontSize: 17, letterSpacing: bengali ? '0.08em' : '0.26em' }}
        >
          {left}
        </span>
        {right != null && (
          <Num size={15} style={{ color: 'inherit', opacity: 0.85 }}>
            {right}
          </Num>
        )}
      </BandCell>
    </Band>
  );
}

/** The header in the player's own colour, with their name in it. */
export function YouHeader({ me, right }) {
  return (
    <PhoneHeader
      color={playerColor(me?.colorIndex)}
      ink="#07090A"
      left={`${(me?.name ?? '').toUpperCase()} · YOU'RE IN`}
      right={right}
    />
  );
}

export function RotateGuard() {
  return (
    <div className="bd-rotate">
      <span className="bd-word" style={{ fontSize: 32 }}>
        Turn your phone back
      </span>
      <span className="bd-mono" style={{ fontSize: 13, color: 'rgba(255,255,255,.8)' }}>
        এক দাম IS PLAYED UPRIGHT
      </span>
    </div>
  );
}
