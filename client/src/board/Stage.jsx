import { useEffect, useRef } from 'react';

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
export default function Stage({ children, className = '', ...rest }) {
  const ref = useRef(null);

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
