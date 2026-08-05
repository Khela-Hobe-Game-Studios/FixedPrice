import { useEffect, useRef } from 'react';
import useMediaQuery, { PORTRAIT_PHONE } from '../hooks/useMediaQuery';

const STAGE_W = 1280;
const STAGE_H = 720;

/**
 * The host board.
 *
 * Authored at exactly 1280x720 — every measurement in this design is an absolute
 * pixel value — and scaled to fit whatever it is plugged into. A 1920x1080 TV gets
 * an exact 1.5x; a 1366x768 laptop gets 1.067x; the preview harness at 1280x720 gets
 * 1.0 and screenshots pixel-for-pixel.
 *
 * Scaling the whole board rather than reflowing it is what makes "the host screen
 * never scrolls" structurally true instead of a rule every screen has to remember.
 * Inside the stage, layout still uses the flex/stretch discipline so a roster of 2
 * and a roster of 15 both fit without a fork.
 */
export default function Stage({ children, className = '', onLeaveBoard, ...rest }) {
  const ref = useRef(null);
  const tooNarrow = useMediaQuery(PORTRAIT_PHONE);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
      el.style.setProperty('--stage-scale', String(scale));
    };

    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="bd-stagewrap">
      <div ref={ref} className={`bd-stage bd-dots ${className}`} data-stage {...rest}>
        <span className="bd-rivet bd-rivet--tl" />
        <span className="bd-rivet bd-rivet--tr" />
        <span className="bd-rivet bd-rivet--bl" />
        <span className="bd-rivet bd-rivet--br" />
        <div className="bd-screen">{children}</div>
      </div>
      {tooNarrow && <TurnGuard onLeaveBoard={onLeaveBoard} />}
    </div>
  );
}

/**
 * The board's half of the rotation contract.
 *
 * 16:9 inside a portrait phone can only ever be scale = width/1280 — 0.30 on a 390px
 * screen, which is a 5px header and a room code nobody can read. There is no layout
 * that fixes that; there is only a different shape of screen. So below the width
 * where the board stops being legible, portrait asks for the phone to be turned, and
 * landscape gets the board at 0.54, which is small but real.
 *
 * PORTRAIT_PHONE is that width, and it is a JS constant rather than a media query
 * here precisely so it is only written once: this used to be a `@media` block in
 * board.css that had to be kept in step with the hook by hand, and a breakpoint that
 * drifts means either an unreadable board with no guard over it, or a guard over a
 * board that was perfectly legible.
 *
 * `onLeaveBoard` is offered only where being here is a mistake you can still back out
 * of — before a room exists. Once one does, this device is running a live game and
 * the way out is to turn the phone, not to abandon fifteen people.
 *
 * The player has the mirror of this (RotateGuard): the phone is played upright, the
 * board is played wide.
 */
function TurnGuard({ onLeaveBoard }) {
  return (
    <div className="bd-turn" data-testid="turn-guard">
      <span className="bd-word" style={{ fontSize: 30 }}>
        Turn your phone sideways
      </span>
      <span className="bd-mono" style={{ fontSize: 13, color: 'rgba(255,255,255,.8)' }}>
        THE BOARD IS 16:9 — IT WANTS A TV, AND WILL SETTLE FOR LANDSCAPE
      </span>
      {onLeaveBoard && (
        <button
          type="button"
          className="bd-turn__exit"
          onClick={onLeaveBoard}
          data-testid="leave-board"
        >
          JOINING A GAME INSTEAD?
        </button>
      )}
    </div>
  );
}

/**
 * The phone.
 *
 * No bezel, no scaling — a phone is a real viewport at its real size. Always night:
 * a phone is held close and glanced at, and the dark board is the more legible of
 * the two at arm's length, so it does not follow the host's day/night setting.
 */
export function PhoneScreen({ children, className = '', ...rest }) {
  return (
    <div className={`bd-phone bd-dots ${className}`} data-phone {...rest}>
      <div className="bd-screen">{children}</div>
    </div>
  );
}
