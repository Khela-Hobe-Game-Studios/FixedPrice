import {
  Stage, Band, BandCell, Marquee } from '../../board';
import { category, BETTING_CATEGORY } from '../../categories';
import { useCountdown } from '../../game/clock';

/**
 * Three seconds of one colour.
 *
 * This is the only screen where a category fills the whole board, and it is what
 * gives the game an energy contour: a loud flash of a different temperature between
 * the quiet standings and the next question. Without it every screen in the game
 * runs at the same level and the reveal has nothing to be a peak above.
 */
export default function HostIntro({ intro, timing }) {
  const cat = intro?.isBettingRound ? BETTING_CATEGORY : category(intro?.category);
  const left = useCountdown(timing);

  // backgroundColor, not background — the shorthand would drop the dot grid, and the
  // dots are the one thing every screen in the system has in common.
  return (
    <Stage style={{ backgroundColor: cat.color }}>
      <Band height={46}>
        <BandCell fill align="between" style={{ background: 'var(--board)' }}>
          <span className="bd-label bd-label--bright" style={{ fontSize: 20 }}>
            ROUND {String(intro?.round ?? 1).padStart(2, '0')} OF {intro?.total ?? '—'}
          </span>
          <span className="bd-label" style={{ fontSize: 16 }}>
            GET READY
          </span>
        </BandCell>
      </Band>

      <div className="bd-body" style={{ color: cat.ink }}>
        <div className="hs-intro">
          <div className="hs-intro__label">CATEGORY</div>
          <div
            className={`hs-intro__name bd-slam${cat.bengali ? ' hs-intro__name--bn' : ''}`}
            data-testid="intro-category"
          >
            {cat.name}
          </div>
          <div className="hs-intro__tick">
            {[3, 2, 1].map((n) => (
              <span key={n} style={{ opacity: left !== null && left < n ? 0.25 : 1 }}>
                {n}
                {n > 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Marquee
        items={[`${cat.band} · ${cat.band} · `]}
        tone="panel"
        speed={16}
        style={{ height: 44, background: 'var(--board)', color: cat.color }}
      />
    </Stage>
  );
}
