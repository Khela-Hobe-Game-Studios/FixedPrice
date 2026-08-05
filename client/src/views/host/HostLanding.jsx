import {
  Stage, PhoneScreen, Band, BandCell, Marquee, Btn, Num } from '../../board';

const LOGO = `${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`;

export const LOBBY_MARQUEE = ['খেলা হবে! · PLAYERS JOIN ON THEIR PHONES · '];

/**
 * The screen sitting on the TV before anyone joins.
 *
 * It has one job and one button. Everything else on it is the game introducing
 * itself to a room that has not played before.
 *
 * `phone` is the one screen in the host flow that does not fall back to "turn your
 * phone sideways". This is the front door: somebody arriving on a phone has not
 * chosen to run a board yet, and answering their first tap with a rotation demand
 * asks them to commit to something before they have been told what it is. So the
 * landing has a real phone layout, and the rotation contract starts one screen
 * later, once they have actually chosen to host.
 */
export default function HostLanding({ onStart, onJoinInstead, pending, phone = false }) {
  if (phone) {
    return (
      <PhoneScreen>
        <Band height="var(--band-phone)">
          <BandCell fill tone="green" align="between">
            <span className="bd-word" style={{ fontSize: 15, letterSpacing: '0.26em' }}>
              KHELA HOBE GAME STUDIOS
            </span>
            <Num size={13} style={{ color: 'rgba(255,248,236,.75)' }}>
              v2.0
            </Num>
          </BandCell>
        </Band>

        <div className="hs-landing hs-landing--phone">
          <img className="hs-landing__mark" src={LOGO} alt="" />
          <div className="hs-landing__bn">এক দাম</div>
          <h1 className="hs-landing__word">Fixed Price</h1>
          <div className="hs-landing__tag">GUESS THE NUMBER · CLOSEST WINS</div>
          <div className="hs-landing__meta">
            <span className="bd-caret" />
            2-15 PLAYERS · 15 MIN
          </div>
        </div>

        <div className="ps-cta">
          <Btn block cta onClick={onStart} disabled={!!pending} data-testid="host-start">
            {pending ? 'OPENING THE ROOM' : 'START GAME'}
          </Btn>
          {/* Said before they tap, not after: the board is 16:9 and this is a phone. */}
          <span className="bd-mono" style={{ fontSize: 11, textAlign: 'center' }}>
            THE BOARD RUNS SIDEWAYS — A TV OR LAPTOP IS BETTER
          </span>
          {onJoinInstead && (
            <Btn block small tone="panel" onClick={onJoinInstead} data-testid="join-instead">
              JOINING A GAME INSTEAD?
            </Btn>
          )}
        </div>
      </PhoneScreen>
    );
  }

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

          {/* This screen is the board. Somebody opening it on a laptop to play
              along needs a way out of hosting. */}
          {onJoinInstead && (
            <button
              type="button"
              className="bd-label"
              style={{ fontSize: 13, marginTop: 6 }}
              onClick={onJoinInstead}
              data-testid="join-instead"
            >
              JOINING A GAME INSTEAD?
            </button>
          )}
        </div>
      </div>

      <Marquee items={LOBBY_MARQUEE} />
    </Stage>
  );
}
