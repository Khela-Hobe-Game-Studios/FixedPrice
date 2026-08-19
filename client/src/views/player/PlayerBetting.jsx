import { PhoneScreen, Num, Btn, Countdown, formatNum } from '../../board';
import { PhoneHeader, RotateGuard } from './parts';
import { BETTING_CATEGORY } from '../../categories';
import { useCountdown } from '../../game/clock';

/** Back somebody's guess. The numbers are here because the argument is the round. */
export default function PlayerBetting({ betting, timing, me, myBet, placed, onBet, onPlace }) {
  const left = useCountdown(timing);
  const options = (betting?.options ?? []).filter((p) => p.id !== me?.id);

  return (
    <PhoneScreen>
      <PhoneHeader
        color={BETTING_CATEGORY.color}
        ink={BETTING_CATEGORY.ink}
        left="BETTING ROUND"
        right={left === null ? undefined : String(left).padStart(2, '0')}
      />

      <div className="ps-body" style={{ gap: 10 }}>
        <div>
          <h2 className="ps-head" style={{ fontSize: 34 }}>
            Who is closest?
          </h2>
          <span className="bd-mono" style={{ fontSize: 15 }}>
            {placed ? 'BET IN · WAITING ON THE ROOM' : 'STAKE 2 PTS · PICK ONE'}
          </span>
        </div>

        <div className="ps-scroll" style={{ display: 'grid', gridAutoRows: 62, gap: 8, alignContent: 'start' }}>
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ps-bet"
              aria-pressed={myBet === p.id}
              onClick={() => onBet(p.id)}
              disabled={placed}
              data-testid="bet-option"
            >
              <span className="ps-bet__name">{p.name}</span>
              <Num size={26} style={{ marginLeft: 'auto' }}>
                {formatNum(p.guess)}
              </Num>
              <Num size={15} style={{ color: myBet === p.id ? 'inherit' : BETTING_CATEGORY.color }}>
                ×{p.odds}
              </Num>
            </button>
          ))}
        </div>

        {left !== null && left <= 5 && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Countdown seconds={left} size={40} />
          </div>
        )}
      </div>

      <div className="ps-cta">
        {/* Dead once it is in. The bet is already with the server by then, and a
            live CTA over a placed bet is the phone telling them it did nothing. */}
        <Btn
          block
          cta
          pulse={!placed}
          onClick={onPlace}
          disabled={!myBet || placed}
          data-testid="place-bet"
        >
          {placed ? 'BET PLACED' : 'PLACE BET'}
        </Btn>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
