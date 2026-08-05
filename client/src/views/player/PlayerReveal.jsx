import { PhoneScreen, Num, formatNum } from '../../board';
import { PhoneHeader, RotateGuard } from './parts';

const ORDINAL = ['1ST', '2ND', '3RD'];

function ordinal(rank) {
  if (!rank) return '—';
  return ORDINAL[rank - 1] ?? `${rank}TH`;
}

/**
 * Only your outcome.
 *
 * The full board — every guess, the fun fact, the winner's band — is on the TV.
 * Repeating it here is what made everyone read everything twice and nobody look up,
 * so the phone answers exactly one question: how did I do?
 */
export default function PlayerReveal({ reveal, round, me }) {
  const mine = reveal?.ranked?.find((r) => r.id === me?.id);
  const winner = reveal?.ranked?.find((r) => r.isWinner);
  const iWon = mine?.isWinner;

  return (
    <PhoneScreen>
      <PhoneHeader
        tone="red"
        left={`REVEAL · ROUND ${String(round?.round ?? 1).padStart(2, '0')}`}
      />

      <div className="ps-body" style={{ gap: 16 }}>
        <div className="ps-result">
          <span className="bd-label" style={{ fontSize: 13 }}>
            ACTUAL PRICE
          </span>
          <Num size={88} glow data-testid="actual-price">
            {formatNum(reveal?.correctAnswer)}
          </Num>
          {round?.unit && (
            <span className="bd-mono" style={{ fontSize: 14 }}>
              {round.unit.toUpperCase()}
            </span>
          )}
        </div>

        <span className="bd-rule-b" style={{ borderBottomWidth: 2 }} />

        <div className="ps-result">
          <span className="bd-label" style={{ fontSize: 13 }}>
            YOU GUESSED
          </span>
          {mine?.submitted ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <Num size={62} tone="bone">
                {formatNum(mine.guess)}
              </Num>
              <Num size={20} tone={mine.wildMiss ? 'red' : 'green'}>
                OFF BY {formatNum(mine.distance)}
              </Num>
            </div>
          ) : (
            <Num size={44} tone="red">
              NO GUESS
            </Num>
          )}
        </div>

        <div className={`ps-band${mine?.points ? '' : ' ps-band--panel'}`}>
          <span className="bd-word" style={{ fontSize: 24, letterSpacing: '0.04em' }}>
            {mine?.submitted ? ordinal(mine.rank) : 'SAT THIS ONE OUT'}
            {iWon ? ' CLOSEST' : ''}
          </span>
          <Num size={34} tone={mine?.points ? 'ink' : 'bone'}>
            +{mine?.points ?? 0}
          </Num>
        </div>

        {winner && !iWon && (
          <p className="bd-word" style={{ fontSize: 19, lineHeight: 1.2, color: 'var(--out-55)' }}>
            {winner.name} took it with {formatNum(winner.guess)}
          </p>
        )}
      </div>

      <div className="ps-cta">
        <div className="ps-band ps-band--panel" style={{ justifyContent: 'center' }}>
          <span className="bd-label" style={{ fontSize: 13 }}>
            WATCH THE TV FOR THE FULL BOARD
          </span>
        </div>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
