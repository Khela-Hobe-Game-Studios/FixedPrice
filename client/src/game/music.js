import { Howl } from 'howler';
import { PLAYLISTS, FALLBACK, urlFor } from './tracks';

/**
 * The board's music — three playlists and the crossfades between them.
 *
 * Not a hook, and not React state. A module singleton, because the one thing
 * music must never do is restart: a `useRef` in `App` survived re-renders but the
 * rule it was really enforcing ("one track, owned by nobody in particular") is
 * clearer stated once here. Screens declare which stretch of the night they are
 * (`setMusic('startup' | 'game' | 'celebration' | null)`) and this decides what
 * that sounds like.
 *
 * Host device only — the caller enforces that, the same way it does for cues.
 * Fifteen phones must not fight the TV, and the one on a slow link is the one
 * everybody hears.
 *
 * Three things it has to survive, all of which have bitten this board before:
 *
 *   - **Autoplay refused.** A track can only start inside a user gesture, and the
 *     landing screen has not had one yet. `armMusic()` is wired to every
 *     pointerdown; until the first one lands, `want` is remembered and nothing
 *     plays. A `playerror` (Safari changing its mind mid-session) disarms and
 *     waits for the next gesture rather than giving up for the night.
 *   - **A track that isn't there.** A filename typo, or an upload that never
 *     finished, is a 404 the browser reports as `loaderror`. That URL is struck
 *     off for the session and the next candidate starts. When a whole pool is
 *     gone we fall through `FALLBACK` rather than standing in silence.
 *   - **Phases arriving faster than audio loads.** Play again → lobby →
 *     start is three transitions in as many seconds. Every load carries a
 *     generation stamp, so a track that finishes loading after the board has
 *     moved on unloads instead of playing over its successor.
 */

/** How far the music drops under the reveal, as a fraction of its own level. */
const DUCK = 0.34;
const DUCK_IN_MS = 250;
const DUCK_OUT_MS = 700;
const FADE_OUT_MS = 900;

let enabled = false;      // host device, SOUND on
let want = null;          // the playlist the board says it is on
let armed = false;        // a user gesture has happened here
let ducked = false;       // the reveal is running
let gen = 0;              // supersedes in-flight loads
let current = null;       // { key, url, pool, howl, base }
let startTimer = null;
let pendingKey = null;    // the playlist `startTimer` is waiting to bring up

/** The last track each pool handed out, so a rematch is a different one. */
const lastPlayed = new Map();
/** URLs that failed to load. Struck off for the session, not forever. */
const broken = new Set();

