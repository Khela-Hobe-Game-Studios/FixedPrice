import { useEffect, useRef } from 'react';
import { formatNum } from '../board/Numeral';
import { elapsedMs, remainingMs } from './clock';
import { rowDelays } from './revealBeats';
import {
  cue, sequence, kill, killAll, setBed, setMuted, unlockAudio, audioReady,
} from './cues';

/**
 * Where the board's voice meets the board.
 *
 * The pairing rule is that audio reads the same clock the pixels do. Every phase
 * arrives stamped with the server's time and the reveal arrives with an explicit
 * beat schedule; this hook turns both into AudioContext-time offsets and hands the
 * whole sequence to Web Audio at once. Nothing here reacts to a render, counts
 * down, or fires on an interval — a cue chained off React would swim against rows
 * that animate off `animation-delay`, and at 60ms row steps that is audible.
 *
 * The two consequences worth stating, because they are the same two the visuals
 * already obey:
 *
 *   - A host that rejoins mid-reveal seeds from `elapsedMs` and only schedules the
 *     beats still ahead of it. It does not replay the crowd.
 *   - Any phase can be cut short. `killAll()` runs on every transition, before the
 *     new phase's cue, so a skipped reveal does not keep ticking under the
 *     scoreboard.
 */

// How long the tension hum runs into the end of a timed phase.
const RISE_MS = 8000;

/** The reveal, as offsets in ms from the start of the reveal. */
function revealCues(reveal) {
  const s = reveal?.schedule;
  if (!s) return [];

  const ranked = reveal.ranked ?? [];
  const out = [];

  // Blackout: every lit pixel dropping at once is a relay throwing.
  out.push({ at: 0, name: 'clunk', opts: { level: 1.15 } });

  // One flick per character of the target, 1:1 with FlapNum's spans — including
  // the comma, because the comma is a flap on screen too.
  const chars = [...formatNum(reveal.correctAnswer)].length;
  const step = s.digitStep ?? 90;
  for (let i = 0; i < chars; i += 1) {
    out.push({ at: s.target + i * step, name: 'flick' });
  }

  // One tick per row, on the exact delay that row lights at. The wild misses hit
  // harder: they go first, bottom-up, and they are what the room groans at.
  const delays = rowDelays(ranked, s);
  ranked.filter((r) => !r.isWinner).forEach((r) => {
    const at = delays.get(r.id);
    if (at == null) return;
    out.push({ at, name: 'tick', opts: { level: r.wildMiss || r.knockedOut ? 1.35 : 1 } });
  });

  // The dimming frame — quieter than the blackout, same mechanism.
  out.push({ at: s.dim, name: 'clunk', opts: { level: 0.7 } });

  // Whatever plays on the winner beat is the round's news, so it is not always a
  // celebration: sudden death gets the horn, and a round nobody got close on gets
  // the anti-fanfare rather than a crowd cheering for no one.
  const knocked = (reveal.knockedOut ?? []).length > 0;
  if (reveal.finale && knocked) {
    out.push({ at: s.winner, name: 'klaxon' });
  } else if (reveal.outcome === 'nobody_close' || reveal.allWild) {
    // Nobody guessed, or everybody was miles out — either way the room did not earn
    // a crowd. `allWild` still has a winner on the board; the sound is the comment.
    out.push({ at: s.winner, name: 'deflate' });
  } else {
    out.push({ at: s.winner, name: 'crowd', opts: { level: reveal.outcome === 'tie' ? 0.82 : 1 } });
    out.push({ at: s.winner, name: 'stab', opts: { level: 0.5 } });
  }

  out.push({ at: s.points, name: 'thunk' });
  return out;
}

/** The clock running out, as offsets in ms from now. */
function clockCues(left) {
  if (!left || left <= 1200) return [];

  const out = [];
  const riseAt = Math.max(left - RISE_MS, 40);
  out.push({ at: riseAt, name: 'humRise', opts: { dur: (left - riseAt) / 1000 } });

  for (let s = 5; s >= 1; s -= 1) {
    const at = left - s * 1000;
    if (at > 0) out.push({ at, name: 'beep', opts: { last: s === 1 } });
  }
  return out;
}

