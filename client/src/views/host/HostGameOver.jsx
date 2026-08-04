import {
  Stage, Band, BandCell, ActionBar, AvatarTile, Num } from '../../board';

const LOGO = `${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`;

/** Ranks with ties shared, so two players on 14 are both first and nobody is second. */
export function placings(final = []) {
  let rank = 0;
  let prev = null;
  return final.map((p, i) => {
    if (p.score !== prev) rank = i + 1;
    prev = p.score;
    return { ...p, place: rank };
  });
}

/** The winner, the podium, and the mascot's one big appearance. */
export default function HostGameOver({ final, onPlayAgain, onStandings }) {
  const results = placings(final?.final ?? []);
  const champions = results.filter((p) => p.place === 1);
  const winner = champions[0];
  const roundsTaken = winner?.roundsTaken;

  const slot = (place) => results.find((p) => p.place === place);
  const podium = [
    { place: 2, height: '66%', player: slot(2) },
    { place: 1, height: '100%', player: winner },
    { place: 3, height: '50%', player: slot(3) },
  ];

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
            {podium.map(({ place, height, player }) => (
              <div key={place} className={`hs-podium__slot hs-podium__slot--${place}`} style={{ height }}>
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
                    <div className={`hs-podium__block hs-podium__block--${place}`}>
                      <Num
                        size={place === 1 ? 42 : 30}
                        tone={place === 1 ? 'ink' : 'bone'}
                        style={{ opacity: place === 1 ? 1 : 0.5 }}
                      >
                        {String(place).padStart(2, '0')}
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
          onClick={onStandings}
          style={{ background: 'var(--panel)', color: 'var(--out-55)' }}
        >
          FULL STANDINGS
        </button>
      </ActionBar>
    </Stage>
  );
}
