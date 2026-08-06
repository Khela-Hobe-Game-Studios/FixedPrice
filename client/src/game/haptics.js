/**
 * The phone's half of the cue system.
 *
 * The host device is the only audio source — fifteen phones chirping would fight
 * the TV, and the one that is a beat behind on a slow link is the one everybody
 * hears. So the phone confirms with the motor instead: same acknowledgement, no
 * acoustic conflict, and it works with the ringer off, which is how a phone is
 * carried to a party.
 *
 * Silently absent on iOS Safari, which has never implemented the Vibration API.
 * Treated as progressive enhancement rather than something to polyfill — nothing
 * here is the only feedback for anything.
 */

const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

const PATTERNS = {
  keypad: 8,       // one character of the room code
  lock: [14, 30, 22], // an answer committed — the phone's lock-in thunk
  bet: 18,         // a bet placed
};

export function buzz(kind = 'keypad') {
  if (!can) return;
  try {
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.keypad);
  } catch {
    /* some browsers gate this behind engagement; there is nothing to recover */
  }
}
