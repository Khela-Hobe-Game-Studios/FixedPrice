import {
  Stage,
  Band, BandCell, Brand, Marquee, SplitColumns, Num, Countdown, SegmentBar,
} from '../../board';
import { category } from '../../categories';
import { useCountdown } from '../../game/clock';

const QUESTION_MARQUEE = ['TYPE YOUR PRICE ON YOUR PHONE · SHOUT IT AT EACH OTHER FIRST · '];

/**
 * The question, the clock, and who has locked in. The most-seen screen in the game.
 *
 * "7 of 15 answered" is carried three ways at once — the big number pair, the
 * segment bar, and named seats that flip. They are not redundant: each one works at
 * a different glance length, from a two-second look up from a phone to someone
 * staring at the board waiting for one specific person.
 */
export default function HostQuestion({ round, timing, answerCount, players }) {
  const cat = category(round?.category);
  const left = useCountdown(timing);
  const seats = round?.players ?? players ?? [];
  const answered = new Set(answerCount?.answered ?? []);
  const total = answerCount?.total || seats.length || 1;
  const count = answerCount?.count ?? 0;

  const inSeats = seats.filter((p) => answered.has(p.id));
  const pending = seats.filter((p) => !answered.has(p.id));
  const ordered = [...inSeats, ...pending];

  return (
    <Stage>
      <Band>
        <Brand />
        <BandCell fill color={cat.color} ink={cat.ink} align="between">
          <span
            className={`bd-word${cat.bengali ? ' bd-bn' : ''}`}
            style={{ fontSize: 22, letterSpacing: '0.28em' }}
          >
            {cat.band}
          </span>
          <Num size={18} style={{ color: 'inherit', opacity: 0.75 }}>
            ROUND {String(round?.round ?? 1).padStart(2, '0')}/{round?.total ?? '—'}
          </Num>
        </BandCell>
        <BandCell width={140} tone="panel">
          <span
            className="bd-blink"
            style={{ width: 10, height: 10, background: 'var(--led-red)', display: 'inline-block' }}
          />
          <span className="bd-label bd-label--bright" style={{ fontSize: 16, letterSpacing: '0.2em' }}>
            LIVE
          </span>
        </BandCell>
      </Band>

      <div className="hs-question">
        <div className="hs-question__main bd-rule-r">
          <h2 className="hs-question__q" data-testid="question">
            {round?.question}
          </h2>

          {round?.unit && (
            <div className="hs-question__unit">
              <span className="bd-label" style={{ fontSize: 21, letterSpacing: '0.24em' }}>
                ANSWER IN
              </span>
              <span className="hs-chip">{round.unit}</span>
            </div>
          )}

          <div className="bd-push hs-question__clock">
            {left === null ? (
              <span className="bd-label" style={{ fontSize: 26 }}>
                NO CLOCK · HOST ADVANCES
              </span>
            ) : (
              <>
                <Countdown seconds={left} size={170} data-testid="countdown" />
                <span className="hs-question__clocklabel">SECONDS LEFT</span>
              </>
            )}
          </div>
        </div>

        <div className="hs-question__side">
          <span className="bd-label">LOCKED IN</span>

          <div className="hs-question__count">
            <Num size={84} tone="green" glow data-testid="answer-count">
              {String(count).padStart(2, '0')}
            </Num>
            <Num size={34} style={{ color: 'var(--out-32)' }}>
              /{total}
            </Num>
          </div>

          <SegmentBar total={total} lit={count} />

          {/* Answered first, then a balanced split. Grouping by state and then
              cutting down the middle means the green block grows from the top-left
              as answers land — semantic where it matters, but never 14 rows in one
              column, which is taller than the panel. */}
          <SplitColumns
            className="bd-fill"
            items={ordered}
            splitAt={Math.ceil(ordered.length / 2)}
            gap="0 8px"
            rowHeight={28}
            rowGap={4}
            renderItem={(p) => {
              const isIn = answered.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`hs-flip ${isIn ? 'hs-flip--in' : 'hs-flip--out'}`}
                >
                  <span className="hs-flip__name">{p.name}</span>
                  <span className="hs-flip__state">{isIn ? 'IN' : '···'}</span>
                </div>
              );
            }}
          />
        </div>
      </div>

      <Marquee items={QUESTION_MARQUEE} />
    </Stage>
  );
}
