import {
  Stage,
  Band, BandCell, Brand, Marquee, SplitColumns, AvatarTile, Num, playerColor,
} from '../../board';
import { category } from '../../categories';

/**
 * All fifteen players, so everyone can find themselves from the sofa. Never a top 5.
 *
 * The device that makes that possible is the bar under each name: the colour is
 * yours and the length is your standing, so you find your row by colour and read
 * your position without reading a number. The right column runs at 75-80% output so
 * the eye still starts at rank 01.
 */
export default function HostScoreboard({ scoreboard }) {
  const rows = scoreboard?.scoreboard ?? [];
  const leader = Math.max(1, ...rows.map((r) => r.score));
  const nextCat = scoreboard?.nextCategory ? category(scoreboard.nextCategory) : null;
  const played = scoreboard?.round ?? 0;
  const toPlay = Math.max((scoreboard?.total ?? 0) - played, 0);

  return (
    <Stage>
      <Band>
        <Brand />
        <BandCell fill tone="panel" align="center">
          <span className="bd-label bd-label--bright" style={{ fontSize: 22 }}>
            STANDINGS · AFTER ROUND {played}
          </span>
        </BandCell>
        <BandCell width={170} tone="amber" align="center">
          <Num size={22} tone="ink">
            {toPlay} TO PLAY
          </Num>
        </BandCell>
      </Band>

      <div className="bd-body">
        <SplitColumns
          className="hs-board"
          items={rows}
          gap="0 26px"
          columnClassName=""
          renderItem={(p, i, col) => (
            <div
              key={p.id}
              className={`hs-row${col === 1 ? ' hs-board__col--dim' : ''}`}
              data-testid="score-row"
            >
              <Num size={17} className="hs-row__rank" style={{ opacity: col === 1 ? 0.6 : 1 }}>
                {String(i + 1).padStart(2, '0')}
              </Num>
              <AvatarTile size={26} colorIndex={p.colorIndex} name={p.name} avatar={p.avatar} />
              <div style={{ minWidth: 0 }}>
                <div className="hs-row__name">{p.name}</div>
                <div
                  className="hs-row__bar"
                  style={{
                    '--bar-color': playerColor(p.colorIndex),
                    width: `${18 + (p.score / leader) * 82}%`,
                  }}
                />
              </div>
              <Num size={16} tone="green" style={{ opacity: p.delta ? 0.85 : 0.25 }}>
                {p.delta ? `+${p.delta}` : '—'}
              </Num>
              <Num size={32} tone="bone" style={{ textAlign: 'right' }}>
                {p.score}
              </Num>
            </div>
          )}
        />
      </div>

      <Marquee
        items={[
          nextCat
            ? `NEXT UP · ${nextCat.band} · `
            : 'LAST ROUND PLAYED · FINAL STANDINGS NEXT · ',
        ]}
        speed={20}
      />
    </Stage>
  );
}
