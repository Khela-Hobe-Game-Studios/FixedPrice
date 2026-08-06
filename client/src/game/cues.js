/**
 * The board's voice.
 *
 * Twelve cues, synthesised. No files, no dependency, no CDN — the same reason the
 * design system is plain CSS. Every cue here is a filtered noise burst or a square
 * wave with a hard envelope, because that is what the board looks like: relays,
 * split-flaps and LED signage. A sampled library would have been someone else's
 * idea of a scoreboard bolted onto ours.
 *
 * Three rules carry the implementation:
 *
 *   1. **Nothing eases.** Attacks are 1-3ms. The visual language is `steps()`; a
 *      cue with a 40ms fade-in is the audio equivalent of an ease-out and reads as
 *      soft against a board that snaps.
 *   2. **Everything is scheduled on the AudioContext clock, never setTimeout.** The
 *      reveal fires row ticks 60ms apart at 9+ players. setTimeout jitter under
 *      React render load is 20-50ms, so a tick chain scheduled that way audibly
 *      swims against rows animating off `animation-delay`. `voiceAt()` takes an
 *      absolute ctx time and the whole sequence is handed to Web Audio at once.
 *   3. **A cue you cannot cancel is a bug.** Phases get cut short — everyone
 *      answers, the host skips, the game ends mid-reveal. Every voice owns a group
 *      gain tracked in `live`, so `killAll()` silences a sequence that is already
 *      scheduled minutes of samples deep.
 *
 * Host device only. Fifteen phones must not fight the TV — the phone's half of this
 * is `haptics.js`.
 */

let ctx = null;
let master = null;    // every voice lands here
let noiseBuf = null;
let muted = false;

/**
 * Whether a gesture has ever armed the context.
 *
 * Not the same question as `ctx.state === 'running'`, and conflating the two costs
 * you cues. `resume()` is asynchronous: for tens of milliseconds after the click
 * that unlocks audio the state still reads `suspended`, and every cue fired in that
 * window is silently dropped. The same gap reopens after every `visibilitychange`
 * resume. So playback gates on intent, not on state — a context that is resuming
 * will honour anything scheduled against it, whereas one that has never had a
 * gesture would only accumulate nodes that never sound.
 */
let armed = false;

/**
 * Voices currently scheduled or sounding, bucketed by channel.
 *
 * Channels exist because the two long sequences have to be cancellable
 * independently: a game resumed mid-question reschedules its countdown, and if
 * that could only be done by killing everything it would also kill the phase's own
 * cue and any reveal still ringing out. `kill('clock')` is the narrow instrument.
 */
const live = new Map();

function bucket(channel) {
  let set = live.get(channel);
  if (!set) { set = new Set(); live.set(channel, set); }
  return set;
}

/* The one cue synthesis cannot fake. Everything else is mechanical and belongs in
 * an oscillator; a crowd is four hundred people and belongs in a recording. Until
 * one is loaded the swell below stands in for it. */
let crowdBuf = null;

const clampF = (v) => Math.max(v, 1);
const clampG = (v) => Math.max(v, 0.0001);

