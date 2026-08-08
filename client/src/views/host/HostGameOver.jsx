import { useState } from 'react';
import {
  Stage, Band, BandCell, ActionBar, AvatarTile, Num, SplitColumns, playerColor } from '../../board';

const LOGO = `${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`;

/**
 * Ranks with ties shared, so two players on 14 are both first and nobody is second.
 *
 * A finale overrides this: sudden death has already decided the order among the
 * finalists, and two of them on the same points are not joint anything — one
 * knocked the other out.
 */
export function placings(final = [], hasFinale = false) {
  if (hasFinale) return final.map((p, i) => ({ ...p, place: i + 1 }));

  let rank = 0;
  let prev = null;
  return final.map((p, i) => {
    if (p.score !== prev) rank = i + 1;
    prev = p.score;
    return { ...p, place: rank };
  });
}

/**
 * The winner, the podium, and the mascot's one big appearance.
 *
 * The podium is three slots, so in a room of fifteen it is also the twelve people it
 * does not mention — hence the second button. Everything it needs is already in the
 * final payload, so the standings are a view of this screen rather than a trip back
 * to the server.
 */
export default function HostGameOver({ final, onPlayAgain, initialStandings = false }) {
  // `initialStandings` exists so the gallery can mount the second view; the fit gate
  // derives from the gallery, and a screen it cannot mount is a screen nothing checks.
  const [standings, setStandings] = useState(initialStandings);
  const results = placings(final?.final ?? [], !!final?.finale);
  const champions = results.filter((p) => p.place === 1);
  const winner = champions[0];
  const roundsTaken = winner?.roundsTaken;
  const leader = Math.max(1, ...results.map((p) => p.score));

  // Podium slots come from the finishing order, not from the place number: with
  // shared places there may be no "3rd", and a column that silently vanishes
  // leaves a dead black gap where a player should be.
  const podium = [
    { slot: 2, height: '66%', player: results[1] },
    { slot: 1, height: '100%', player: results[0] },
    { slot: 3, height: '50%', player: results[2] },
  ];

  if (standings) {
    return (
      <Stage>
        <Band>
          <BandCell fill tone="amber" align="center">
            <span className="bd-word" style={{ fontSize: 23, letterSpacing: '0.3em' }}>
              FINAL STANDINGS · {results.length} PLAYERS
            </span>
          </BandCell>
        </Band>

        <div className="bd-body">
          <SplitColumns
            className="hs-board"
            items={results}
            gap="0 26px"
            rowMax={72}
            columnClassName=""
            renderItem={(p, i, col) => (
              <div
                key={p.id}
                className={`hs-row${col === 1 ? ' hs-board__col--dim' : ''}`}
                data-testid="final-row"
              >
                <Num size={17} className="hs-row__rank" style={{ opacity: col === 1 ? 0.6 : 1 }}>
                  {String(p.place).padStart(2, '0')}
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
                <Num size={16} tone="green" style={{ opacity: p.place === 1 ? 0.85 : 0.25 }}>
                  {p.place === 1 ? 'WON' : '—'}
                </Num>
                <Num size={32} tone="bone" style={{ textAlign: 'right' }}>
                  {p.score}
                </Num>
              </div>
            )}
          />
        </div>

        <ActionBar>
          <button
            type="button"
            onClick={onPlayAgain}
            data-testid="play-again"
            style={{ background: 'var(--led-green)', color: 'var(--board)' }}
          >
            PLAY AGAIN
          </button>
          <button
            type="button"
            onClick={() => setStandings(false)}
            style={{ background: 'var(--panel)', color: 'var(--out-55)' }}
          >
            BACK TO THE PODIUM
          </button>
        </ActionBar>
      </Stage>
    );
  }

  return (
    <Stage>
      <Band>
        <BandCell fill tone="amber" align="center">
          <span className="bd-word" style={{ fontSize: 23, letterSpacing: '0.3em' }}>
            FINAL · {final?.rounds ?? results.length} ROUNDS PLAYED
          </span>
        </BandCell>
      </Band>

      <div className="hs-over">
        <div className="hs-over__mascot">
          <img src={LOGO} alt="" />
          <span className="bd-bn" style={{ fontSize: 20, color: 'var(--amber)' }}>
            খেলা শেষ!
          </span>
        </div>

        <div className="hs-over__right">
          <div className="hs-over__winner">
            <AvatarTile
              size={112}
              colorIndex={winner?.colorIndex}
              name={winner?.name ?? ''}
              avatar={winner?.avatar}
              barColor="var(--led-green)"
              bar={6}
            />
            <div style={{ minWidth: 0 }}>
              <div className="bd-label" style={{ fontSize: 26, letterSpacing: '0.28em' }}>
                {champions.length > 1 ? 'JOINT WINNERS' : 'WINNER'}
              </div>
              <div className="hs-over__name" data-testid="winner">
                {champions.map((c) => c.name).join(' & ')}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <Num size={64} tone="bone">
                {winner?.score ?? 0}
              </Num>
              <div className="bd-label" style={{ fontSize: 14, marginTop: 6 }}>
                POINTS{roundsTaken ? ` · ${roundsTaken} TAKEN` : ''}
              </div>
            </div>
          </div>

          <div className="hs-podium">
            {podium.map(({ slot, height, player }) => (
              <div key={slot} className={`hs-podium__slot hs-podium__slot--${slot}`} style={{ height }}>
                {player ? (
                  <>
                    <div className="hs-podium__who">
                      <AvatarTile
                        size={34}
                        colorIndex={player.colorIndex}
                        name={player.name}
                        avatar={player.avatar}
                      />
                      <span className="hs-podium__name">{player.name}</span>
                      <Num size={22} style={{ marginLeft: 'auto' }}>
                        {player.score}
                      </Num>
                    </div>
                    <div className={`hs-podium__block hs-podium__block--${slot}`}>
                      <Num
                        size={slot === 1 ? 42 : 30}
                        tone={slot === 1 ? 'ink' : 'bone'}
                        style={{ opacity: slot === 1 ? 1 : 0.5 }}
                      >
                        {String(player.place).padStart(2, '0')}
                      </Num>
                    </div>
                  </>
                ) : (
                  <div className="hs-podium__block" style={{ opacity: 0.3 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ActionBar>
        <button
          type="button"
          onClick={onPlayAgain}
          data-testid="play-again"
          style={{ background: 'var(--led-green)', color: 'var(--board)' }}
        >
          PLAY AGAIN
        </button>
        <button
          type="button"
          onClick={() => setStandings(true)}
          data-testid="full-standings"
          style={{ background: 'var(--panel)', color: 'var(--out-55)' }}
        >
          FULL STANDINGS
        </button>
      </ActionBar>
    </Stage>
  );
}
