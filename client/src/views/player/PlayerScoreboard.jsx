import { PhoneScreen, AvatarTile, Num, playerColor } from '../../board';
import { PhoneHeader, RotateGuard } from './parts';
import { category } from '../../categories';
import { useCountdown } from '../../game/clock';

const ORDINAL = ['1ST', '2ND', '3RD'];
const place = (r) => (r ? ORDINAL[r - 1] ?? `${r}TH` : '—');

/**
 * Where you stand, and everyone else under it.
 *
 * Your own block is the only thing at full output — you should be able to find your
 * position without reading, then look up. The rest of the field is there because a
 * party game where you cannot see who is behind you is a party game with no needling.
 */
export default function PlayerScoreboard({ scoreboard, me, timing }) {
  const rows = scoreboard?.scoreboard ?? [];
  const myIndex = rows.findIndex((r) => r.id === me?.id);
  const mine = rows[myIndex];
  const nextCat = scoreboard?.nextCategory ? category(scoreboard.nextCategory) : null;
  const left = useCountdown(timing);

  return (
    <PhoneScreen>
      <PhoneHeader left="STANDINGS" right={left === null ? undefined : String(left).padStart(2, '0')} />

      <div className="ps-body" style={{ padding: '14px 14px 0', gap: 12 }}>
        <div
          className="ps-band"
          style={{ background: playerColor(me?.colorIndex), alignItems: 'center' }}
          data-testid="my-standing"
        >
          <AvatarTile
            size={48}
            colorIndex={me?.colorIndex}
            name={me?.name ?? ''}
            avatar={mine?.avatar}
            barColor="var(--board)"
          />
          <div style={{ minWidth: 0, marginRight: 'auto' }}>
            <div className="bd-word" style={{ fontSize: 13, letterSpacing: '0.3em', opacity: 0.7 }}>
              YOU
            </div>
            <div className="bd-word" style={{ fontSize: 32 }}>
              {me?.name} · {place(myIndex + 1)}
            </div>
          </div>
          <Num size={46} tone="ink">
            {mine?.score ?? 0}
          </Num>
        </div>

        <div className="ps-scroll">
          <div className="ps-standings">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className={`ps-row${i >= 8 ? ' ps-row--tail' : ''}${r.id === me?.id ? ' ps-row--me' : ''}`}
              >
                <Num size={15} style={{ opacity: i >= 8 ? 0.7 : 1 }}>
                  {String(i + 1).padStart(2, '0')}
                </Num>
                <span className="ps-row__name">{r.name}</span>
                <Num size={20} tone="bone" style={{ textAlign: 'right' }}>
                  {r.score}
                </Num>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ps-cta" style={{ padding: 0 }}>
        <div
          className="ps-band"
          style={{
            background: nextCat ? nextCat.color : 'var(--flag-red)',
            color: nextCat ? nextCat.ink : '#fff',
            justifyContent: 'center',
            paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <span className="bd-word" style={{ fontSize: 15, letterSpacing: '0.26em' }}>
            {nextCat ? `NEXT: ${nextCat.name}` : 'LAST ROUND PLAYED'}
          </span>
        </div>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
