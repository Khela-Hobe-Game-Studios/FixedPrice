import { Stage, Band, BandCell, Marquee, AvatarTile, Num } from '../../board';

/**
 * Sudden death, announced.
 *
 * Red already owns jeopardy everywhere else in the system — wild misses, the last
 * five seconds, disconnects — so the finale does not need a new colour, it needs
 * the whole board in the one it already has.
 */
export default function HostFinale({ finale }) {
  const finalists = finale?.finalists ?? [];

  return (
    <Stage style={{ backgroundColor: 'var(--led-red)' }}>
      <Band height={46}>
        <BandCell fill align="between" style={{ background: 'var(--board)' }}>
          <span className="bd-label bd-label--bright" style={{ fontSize: 20 }}>
            THE ROUNDS ARE OVER
          </span>
          <span className="bd-label" style={{ fontSize: 16 }}>
            TOP {finalists.length} QUALIFY
          </span>
        </BandCell>
      </Band>

      <div className="bd-body" style={{ color: '#fff' }}>
        <div className="hs-intro" style={{ gap: 10 }}>
          <div className="hs-intro__label">FINALE</div>
          <div className="hs-intro__name bd-slam" style={{ fontSize: 128 }} data-testid="finale-intro">
            SUDDEN DEATH
          </div>
          <div className="bd-word" style={{ fontSize: 24, letterSpacing: '0.2em', opacity: 0.85 }}>
            FURTHEST GUESS IS OUT · LAST ONE STANDING WINS
          </div>

          <div style={{ display: 'flex', gap: 18, marginTop: 22 }}>
            {finalists.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <AvatarTile size={78} colorIndex={p.colorIndex} name={p.name} avatar={p.avatar} bar={5} />
                <span className="bd-word" style={{ fontSize: finalists.length > 4 ? 22 : 26 }}>
                  {p.name}
                </span>
                <Num size={20} style={{ color: '#fff', opacity: 0.75 }}>
                  {p.score}
                </Num>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Marquee
        items={['SUDDEN DEATH · NOBODY IS SAFE · ']}
        tone="panel"
        speed={14}
        style={{ height: 44, background: 'var(--board)', color: 'var(--led-red)' }}
      />
    </Stage>
  );
}
