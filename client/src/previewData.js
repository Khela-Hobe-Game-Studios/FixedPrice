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

/** The reveal, decorated exactly as the server decorates it. */
export function makeReveal(players, { outcome = 'single', elapsed = 4600 } = {}) {
  const entries = players
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      colorIndex: p.colorIndex,
      avatar: p.avatar,
      submitted: true,
      guess: GUESSES_15[i],
      distance: Math.abs(GUESSES_15[i] - CORRECT),
    }))
    .sort((a, b) => a.distance - b.distance);

  const tail = entries.length >= 6 ? entries.length - 3 : Infinity;
  const ranked = entries.map((e, i) => ({
    ...e,
    rank: i + 1,
    isWinner: i === 0 || (outcome === 'tie' && i === 1),
    nearMiss: e.distance / CORRECT <= 0.05,
    wildMiss: i > 0 && (i >= tail || e.distance / CORRECT > 1),
    points: i === 0 ? (outcome === 'tie' ? 2 : 3) : outcome === 'tie' && i === 1 ? 2 : i === 1 ? 1 : 0,
  }));

  const schedule = {
    blackout: 0,
    target: 400,
    digitStep: 90,
    rows: 1100,
    rowStep: players.length > 8 ? 60 : 100,
    dim: players.length > 8 ? 3600 : 2900,
    winner: players.length > 8 ? 3700 : 3000,
    points: players.length > 8 ? 4100 : 3400,
    total: players.length > 8 ? 4600 : 4000,
  };

  return {
    ranked,
    correctAnswer: CORRECT,
    unit: '৳ / KG',
    funFact: 'Beef in Dhaka crossed 800 taka a kilo for the first time in 2024, up from 600 in 2021.',
    bets: {},
    outcome,
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
