import { useEffect, useState } from 'react';
import { elapsedMs } from './clock';

/**
 * The reveal's choreography clock.
 *
 * Seven beats, 6.7-9.5s depending on the size of the room: blackout, the target
 * flicking up digit by digit, a hold on the answer alone, the wildest guesses first
 * in red, the chase accelerating as the deltas narrow, one frame of dimming, the
 * winner inverting, and the point posting.
 *
 * The server sets every offset (`revealSchedule`), and the two that matter most are
 * the ones that used to be missing: the target holds alone before the rows arrive,
 * and the winner holds after the points post. A reveal nobody can read is the round
 * happening off-screen.
 *
 * Two rules from the design carry the implementation:
 *
 *   1. Each beat fires off the previous beat's completion, never off a timer
 *      clamped to the phase end. The old confetti was scheduled at
 *      min(animEnd, phaseEnd), so at 15 players the celebration could land before
 *      the winner had resolved.
 *   2. The stagger interval accelerates; the elements do not. Rows are steps().
 *
 * The schedule comes from the server, so a phone that joins mid-reveal seeds from
 * the real elapsed time and lands on the beat the TV is already on, rather than
 * replaying the sequence from zero.
 *
 * The beat is exposed as a single number that CSS reads off one data attribute:
 * all fifteen rows animate from animation-delay, so there is no per-row React
 * state, no re-render per beat and no layout work while the sequence plays.
 */

export const BEATS = ['blackout', 'target', 'rows', 'dim', 'winner', 'points'];

export function beatAt(schedule, ms) {
  if (!schedule) return 'points';
  if (ms >= schedule.points) return 'points';
  if (ms >= schedule.winner) return 'winner';
  if (ms >= schedule.dim) return 'dim';
  if (ms >= schedule.rows) return 'rows';
  if (ms >= schedule.target) return 'target';
  return 'blackout';
}

export function useRevealBeat(reveal) {
  const schedule = reveal?.schedule;
  const [beat, setBeat] = useState(() => beatAt(schedule, elapsedMs(reveal)));

  useEffect(() => {
    if (!schedule) return undefined;

    let timer = null;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      const now = elapsedMs(reveal);
      const current = beatAt(schedule, now);
      setBeat(current);

      // Chain to the next beat's own offset rather than ticking, so a beat can
      // never fire before the one it depends on has landed.
      const next = BEATS.map((name) => schedule[name] ?? 0).find((at) => at > now);
      if (next === undefined) return;
      timer = setTimeout(step, Math.max(next - now, 16));
    };

    step();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [reveal, schedule]);

  return beat;
}

/**
 * When each row lights, in ms from the start of the reveal.
 *
 * The wild misses go first, bottom-up, at a steady interval — Popy's 12,000 is the
 * first thing anyone sees and the room gets to groan. Then the chase runs from the
 * far misses inward, accelerating as the deltas narrow. That narrowing is the
 * tension, so the interval shortens rather than the rows moving faster.
 */
export function rowDelays(ranked, schedule) {
  if (!schedule) return new Map();

  const scored = ranked.filter((r) => r.distance !== null);
  const losers = scored.filter((r) => !r.isWinner);
  const wild = losers.filter((r) => r.wildMiss);
  const chase = losers.filter((r) => !r.wildMiss);

  const delays = new Map();
  let t = schedule.rows;

  // Bottom-up: the worst guess in the room lights first.
  [...wild].reverse().forEach((r) => {
    delays.set(r.id, t);
    t += schedule.rowStep;
  });

  if (chase.length > 0) {
    t += 200; // a beat for the groan to land
    const span = Math.max(schedule.dim - 200 - t, chase.length * 30);
    // Furthest first, closest last, with the gap between them shrinking.
    [...chase].reverse().forEach((r, i) => {
      const progress = i / Math.max(chase.length - 1, 1);
      // Quadratic ease on the interval: early rows are spaced, late rows crowd.
      delays.set(r.id, t + span * (1 - (1 - progress) ** 2));
    });
  }

  // Non-submitters have nothing to reveal; they arrive with the rest.
  ranked.filter((r) => r.distance === null).forEach((r) => delays.set(r.id, schedule.dim - 100));

  return delays;
}