export default function useCues({ enabled, state, duck }) {
  const { role, screen, phase, timing, reveal, answerCount, betCount, paused } = state;
  const on = enabled && role === 'host';

  const prev = useRef({ phase: null, answered: 0, bets: 0, timing: null });

  useEffect(() => { setMuted(!on); }, [on]);

  /* The bed is the board being switched on and left on, and its job is the absence
   * you notice when it stops. So it drops for the reveal — the blackout is a hole
   * in the sound as well as in the light — and for game over, so the fanfare lands
   * on silence rather than on a hum. */
  useEffect(() => {
    setBed(on && screen === 'game' && !paused && phase !== 'reveal');
    // The host dropped mid-round. Whatever was scheduled is about to be wrong —
    // the resume re-stamps the phase and everything gets scheduled again from there.
    if (paused) killAll();
  }, [on, screen, paused, phase]);

  // ── phase transitions ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!on) return;
    const was = prev.current.phase;
    const wasTiming = prev.current.timing;
    prev.current.phase = phase;
    prev.current.timing = timing;

    /* Only a real phase change resets the counters. `timing` also changes on
     * game:resumed, and resetting there made the next answer_count look like a
     * fresh lock-in and fire a thunk for a player who had already answered. */
    if (phase === was) return;
    prev.current.answered = 0;
    prev.current.bets = 0;

    if (!audioReady()) return;

    killAll();

    // Leaving a timed question is either the room beating the clock or the clock
    // beating the room, and those are different sounds.
    if (was === 'question' && wasTiming?.endsAt) {
      const overrun = remainingMs(wasTiming);
      if (overrun !== null && overrun < 400) cue('klaxon');
    }

    if (phase === 'intro') cue('stab');
    else if (phase === 'finale') { cue('klaxon'); cue('stab', { level: 0.6 }); }
    else if (phase === 'question') cue('clunk');
    else if (phase === 'betting') cue('clunk', { level: 1.1 });
    else if (phase === 'scoreboard') cue('clunk', { level: 0.85 });
  }, [on, phase, timing]);

  // ── the reveal ─────────────────────────────────────────────────────────────
  //
  // Scheduled once, in full, from the server's own beat schedule. `elapsedMs` is
  // what makes a mid-reveal rejoin land on the beat the board is already on.
  useEffect(() => {
    if (!on || phase !== 'reveal' || !reveal?.schedule) return undefined;
    sequence(revealCues(reveal), elapsedMs(reveal), 'reveal');

    // The bed and the music both sit in the same low band as the reveal's clunks.
    // How far the music drops, and how fast, is the music's business — this only
    // says when. It used to pass absolute levels, which meant the track's normal
    // volume was written down in two files.
    duck?.(true);
    return () => duck?.(false);
  }, [on, phase, reveal, duck]);

  // ── the clock ──────────────────────────────────────────────────────────────
  //
  // On its own channel because `timing` also changes on game:resumed, which has to
  // reschedule the countdown against the new deadline without silencing the phase
  // cue that just played or a reveal still ringing out.
  useEffect(() => {
    if (!on) return;
    kill('clock');
    if (!timing?.endsAt) return;
    if (phase !== 'question' && phase !== 'betting') return;
    sequence(clockCues(remainingMs(timing)), 0, 'clock');
  }, [on, phase, timing]);

  // ── players locking in ─────────────────────────────────────────────────────
  //
  // One thunk per player, and the last one lands at full weight: on the host screen
  // that is the moment the board is waiting for.
  useEffect(() => {
    if (!on || phase !== 'question') return;
    const count = answerCount?.count ?? 0;
    const total = answerCount?.total ?? 0;
    if (count <= prev.current.answered) { prev.current.answered = count; return; }
    prev.current.answered = count;
    cue('thunk', { level: total && count === total ? 1 : 0.5 });
  }, [on, phase, answerCount]);

  useEffect(() => {
    if (!on || phase !== 'betting') return;
    const count = betCount?.count ?? 0;
    if (count <= prev.current.bets) { prev.current.bets = count; return; }
    prev.current.bets = count;
    cue('keypad', { level: 1.4 });
  }, [on, phase, betCount]);

  // ── game over ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!on || screen !== 'game-over' || !audioReady()) return;
    killAll();
    cue('fanfare');
  }, [on, screen]);

  // Autoplay needs a gesture, and the host clicks through Create Room and Settings
  // before Start Game. Arming on any host click means the intro stab — the first
  // cue of the game and the one that sets the tone — is never the silent one.
  useEffect(() => {
    if (!enabled) return undefined;
    const arm = () => unlockAudio();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [enabled]);

  useEffect(() => () => { killAll(); setBed(false); }, []);
}
