/* Fixtures for the preview gallery.
 *
 * Shapes match the server's payloads exactly — a fixture that drifts from the wire
 * is a screen that looks finished and isn't. 15 players is the design target, so
 * every host screen has a 15-player twin.
 */

const NAMES_15 = [
  'Rashid', 'Nadia', 'Khaled', 'Afridi', 'Siddiqui', 'Popy', 'Tania', 'Imran',
  'Shuvo', 'Mitu', 'Farhan', 'Rumi', 'Alam', 'Jhuma', 'Bijoy',
];

const SCORES_15 = [14, 13, 12, 11, 9, 9, 8, 7, 6, 6, 5, 4, 4, 3, 1];
const GUESSES_15 = [790, 760, 812, 700, 900, 12000, 745, 830, 640, 950, 1100, 560, 480, 2400, 5600];

export function makePlayers(count) {
  return NAMES_15.slice(0, count).map((name, i) => ({
    id: `p${i + 1}`,
    name,
    score: SCORES_15[i],
    colorIndex: i,
    avatar: { kind: 'monogram' },
    connectionState: 'connected',
    eliminated: false,
  }));
}

export const players5 = makePlayers(5);
export const players15 = makePlayers(15);

export const settings = {
  rounds: 15,
  secondsPerQuestion: 30,
  bettingFrequency: 'every3',
  categories: [],
  finale: 'auto',
};

export const room5 = { code: 'AMMU', players: players5, settings, state: 'LOBBY' };
export const room15 = { code: 'JHOL', players: players15, settings, state: 'LOBBY' };

/** A phase stamped as if the server sent it `elapsed` ms ago. */
export function timing(phase, durationMs, elapsed = 0) {
  const now = Date.now();
  return {
    phase,
    serverNow: now,
    startedAt: now - elapsed,
    durationMs,
    endsAt: durationMs === null ? null : now - elapsed + durationMs,
  };
}

export const intro = {
  round: 7,
  total: 15,
  category: 'Price',
  isBettingRound: false,
  ...timing('INTRO', 3000, 1000),
};

export function makeRound(players, over = {}) {
  return {
    round: 7,
    total: 15,
    question: 'Price of 1kg beef at Karwan Bazar, 2024',
    category: 'Price',
    unit: '৳ / KG',
    isBettingRound: false,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    ...timing('QUESTION', 30000, 12000),
    ...over,
  };
}

export const round5 = makeRound(players5);
export const round15 = makeRound(players15);

export const answerCount15 = {
  count: 7,
  total: 15,
  answered: players15.slice(0, 7).map((p) => p.id),
};

export const answerCount5 = {
  count: 2,
  total: 5,
  answered: players5.slice(0, 2).map((p) => p.id),
};

export const answerCountZero = { count: 0, total: 15, answered: [] };

export const betting = {
  options: [
    { id: 'p1', name: 'Rashid', colorIndex: 0, guess: 790, odds: 1.4 },
    { id: 'p2', name: 'Nadia', colorIndex: 1, guess: 760, odds: 2.2 },
    { id: 'p3', name: 'Khaled', colorIndex: 2, guess: 812, odds: 2.8 },
    { id: 'p4', name: 'Afridi', colorIndex: 3, guess: 700, odds: 4.5 },
    { id: 'p5', name: 'Siddiqui', colorIndex: 4, guess: 900, odds: 6.0 },
    { id: 'p6', name: 'Popy', colorIndex: 5, guess: 12000, odds: 99 },
  ],
  ...timing('BETTING', 20000, 6000),
};

export const betCount = { count: 9, total: 15 };

const CORRECT = 780;

/**
 * The reveal, decorated exactly as the server decorates it.
 *
 * `nobody_close` means what the server means by it: nobody submitted, so there is no
 * winner for the red band to stand in for. A round where everyone guessed and
 * everyone was miles out is `allWild` — it still has a winner, and the board still
 * names them.
 */
