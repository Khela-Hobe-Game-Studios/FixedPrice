import {
  Stage, Band, BandCell, Brand, Marquee, Num, Countdown, formatNum } from '../../board';
import { BETTING_CATEGORY } from '../../categories';
import { useCountdown } from '../../game/clock';

/**
 * After the guesses are in, the room backs whose guess is closest.
 *
 * The numbers are on screen and the order is random: the argument about whether 780
 * or 1,200 sounds more like a kilo of beef is the round. Odds price how far a guess
 * sits from the pack, which is something anyone looking at the board can see for
 * themselves.
 */
export default function HostBetting({ betting, round, timing, betCount }) {
  const cat = BETTING_CATEGORY;
  const left = useCountdown(timing);
  const options = betting?.options ?? [];
  const placed = betCount?.count ?? 0;
  // Falls back to the field size until the first bet lands, so the band never
  // reads "0 OF 0" while six people are choosing.
  const total = betCount?.total || options.length;

  return (
    <Stage>
      <Band>
        <Brand />
        <BandCell fill color={cat.color} ink={cat.ink} align="between">
          <span className="bd-word" style={{ fontSize: 22, letterSpacing: '0.28em' }}>
            BETTING ROUND
          </span>
          <Num size={18} style={{ color: 'inherit', opacity: 0.75 }}>
            ROUND {String(round?.round ?? 1).padStart(2, '0')}/{round?.total ?? '—'}
          </Num>
        </BandCell>
        <BandCell width={140} tone="panel" align="center">
          {left !== null && <Countdown seconds={left} size={34} />}
        </BandCell>
      </Band>

      <div className="hs-betting" data-testid="betting-board">
        <div className="hs-betting__head">
          <div>
            <h2 className="hs-betting__title">Who is closest?</h2>
            <div className="bd-label" style={{ fontSize: 19, letterSpacing: '0.26em', marginTop: 8 }}>
              BACK A GUESS ON YOUR PHONE · WIN THEIR ODDS
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="bd-mono" style={{ fontSize: 15 }}>
              STAKE
            </div>
            <Num size={40}>2 PTS</Num>
          </div>
        </div>

        <div className="hs-betting__grid">
          {options.map((p) => (
            <div key={p.id} className="hs-bet">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                <span className="hs-bet__name">{p.name}</span>
                <Num size={17} style={{ color: cat.color, marginLeft: 'auto' }}>
                  ×{p.odds}
                </Num>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Num size={46} glow>
                  {formatNum(p.guess)}
                </Num>
                {round?.unit && (
                  <span className="bd-mono" style={{ fontSize: 15, opacity: 0.55 }}>
                    {round.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Marquee
        items={[`${placed} OF ${total} BETS PLACED · PICK ONE ON YOUR PHONE · `]}
        tone="green"
      />
    </Stage>
  );
}
