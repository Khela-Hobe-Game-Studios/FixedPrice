import { useState } from 'react';
import { PhoneScreen, Num, Btn, Countdown, SegmentBar, formatNum } from '../../board';
import { PhoneHeader, RotateGuard } from './parts';
import { category } from '../../categories';
import { useCountdown } from '../../game/clock';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

/**
 * Type a number, lock it in.
 *
 * A custom pad rather than the system keyboard: the keyboard covers half a 390px
 * screen, puts the decimal somewhere different on every device, and lets people
 * type letters into a field that only accepts a number. Here nothing invalid can be
 * entered in the first place — negatives and non-numerics simply have no key.
 */
export default function PlayerQuestion({ round, timing, answerCount, onSubmit }) {
  const cat = category(round?.category);
  const left = useCountdown(timing);
  const [value, setValue] = useState('');

  const press = (key) => {
    if (key === 'clear') return setValue('');
    if (key === 'back') return setValue((v) => v.slice(0, -1));
    // 12 digits is more than any answer in the bank and stops a bored thumb from
    // producing a number the board cannot lay out.
    setValue((v) => (v.length >= 12 ? v : (v === '0' ? key : v + key)));
  };

  const submit = () => {
    if (value !== '') onSubmit(Number(value));
  };

  return (
    <PhoneScreen>
      <PhoneHeader
        color={cat.color}
        ink={cat.ink}
        bengali={cat.bengali}
        left={cat.band}
        right={`R${String(round?.round ?? 1).padStart(2, '0')}/${round?.total ?? '—'}`}
      />

      <div className="ps-body">
        <h2 className="ps-head">{round?.question}</h2>

        <div className="bd-fill ps-typing">
          <span className="bd-label" style={{ fontSize: 12, textAlign: 'center' }}>
            YOUR GUESS
          </span>
          <div className="ps-guess">
            <Num size="var(--phone-guess)" glow data-testid="guess-value">
              {value === '' ? '' : formatNum(Number(value))}
            </Num>
            <span className="bd-caret ps-guess__caret" />
          </div>
          <span className="ps-guess__rule" />
          {round?.unit && (
            <span className="bd-mono" style={{ fontSize: 15, textAlign: 'center' }}>
              {round.unit.toUpperCase()}
            </span>
          )}

          <div className="ps-clock">
            {left === null ? (
              <span className="bd-mono" style={{ fontSize: 14 }}>
                NO CLOCK — TAKE YOUR TIME
              </span>
            ) : (
              <>
                <Countdown seconds={left} size="var(--phone-clock)" />
                <span className="bd-label" style={{ fontSize: 13 }}>
                  SEC LEFT
                </span>
              </>
            )}
          </div>
        </div>

        {answerCount?.total > 0 && (
          <SegmentBar total={answerCount.total} lit={answerCount.count} height={8} />
        )}

        <div className="ps-pad">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`ps-pad__key${k === 'clear' || k === 'back' ? ' ps-pad__key--fn' : ''}`}
              onClick={() => press(k)}
              data-testid={`pad-${k}`}
              aria-label={k === 'back' ? 'Delete' : k === 'clear' ? 'Clear' : k}
            >
              {k === 'back' ? 'DEL' : k === 'clear' ? 'CLR' : k}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-cta">
        <Btn block cta pulse onClick={submit} disabled={value === ''} data-testid="lock-in">
          LOCK IN
        </Btn>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