export function makeReveal(players, { outcome = 'single', allWild = false, elapsed = 4600 } = {}) {
  const nobody = outcome === 'nobody_close';

  const entries = players
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      colorIndex: p.colorIndex,
      avatar: p.avatar,
      submitted: !nobody,
      guess: nobody ? null : GUESSES_15[i],
      distance: nobody ? null : Math.abs(GUESSES_15[i] - CORRECT),
    }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  const tail = entries.length >= 6 ? entries.length - 3 : Infinity;
  const ranked = entries.map((e, i) => ({
    ...e,
    rank: nobody ? null : i + 1,
    isWinner: !nobody && (i === 0 || (outcome === 'tie' && i === 1)),
    nearMiss: !nobody && e.distance / CORRECT <= 0.05,
    wildMiss: !nobody && i > 0 && (i >= tail || allWild || e.distance / CORRECT > 1),
    points: nobody ? 0
      : i === 0 ? (outcome === 'tie' ? 2 : 3)
      : outcome === 'tie' && i === 1 ? 2
      : i === 1 ? 1 : 0,
  }));

  // Mirrors revealSchedule(): the tail after the points beat is PAYOFF_HOLD, and the
  // whole phase never comes in under 4600.
  const points = players.length > 8 ? 4100 : 3400;
  const schedule = {
    blackout: 0,
    target: 400,
    digitStep: 90,
    rows: 1100,
    rowStep: players.length > 8 ? 60 : 100,
    dim: players.length > 8 ? 3600 : 2900,
    winner: players.length > 8 ? 3700 : 3000,
    points,
    total: Math.max(points + 2000, 4600),
  };

  return {
    ranked,
    correctAnswer: CORRECT,
    unit: '৳ / KG',
    funFact: 'Beef in Dhaka crossed 800 taka a kilo for the first time in 2024, up from 600 in 2021.',
    bets: {},
    outcome,
    allWild,
    winnerIds: ranked.filter((r) => r.isWinner).map((r) => r.id),
    schedule,
    revealMs: schedule.total,
    ...timing('REVEAL', schedule.total, elapsed),
  };
}

export const reveal5 = makeReveal(players5);
export const reveal15 = makeReveal(players15);

export function makeScoreboard(players, over = {}) {
  return {
    scoreboard: players
      .map((p, i) => ({ ...p, delta: i === 0 ? 3 : i === 1 ? 1 : 0 }))
      .sort((a, b) => b.score - a.score),
    round: 7,
    total: 15,
    nextCategory: 'Cricket',
    ...timing('SCOREBOARD', 5000, 1500),
    ...over,
  };
}

export const scoreboard5 = makeScoreboard(players5);
export const scoreboard15 = makeScoreboard(players15);

export function makeFinal(players) {
  return {
    final: [...players].sort((a, b) => b.score - a.score),
    rounds: 15,
  };
}

export const final5 = makeFinal(players5);
export const final15 = makeFinal(players15);

export const me = { id: 'p2', name: 'Nadia', colorIndex: 1, avatar: { kind: 'monogram' } };

// ── the finale ──────────────────────────────────────────────────────────────

export const finaleIntro = {
  finalists: players15.slice(0, 5),
  total: 5,
  ...timing('FINALE_INTRO', 4000, 1200),
};

export const finaleRound = makeRound(players15.slice(0, 3), {
  finale: { round: 2, left: 3 },
  question: 'Runs scored by Bangladesh in the 2023 World Cup opener',
  category: 'Cricket',
  unit: 'RUNS',
});

/** A sudden-death reveal: somebody just went out. */
export function makeFinaleReveal() {
  const r = makeReveal(players15.slice(0, 3));
  const out = r.ranked[r.ranked.length - 1];
  return {
    ...r,
    finale: { round: 2, left: 2 },
    knockedOut: [out.id],
    ranked: r.ranked.map((x) => ({ ...x, knockedOut: x.id === out.id })),
  };
}
