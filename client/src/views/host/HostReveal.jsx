import {
  Stage, Band, BandCell, Brand, SplitColumns, AvatarTile, Num, FlapNum, formatNum,
} from '../../board';
import { useRevealBeat, rowDelays } from '../../game/revealBeats';

/**
 * The emotional peak of every round, and the screen the whole design is judged on.
 *
 * The board never breaks frame — there is no confetti and nothing overlays the
 * layout. Brightness is the celebration: fifteen rows drop to 32% output for one
 * frame and the winner's band inverts to solid green with black type, which is the
 * only inverted element in the entire system. It is reserved for exactly this.
 *
 * No footer band. The fun fact lives in the left column, and that is what buys the
 * vertical room for fifteen rows on the right.
 */
export default function HostReveal({ reveal, round }) {
  const beat = useRevealBeat(reveal);
  const ranked = reveal?.ranked ?? [];
  const delays = rowDelays(ranked, reveal?.schedule);

  const winners = ranked.filter((r) => r.isWinner);
  const rest = ranked.filter((r) => !r.isWinner);
  const knockedOut = ranked.filter((r) => r.knockedOut);
  const outcome = reveal?.outcome ?? 'single';
  const lit = beat !== 'blackout';

  return (
    <Stage data-beat={beat} className={beat === 'winner' ? 'hs-reveal--flash' : ''}>
      <Band>
        <Brand />
        <BandCell fill tone="panel" align="between">
          <span className="bd-label bd-label--bright" style={{ fontSize: 18 }}>
            ROUND {String(round?.round ?? 1).padStart(2, '0')}/{round?.total ?? '—'}
          </span>
          <span className="bd-label" style={{ fontSize: 15, letterSpacing: '0.18em' }}>
            {round?.question}
          </span>
        </BandCell>
        <BandCell width={160} tone="red" align="center">
          <span className="bd-word" style={{ fontSize: 20, letterSpacing: '0.28em' }}>
            REVEAL
          </span>
        </BandCell>
      </Band>

      <div className="hs-reveal">
        <div className="hs-reveal__left bd-rule-r" data-lit={lit || undefined}>
          <span className="bd-label" style={{ fontSize: 16 }}>
            ACTUAL PRICE
          </span>

          <div className="hs-reveal__answer">
            {beat === 'blackout' ? (
              <Num size={104} style={{ opacity: 0 }}>
                —
              </Num>
            ) : (
              <FlapNum
                value={reveal?.correctAnswer}
                size={104}
                step={reveal?.schedule?.digitStep ?? 90}
                className="hs-reveal__target"
                data-testid="correct-answer"
              />
            )}
            {round?.unit && (
              <span className="bd-mono" style={{ fontSize: 22, opacity: 0.6 }}>
                {round.unit}
              </span>
            )}
          </div>

          {/* In sudden death the knockout is the news, not the winner — the band
              that would celebrate someone instead names who just went out. */}
          {reveal?.finale && knockedOut.length > 0 ? (
            <div className="hs-winner hs-winner--none" data-testid="knocked-out">
              <span className="bd-word" style={{ fontSize: 20, letterSpacing: '0.3em', opacity: 0.8 }}>
                KNOCKED OUT
              </span>
              <div className="bd-word" style={{ fontSize: 44, marginTop: 6 }}>
                {knockedOut.map((r) => r.name).join(' & ')}
              </div>
              <span className="bd-mono" style={{ fontSize: 14, color: '#fff', opacity: 0.8 }}>
                {reveal.finale.left} LEFT
              </span>
            </div>
          ) : outcome === 'nobody_close' ? (
            <div className="hs-winner hs-winner--none">
              <span className="bd-word" style={{ fontSize: 38, letterSpacing: '0.06em' }}>
                NOBODY WAS CLOSE
              </span>
            </div>
          ) : (
            <div className={`hs-winner${winners.length > 1 ? ' hs-winner--split' : ''}`}>
              {winners.map((w) => (
                <div key={w.id} className="hs-winner__band">
                  <div className="hs-winner__head">
                    <span className="bd-word" style={{ fontSize: 14, letterSpacing: '0.3em', opacity: 0.7 }}>
                      {winners.length > 1 ? 'JOINT CLOSEST' : 'CLOSEST'}
                    </span>
                    <span className="hs-winner__stamp bd-bn">এক দাম!</span>
                  </div>
                  <div className="hs-winner__row">
                    <AvatarTile
                      size={winners.length > 1 ? 46 : 78}
                      colorIndex={w.colorIndex}
                      name={w.name}
                      avatar={w.avatar}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="hs-winner__name"
                        style={{ fontSize: winners.length > 1 ? 32 : 50 }}
                        data-testid="round-winner"
                      >
                        {w.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <Num size={winners.length > 1 ? 24 : 36} tone="ink">
                          {formatNum(w.guess)}
                        </Num>
                        <Num size={17} tone="ink" style={{ opacity: 0.75 }}>
                          OFF BY {formatNum(w.distance)}
                        </Num>
                      </div>
                    </div>
                    <span className="hs-winner__points">
                      <Num size={32} tone="green">
                        +{w.points}
                      </Num>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {reveal?.funFact && (
            <div className="hs-reveal__fact bd-push bd-rule-t">
              <span className="bd-label bd-label--amber" style={{ fontSize: 13, letterSpacing: '0.3em' }}>
                DID YOU KNOW
              </span>
              <p className="hs-reveal__facttext">{reveal.funFact}</p>
            </div>
          )}
        </div>

        <div className="hs-reveal__right">
          <div className="hs-reveal__head">
            <span className="bd-label bd-label--tight">ALL GUESSES</span>
            <span className="bd-label" style={{ fontSize: 13, letterSpacing: '0.2em' }}>
              CLOSEST → WILDEST
            </span>
          </div>

          <SplitColumns
            className="bd-fill"
            items={rest}
            gap="0 22px"
            rowMax={84}
            renderItem={(r) => (
              <div
                key={r.id}
                className={`hs-rev${r.wildMiss || r.knockedOut ? ' hs-rev--wild' : ''}`}
                style={{ '--row-delay': `${Math.round(delays.get(r.id) ?? 0)}ms` }}
                data-testid="reveal-row"
              >
                {/* Green rank is earned by being within 5% — it is the third
                    channel that says "close" without anyone reading a digit. */}
                <Num size={15} tone={r.wildMiss || r.knockedOut ? 'red' : r.nearMiss ? 'green' : 'amber'}>
                  {String(r.rank ?? '—').padStart(2, '0')}
                </Num>
                <AvatarTile
                  size={22}
                  colorIndex={r.colorIndex}
                  name={r.name}
                  avatar={r.avatar}
                  dim={r.wildMiss || r.knockedOut}
                />
                <span className="hs-rev__name">{r.name}</span>
                <Num size={24} tone={r.wildMiss || r.knockedOut ? 'red' : 'amber'} className="hs-rev__guess">
                  {r.submitted ? formatNum(r.guess) : '—'}
                </Num>
                <Num size={14} className="hs-rev__delta" tone={r.wildMiss || r.knockedOut ? 'red' : 'amber'}>
                  {r.knockedOut ? 'OUT' : r.submitted ? formatNum(r.distance) : 'NO GUESS'}
                </Num>
              </div>
            )}
          />
        </div>
      </div>
    </Stage>
  );
}