/** A random track from one pool, avoiding the one it played last. */
function pick(key) {
  const list = PLAYLISTS[key];
  if (!list) return null;

  const urls = list.tracks
    .map((file) => urlFor(list.folder, file))
    .filter((url) => !broken.has(url));
  if (!urls.length) return null;

  // Only avoid the repeat if there is something else to play. With one track in
  // the pool, that track is the answer.
  const fresh = urls.length > 1 ? urls.filter((u) => u !== lastPlayed.get(key)) : urls;
  const pool = fresh.length ? fresh : urls;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Walk the fallback chain until a pool has something playable. */
function resolve(key) {
  const seen = new Set();
  for (let k = key; k && !seen.has(k); k = FALLBACK[k]) {
    seen.add(k);
    const url = pick(k);
    if (url) return { pool: k, url };
  }
  return null;
}

/** Fade out and drop whatever is playing. */
function stopCurrent(fadeMs = FADE_OUT_MS) {
  clearTimeout(startTimer);
  startTimer = null;
  pendingKey = null;

  const c = current;
  current = null;
  if (!c) return;

  // Anything still loading for this track is now answering a question nobody asked.
  gen += 1;

  const { howl } = c;
  if (!fadeMs || !howl.playing()) {
    howl.unload();
    return;
  }
  howl.fade(howl.volume(), 0, fadeMs);
  howl.once('fade', () => howl.unload());
  // 'fade' does not fire if the sound ended or errored on the way out; this is the
  // backstop that stops a stalled Howl leaking an <audio> element per game.
  setTimeout(() => howl.unload(), fadeMs + 500);
}

function start(key) {
  const list = PLAYLISTS[key];
  const chosen = list && resolve(key);
  if (!chosen) return;

  const mine = (gen += 1);
  const base = list.volume;
  const target = ducked ? base * DUCK : base;

  // html5 so the track streams rather than decoding a whole 4MB buffer up front,
  // and Howler rather than `new Audio()` so Windows does not raise its OS media
  // popup over the board.
  const howl = new Howl({ src: [chosen.url], loop: true, volume: 0, html5: true });
  current = { key, url: chosen.url, pool: chosen.pool, howl, base };
  lastPlayed.set(chosen.pool, chosen.url);

  howl.once('loaderror', () => {
    if (mine !== gen) return;
    broken.add(chosen.url);
    current = null;
    howl.unload();
    start(key); // next candidate, or the fallback pool, or nothing
  });

  // Autoplay refused. Stay quiet and wait to be armed again rather than burning
  // the playlist retrying against a policy that will not change until a click.
  howl.once('playerror', () => {
    if (mine !== gen) return;
    armed = false;
    current = null;
    howl.unload();
  });

  howl.once('play', () => {
    if (mine !== gen) { howl.unload(); return; }
    howl.fade(0, target, list.fadeIn);
  });

  howl.play();
}

/** Bring the wanted playlist up, after its own delay. */
function begin(key) {
  const delay = PLAYLISTS[key]?.delay ?? 0;
  clearTimeout(startTimer);
  startTimer = null;
  pendingKey = null;
  if (!delay) { start(key); return; }

  pendingKey = key;
  startTimer = setTimeout(() => {
    startTimer = null;
    pendingKey = null;
    if (enabled && armed && want === key && !current) start(key);
  }, delay);
}

function sync() {
  if (!enabled || !want) { stopCurrent(); return; }
  if (current?.key === want) return;      // already on it
  if (startTimer && pendingKey === want) return; // already on its way
  // A pending start for some *other* playlist has to be cancelled, not waited
  // out: play again lands on the lobby inside celebration's 1.4s delay, and a
  // timer left running there would fire for a screen that had already gone.
  stopCurrent();
  if (!armed) return; // remembered; the next gesture picks it up
  begin(want);
}

// ── the API the board uses ───────────────────────────────────────────────────

/** Host device with SOUND on, or not. */
export function setMusicEnabled(on) {
  if (enabled === on) return;
  enabled = on;
  if (on) sync();
  else stopCurrent(400); // a toggle is a decision, not a scene change
}

/** Which stretch of the night this is: 'startup' | 'game' | 'celebration' | null. */
export function setMusic(key) {
  if (want === key) return;
  want = key ?? null;
  sync();
}

/**
 * A user gesture happened. Wire this to pointerdown/keydown for the whole
 * session, not just once: `playerror` disarms us, and the fix is the next click.
 */
export function armMusic() {
  armed = true;
  if (!enabled || !want || current || startTimer) return;
  begin(want);
}

/**
 * Get out of the way of the reveal. The music sits in the same low band as the
 * clunks and the bed, and the reveal is the one sequence built to be listened to.
 * Howler owns the fade because the track is an <audio> element — the cue engine
 * cannot reach it.
 */
export function duckMusic(on) {
  ducked = !!on;
  if (!current) return;
  const { howl, base } = current;
  howl.fade(howl.volume(), ducked ? base * DUCK : base, ducked ? DUCK_IN_MS : DUCK_OUT_MS);
}

export function stopAllMusic() {
  want = null;
  ducked = false;
  stopCurrent(0);
}

/** What is actually playing right now. */
export function musicState() {
  return {
    enabled,
    armed,
    want,
    ducked,
    playing: current?.key ?? null,
    pool: current?.pool ?? null,
    track: current?.url.split('/').slice(-2).join('/') ?? null,
    volume: current ? Number(current.howl.volume().toFixed(3)) : 0,
  };
}

/* Dev-only handle for the browser suite. In html5 mode Howler keeps its <audio>
 * elements in an internal pool and never puts them in the document, so a test has
 * nothing to look at, and the network is not the answer either — a second track
 * from the same pool is served out of cache with no request to observe. */
if (import.meta.env?.DEV) window.__music = musicState;