export function audioReady() {
  return armed && !!ctx;
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  ctx = new AC();

  // Fifteen row ticks, a klaxon and a crowd can overlap inside 200ms. Without this
  // the peak clips on a TV's own speakers, which is where this is actually played.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(comp).connect(ctx.destination);

  const frames = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  /* Every platform suspends the context out from under us and none of them resume
   * it: iOS on any audio interruption (a call, Siri, the ringer switch), Android
   * Chrome when the tab backgrounds, desktop when the laptop sleeps. A host that
   * closed the lid between rounds would otherwise come back to a silent board for
   * the rest of the night, with no way to fix it short of a reload. Registered here
   * rather than in the hook so it cannot be forgotten by a caller. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx.state === 'suspended') ctx.resume().catch(() => {});
  });

  return ctx;
}

/** Autoplay needs a gesture. Safe to call on every host click; it no-ops once running. */
export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  armed = true;
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function setMuted(next) {
  muted = next;
  if (muted) { killAll(); stopBed(); }
}

/**
 * Upgrade the crowd from the synthesised swell to a real recording.
 *
 * Optional and late-bound on purpose: the game is complete without it, and the file
 * can land on R2 whenever it lands without a code change beyond the URL.
 */
export function loadCrowd(url) {
  const c = ensure();
  if (!c || crowdBuf) return;
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((b) => c.decodeAudioData(b))
    .then((buf) => { crowdBuf = buf; })
    .catch(() => { /* the swell is a working fallback, not a failure state */ });
}

// ── synthesis primitives ─────────────────────────────────────────────────────

/** A group gain every voice hangs off, so the voice can be killed as one thing. */
function group(t, dur, channel) {
  const g = ctx.createGain();
  g.gain.value = 1;
  g.connect(master);

  const set = bucket(channel);
  const rec = { g };
  set.add(rec);
  rec.timer = setTimeout(() => {
    try { g.disconnect(); } catch { /* already torn down */ }
    set.delete(rec);
  }, Math.max((t - ctx.currentTime + dur) * 1000 + 250, 0));

  return g;
}

/** Hard-edged AD envelope. Exponential ramps cannot reach zero, hence clampG. */
function env(t, dur, peak, attack = 0.002) {
  const a = Math.min(attack, dur * 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(clampG(peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function osc(bus, type, freq, t, dur, peak, { to, attack } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(clampF(freq), t);
  if (to) o.frequency.exponentialRampToValueAtTime(clampF(to), t + dur);
  o.connect(env(t, dur, peak, attack)).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(bus, t, dur, peak, { type = 'bandpass', freq = 2000, q = 1, to, attack } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(clampF(freq), t);
  if (to) f.frequency.exponentialRampToValueAtTime(clampF(to), t + dur);
  f.Q.value = q;
  s.connect(f).connect(env(t, dur, peak, attack)).connect(bus);
  s.start(t);
  s.stop(t + dur + 0.02);
}

// ── the twelve ───────────────────────────────────────────────────────────────

export const VOICES = {
  /** Relay clunk — a phase changing, a band swapping. The board's punctuation. */
  clunk: {
    dur: 0.12,
    render(t, bus, { level = 1 } = {}) {
      noise(bus, t, 0.018, 0.45 * level, { freq: 2400, q: 0.8, to: 900 });
      osc(bus, 'square', 96, t, 0.075, 0.30 * level, { to: 62 });
      osc(bus, 'sine', 48, t + 0.004, 0.07, 0.26 * level);
    },
  },

  /** Mechanical flick — one split-flap digit landing. Fires per char of FlapNum. */
  flick: {
    dur: 0.05,
    render(t, bus, { level = 1 } = {}) {
      noise(bus, t, 0.024, 0.26 * level, { freq: 3000, q: 1.4, to: 1500 });
      osc(bus, 'square', 420, t, 0.016, 0.09 * level, { to: 300 });
    },
  },

  /** Tick — one reveal row lighting. Fifteen of these land inside a second. */
  tick: {
    dur: 0.02,
    render(t, bus, { level = 1 } = {}) {
      noise(bus, t, 0.010, 0.20 * level, { type: 'highpass', freq: 2600 });
    },
  },

  /** Keypad tick — the brighter, smaller sibling. Code entry, settings. */
  keypad: {
    dur: 0.03,
    render(t, bus, { level = 1 } = {}) {
      noise(bus, t, 0.012, 0.18 * level, { freq: 4200, q: 2 });
      osc(bus, 'square', 1180, t, 0.012, 0.05 * level);
    },
  },

  /** Lock-in thunk — an answer committed, a point posted. Weight, not brightness. */
  thunk: {
    dur: 0.16,
    render(t, bus, { level = 1 } = {}) {
      noise(bus, t, 0.020, 0.30 * level, { type: 'lowpass', freq: 1200 });
      osc(bus, 'square', 132, t, 0.11, 0.34 * level, { to: 68 });
      osc(bus, 'sine', 66, t, 0.14, 0.26 * level, { to: 40 });
    },
  },

  /** Countdown beep — the last five seconds, one per second boundary. */
  beep: {
    dur: 0.09,
    render(t, bus, { level = 1, last = false } = {}) {
      const f = last ? 587 : 880;
      const d = last ? 0.26 : 0.075;
      osc(bus, 'square', f, t, d, 0.24 * level);
      if (last) osc(bus, 'square', f / 2, t, d, 0.12 * level);
    },
  },

  /** Klaxon — time is up. Stadium horn in the board's own square-wave voice. */
  klaxon: {
    dur: 0.95,
    render(t, bus, { level = 1 } = {}) {
      const dur = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(clampG(0.30 * level), t + 0.012);
      g.gain.setValueAtTime(clampG(0.30 * level), t + dur - 0.20);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus);

      // A fourth apart, and both sag as the horn dies — the detune is the character.
      [[233, 1], [311, 0.55]].forEach(([f, mix]) => {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(f, t);
        o.frequency.setValueAtTime(f, t + dur - 0.22);
        o.frequency.exponentialRampToValueAtTime(f * 0.86, t + dur);
        const og = ctx.createGain();
        og.gain.value = mix;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + dur + 0.02);
      });
    },
  },

  /** Category stab — the intro flash. A rising fifth, hit hard. */
  stab: {
    dur: 0.36,
    render(t, bus, { level = 1 } = {}) {
      noise(bus, t, 0.03, 0.26 * level, { freq: 1800, q: 0.7 });
      osc(bus, 'square', 294, t, 0.26, 0.20 * level);
      osc(bus, 'square', 440, t + 0.045, 0.22, 0.17 * level);
      osc(bus, 'square', 880, t + 0.045, 0.20, 0.05 * level);
    },
  },

  /** Rising hum — the clock running out. Long, and meant to be felt not heard. */
  humRise: {
    dur: 8,
    render(t, bus, { level = 1, dur = 8 } = {}) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(clampG(0.16 * level), t + dur * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(140, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      lp.Q.value = 3;
      lp.connect(g);

      [[58, 1], [58.7, 0.8], [116, 0.35]].forEach(([f, mix]) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
        const og = ctx.createGain();
        og.gain.value = mix;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    },
  },

  /** Crowd — the winner beat. The board never breaks frame, so this is the payoff. */
  crowd: {
    dur: 1.8,
    render(t, bus, { level = 1 } = {}) {
      if (crowdBuf) {
        const s = ctx.createBufferSource();
        s.buffer = crowdBuf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(clampG(0.7 * level), t + 0.05);
        s.connect(g).connect(bus);
        s.start(t);
        return;
      }
      const dur = 1.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(clampG(0.30 * level), t + 0.13);
      g.gain.exponentialRampToValueAtTime(clampG(0.15 * level), t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus);

      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.6;
      bp.frequency.setValueAtTime(700, t);
      bp.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
      bp.frequency.exponentialRampToValueAtTime(600, t + dur);
      s.connect(bp).connect(g);
      s.start(t);
      s.stop(t + dur + 0.02);
    },
  },

  /** Fanfare — game over. Four notes up, the last one held. */
  fanfare: {
    dur: 1.2,
    render(t, bus, { level = 1 } = {}) {
      [[392, 0], [494, 0.12], [587, 0.24], [784, 0.36]].forEach(([f, at], i) => {
        const d = i === 3 ? 0.7 : 0.15;
        osc(bus, 'square', f, t + at, d, 0.20 * level);
        osc(bus, 'square', f * 2, t + at, d, 0.06 * level);
      });
      noise(bus, t + 0.36, 0.5, 0.10 * level, { freq: 3000, q: 0.5, to: 1200 });
    },
  },

  /** Nobody was close. The anti-fanfare — used where the crowd would have gone. */
  deflate: {
    dur: 0.7,
    render(t, bus, { level = 1 } = {}) {
      osc(bus, 'square', 233, t, 0.6, 0.18 * level, { to: 110 });
      osc(bus, 'square', 175, t + 0.06, 0.55, 0.12 * level, { to: 82 });
      noise(bus, t, 0.05, 0.12 * level, { type: 'lowpass', freq: 800 });
    },
  },
};

// ── playback ─────────────────────────────────────────────────────────────────

/** Schedule a voice at an absolute AudioContext time. */
export function voiceAt(name, when, opts, channel = 'fx') {
  if (muted || !armed) return;
  const c = ensure();
  if (!c) return;
  const v = VOICES[name];
  if (!v) return;
  const t = Math.max(when, c.currentTime);
  v.render(t, group(t, v.dur, channel), opts);
}

/** Play now. A hair of lookahead so the envelope's first ramp is not truncated. */
export function cue(name, opts, channel) {
  const c = ensure();
  if (!c) return;
  voiceAt(name, c.currentTime + 0.005, opts, channel);
}

/**
 * Schedule a whole sequence against a shared origin.
 *
 * `elapsedMs` is how far into the sequence we already are, which for the reveal is
 * `serverNow() - startedAt`. Entries already in the past are dropped rather than
 * fired late — a host that rejoins three seconds into a reveal must not replay the
 * blackout, which is the same rule the visuals follow.
 *
 * The whole sequence goes to Web Audio in one pass so every offset is measured
 * against the audio clock. Chaining these off timers instead would put 20-50ms of
 * scheduler jitter between rows that are 60ms apart.
 */
export function sequence(entries, elapsedMs = 0, channel = 'fx') {
  if (muted || !armed) return;
  const c = ensure();
  if (!c) return;
  const base = c.currentTime - elapsedMs / 1000;
  entries.forEach((e) => {
    // Strictly behind us, not "close to now". A tolerance here silently swallowed
    // the reveal's blackout, which sits at offset 0 and is the beat the whole
    // sequence opens on. Anything level with `elapsedMs` is scheduled and clamped
    // to the current time by voiceAt.
    if (e.at < elapsedMs) return;
    voiceAt(e.name, base + e.at / 1000, e.opts, channel);
  });
}

function silence(set) {
  const t = ctx.currentTime;
  set.forEach((rec) => {
    clearTimeout(rec.timer);
    try {
      rec.g.gain.cancelScheduledValues(t);
      // A scheduled-but-unstarted group reads 1; a sounding one reads its ramp. Both
      // want the same 30ms tail — instant zeroing clicks on a TV's own speakers.
      rec.g.gain.setValueAtTime(Math.max(rec.g.gain.value, 0.0001), t);
      rec.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      setTimeout(() => { try { rec.g.disconnect(); } catch { /* gone */ } }, 80);
    } catch { /* already disconnected */ }
  });
  set.clear();
}

/** Silence one channel. Used where killing the rest would be collateral damage. */
export function kill(channel) {
  if (!ctx) return;
  const set = live.get(channel);
  if (set) silence(set);
}

/**
 * Silence every scheduled or sounding voice. A phase can always be cut short.
 *
 * Deliberately leaves the bed running: this is called on every phase change, and a
 * 350ms fade out into a 1.2s fade in each time would pump audibly under the whole
 * game. The bed is switched by `setBed`, which is a slower decision.
 */
export function killAll() {
  if (!ctx) return;
  live.forEach(silence);
}

// ── the bed ──────────────────────────────────────────────────────────────────

/**
 * Low hum — the board being switched on and left on.
 *
 * Persistent rather than a one-shot, because its job is the absence you notice when
 * it stops: the reveal's blackout is a hole in the sound as well as the light.
 */
let bed = null;

export function startBed() {
  if (muted || !armed || bed) return;
  const c = ensure();
  if (!c) return;

  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.055, t + 1.2);
  g.connect(master);

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 210;
  lp.Q.value = 1.2;
  lp.connect(g);

  // A slow drift on the cutoff so it breathes instead of sitting there as a tone.
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.11;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 42;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start(t);

  const oscs = [[55, 1], [55.4, 0.9], [110, 0.3]].map(([f, mix]) => {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const og = c.createGain();
    og.gain.value = mix;
    o.connect(og).connect(lp);
    o.start(t);
    return o;
  });

  bed = { g, oscs: [...oscs, lfo] };
}

export function stopBed() {
  if (!bed || !ctx) return;
  const { g, oscs } = bed;
  bed = null;
  const t = ctx.currentTime;
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  } catch { /* nothing to fade */ }
  oscs.forEach((o) => { try { o.stop(t + 0.4); } catch { /* already stopped */ } });
  setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 500);
}

export function setBed(on) {
  if (on) startBed();
  else stopBed();
}
