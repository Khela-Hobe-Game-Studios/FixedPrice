import { useEffect, useState } from 'react';

/**
 * The two breakpoints the app actually has an opinion about.
 *
 * BOARD_WIDTH is "is this device plausibly the shared screen" — the guess the landing
 * makes about which side of the game you are on.
 *
 * PORTRAIT_PHONE is "the board cannot be drawn here": 16:9 in a portrait phone scales
 * to width/1280, so below 575px the board's 19px band labels land under 8px. It is
 * duplicated as a media query in board.css (.bd-turn) because the guard that replaces
 * the board is CSS and the landing that replaces it is React — if you change one,
 * change the other.
 */
export const BOARD_WIDTH = '(min-width: 900px)';
export const PORTRAIT_PHONE = '(orientation: portrait) and (max-width: 575px)';

/**
 * matchMedia as state.
 *
 * Reads once on mount and then follows the query, which is the whole point: the
 * landing used to sample window.innerWidth in a useState initialiser, so a browser
 * dragged from desktop width down to phone width kept rendering the host board at
 * 0.30 scale, and rotating a tablet never changed its mind either.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    // Re-read on subscribe: the viewport can have changed between the initialiser
    // and this effect, and in StrictMode it reliably has.
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
