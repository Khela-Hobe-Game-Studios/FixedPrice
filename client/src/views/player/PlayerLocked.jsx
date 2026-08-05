import { PhoneScreen, Num, Btn, SegmentBar, formatNum } from '../../board';
import { PhoneHeader, RotateGuard } from './parts';
import { category } from '../../categories';

/**
 * Locked in.
 *
 * The copy here has one job: get their eyes off the phone. Everything that happens
 * next happens on the TV, and a phone showing the question, the answer and the fun
 * fact is a room of fifteen people reading fifteen small screens.
 */
export default function PlayerLocked({ round, guess, answerCount, onChange }) {
  const cat = category(round?.category);

  return (
    <PhoneScreen>
      <PhoneHeader
        color={cat.color}
        ink={cat.ink}
        bengali={cat.bengali}
        left={cat.band}
        right={`R${String(round?.round ?? 1).padStart(2, '0')}/${round?.total ?? '—'}`}
      />

      <div className="ps-body" style={{ padding: '14px 14px 0', gap: 18 }}>
        <div className="ps-locked" data-testid="locked-in">
          <div className="bd-word" style={{ fontSize: 15, letterSpacing: '0.32em', opacity: 0.7 }}>
            LOCKED IN
          </div>
          <Num size={84} tone="ink" style={{ display: 'block', margin: '6px 0' }}>
            {typeof guess === 'number' ? formatNum(guess) : '—'}
          </Num>
          {round?.unit && (
            <div className="bd-mono" style={{ fontSize: 15, color: 'var(--board)', opacity: 0.7 }}>
              {round.unit.toUpperCase()}
            </div>
          )}
        </div>

        <h2 className="ps-sub" style={{ textAlign: 'center' }}>
          Now look at the TV
          <br />
          and defend your number
        </h2>

        <div className="bd-push" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="bd-label" style={{ fontSize: 12 }}>
              LOCKED IN
            </span>
            <span className="bd-mono" style={{ fontSize: 14 }}>
              {answerCount?.count ?? 0}/{answerCount?.total ?? 0}
            </span>
          </div>
          <SegmentBar total={answerCount?.total ?? 1} lit={answerCount?.count ?? 0} height={14} />
        </div>
      </div>

      <div className="ps-cta">
        <Btn block small tone="ghost" onClick={onChange} data-testid="change-guess">
          CHANGE MY GUESS
        </Btn>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
