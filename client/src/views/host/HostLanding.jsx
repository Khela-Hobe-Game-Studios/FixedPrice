import {
  Stage, Band, BandCell, Marquee, Btn, Num } from '../../board';

const LOGO = `${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`;

export const LOBBY_MARQUEE = ['খেলা হবে! · PLAYERS JOIN ON THEIR PHONES · '];

/**
 * The screen sitting on the TV before anyone joins.
 *
 * It has one job and one button. Everything else on it is the game introducing
 * itself to a room that has not played before.
 */
export default function HostLanding({ onStart, pending }) {
  return (
    <Stage>
      <Band height={44}>
        <BandCell fill tone="green" align="between">
          <span className="bd-word" style={{ fontSize: 19, letterSpacing: '0.3em' }}>
            KHELA HOBE GAME STUDIOS
          </span>
          <Num size={14} style={{ color: 'rgba(255,248,236,.75)' }}>
            v2.0
          </Num>
        </BandCell>
      </Band>

      <div className="bd-body">
        <div className="hs-landing">
          <img className="hs-landing__mark" src={LOGO} alt="" />
          <div className="hs-landing__bn">এক দাম</div>
          <h1 className="hs-landing__word">Fixed Price</h1>
          <div className="hs-landing__tag">GUESS THE NUMBER · CLOSEST WINS</div>

          <Btn
            onClick={onStart}
            disabled={!!pending}
            data-testid="host-start"
            style={{ height: 72, fontSize: 34, letterSpacing: '0.2em', marginTop: 12 }}
          >
            {pending ? 'OPENING THE ROOM' : 'START GAME'}
          </Btn>

          <div className="hs-landing__meta" style={{ marginTop: 10 }}>
            <span className="bd-caret" />
            2-15 PLAYERS · 15 MIN
          </div>
        </div>
      </div>

      <Marquee items={LOBBY_MARQUEE} />
    </Stage>
  );
}
