const { setRoomTimer, clearRoomTimer, clearRoomTimers, touchRoom } = require('./roomManager');
const { sanitizePlayers } = require('./sanitize');
const { matchesCategory } = require('./categories');

let questions = [];

function setQuestions(q) { questions = q; }

const DEFAULT_QUESTION_TIME = 30000;
const SCOREBOARD_TIME = 5000;
const BETTING_TIME = 20000;

// A loud three-second flash of the next category between the quiet standings and the
// next question. Without it every screen in the game is the same temperature.
const INTRO_TIME = 3000;

function questionTime(room) {
  const s = room.settings.secondsPerQuestion;
  return s > 0 ? s * 1000 : null; // null = no clock, host advances the round
}

/**
 * The reveal's beat schedule, owned by the server.
 *
 * The client used to time its own celebration off a timer clamped to the phase end,
 * which at 15 players could land the payoff before the winner had resolved. Now the
 * host computes nothing: it plays the schedule it is given, and a phone that joins
 * mid-reveal seeds from `startedAt` and lands on the correct beat instead of
 * replaying the sequence from zero.
 *
 * Offsets in ms from the start of the reveal.
 */
function revealSchedule(rowCount) {
  const rowStep = rowCount > 8 ? 60 : 100;
  const rows = 1100;
  // The room needs a beat to read the board after the chase and before the winner —
  // that hold is most of what makes the inversion land.
  const hold = rowCount > 8 ? 1660 : 900;
  const dim = rows + rowCount * rowStep + hold;

  const schedule = {
    blackout: 0,     // every lit pixel except the sponsor bands goes off
    target: 400,     // the correct answer flicks up digit by digit
    digitStep: 90,
    rows,            // wildest first, in red, bottom-up
    rowStep,
    dim,             // one frame of dimming: all rows drop to 32% output
    winner: dim + 100,
    points: dim + 500,
  };
  schedule.total = Math.min(Math.max(schedule.points + 500, 4000), 13000);
  return schedule;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Single source of truth for "who are we waiting on" — the question progress bar
// and the auto-advance check used to disagree, so the host bar could read 14/15
// forever while the round had already resolved.
function activePlayers(room) {
  return room.players.filter(p => !p.eliminated);
}

function awaitedPlayers(room) {
  return room.players.filter(p => !p.eliminated && p.connectionState === 'connected');
}

/**
 * Stamp a phase with the server's clock.
 *
 * Every phase event carries the same four fields. Clients never count down from a
 * number they were handed once — they measure their offset from the server on
 * connect and derive the remaining time from `endsAt`, so a slow socket, a
 * backgrounded tab and a mid-phase rejoin all land on the same second.
 */
function beginPhase(room, state, durationMs) {
  const now = Date.now();
  room.state = state;
  room._phaseStartedAt = now;
  room._phaseDuration = durationMs;
  return {
    phase: state,
    serverNow: now,
    startedAt: now,
    durationMs,
    endsAt: durationMs === null ? null : now + durationMs,
  };
}

function phaseTiming(room) {
  const now = Date.now();
  const started = room._phaseStartedAt ?? now;
  const duration = room.paused ? (room._pausedRemaining ?? 0) : room._phaseDuration;
  return {
    phase: room.state,
    serverNow: now,
    startedAt: room.paused ? now : started,
    durationMs: duration,
    endsAt: duration === null ? null : (room.paused ? now + duration : started + duration),
  };
}

function handleGameEvent(io, room, event, payload = {}) {
  switch (event) {
    case 'START':               return startGame(io, room);
    case 'ANSWER':              return submitAnswer(io, room, payload);
    case 'BET':                 return submitBet(io, room, payload);
    case 'PLAYER_DISCONNECTED': return onPlayerDisconnected(io, room, payload);
    case 'HOST_LOST':           return pauseForHost(io, room);
    case 'HOST_BACK':           return resumeAfterHost(io, room);
    case 'SKIP':                return skipPhase(io, room);
    case 'END':                 return endGame(io, room);
  }
}

// Questions with a very small answer have no room for estimation — with 15
// players everyone converges on the same 2 or 3 and the round is a mass tie
// worth 2 points to half the room. They are still fun facts, so rather than
// cutting them we cap how many can land in a single game.
const TIE_PRONE_MAX_ANSWER = 5;
const TIE_PRONE_SHARE = 0.2;

function pickQuestions(count, categories = []) {
  // An empty filter is the whole deck. A filter that starves the deck is ignored
  // rather than obeyed — a host who unticks five of six categories should get a
  // short game, not a broken one.
  let pool = [...Array(questions.length).keys()];
  if (categories.length > 0) {
    const filtered = pool.filter(i => categories.some(c => matchesCategory(questions[i].category, c)));
    if (filtered.length >= count) pool = filtered;
    else if (filtered.length > 0) pool = [...filtered, ...pool.filter(i => !filtered.includes(i))];
  }

  const order = shuffle(pool);
  const tieBudget = Math.max(1, Math.round(count * TIE_PRONE_SHARE));

  // A ceiling, not a quota: take the natural shuffled order and only start
  // skipping tie-prone questions once the budget for them is spent.
  const picked = [];
  const skipped = [];
  let tieUsed = 0;
  for (const i of order) {
    if (picked.length >= count) break;
    if (Math.abs(questions[i].answer) <= TIE_PRONE_MAX_ANSWER) {
      if (tieUsed >= tieBudget) { skipped.push(i); continue; }
      tieUsed++;
    }
    picked.push(i);
  }
  // Small or skewed bank — fall back to the ones we passed over.
  if (picked.length < count) picked.push(...skipped.slice(0, count - picked.length));
  return picked;
}

function startGame(io, room) {
  if (room.state !== 'LOBBY') return;
  const count = Math.min(room.settings.rounds, questions.length);
  room.questionIndices = pickQuestions(count, room.settings.categories);
  room.currentRound = 0;
  startIntro(io, room);
}

// ─── round intro ─────────────────────────────────────────────────────────────

function startIntro(io, room) {
  const { currentRound, questionIndices } = room;
  if (currentRound >= questionIndices.length) return endGame(io, room);

  const q = questions[questionIndices[currentRound]];
  const isBettingRound = bettingRoundDue(room, currentRound);

  room._lastIntroData = {
    round: currentRound + 1,
    total: questionIndices.length,
    category: q.category,
    isBettingRound,
    finale: room.finale
      ? { round: room.finale.round + 1, left: room.players.filter(p => !p.eliminated).length }
      : null,
  };
  touchRoom(room);

  io.to(room.code).emit('round:intro', {
    ...room._lastIntroData,
    ...beginPhase(room, 'INTRO', INTRO_TIME),
  });

  setRoomTimer(room, 'intro', () => startRound(io, room), INTRO_TIME);
}

function bettingRoundDue(room, roundIndex) {
  if (room.finale) return false; // sudden death is already the drama
  const freq = room.settings.bettingFrequency;
  if (freq === 'every') return true;
  if (freq === 'every3') return (roundIndex + 1) % 3 === 0;
  return false;
}

// ─── question ────────────────────────────────────────────────────────────────

function startRound(io, room) {
  const { currentRound, questionIndices } = room;
  if (currentRound >= questionIndices.length) return endGame(io, room);

  const q = questions[questionIndices[currentRound]];
  const isBettingRound = bettingRoundDue(room, currentRound);
  const duration = questionTime(room);

  room.currentQuestion = q;
  room.answers = {};
  room.bets = {};
  room.isBettingRound = isBettingRound;
  room._answerCountDirty = false;
  room._roundPoints = {};
  touchRoom(room);

  if (room.finale) room.finale.round++;

  room._lastRoundStart = {
    round: currentRound + 1,
    total: questionIndices.length,
    question: q.question,
    category: q.category,
    unit: q.unit,
    isBettingRound,
    finale: room.finale
      ? { round: room.finale.round, left: activePlayers(room).length }
      : null,
    players: activePlayers(room).map(p => ({ id: p.id, name: p.name })),
  };

  io.to(room.code).emit('round:start', {
    ...room._lastRoundStart,
    ...beginPhase(room, 'QUESTION', duration),
  });

  if (duration !== null) {
    setRoomTimer(room, 'question', () => endQuestion(io, room), duration);
  }
}

function emitAnswerCount(io, room) {
  io.to(room.code).emit('round:answer_count', {
    count: Object.keys(room.answers).length,
    total: awaitedPlayers(room).length,
    answered: Object.keys(room.answers),
  });
}

// One client message used to fan out to every socket in the room with no limit.
// Coalesce to at most one broadcast per 250ms.
function scheduleAnswerCount(io, room) {
  if (room._timers.answerCount) { room._answerCountDirty = true; return; }
  emitAnswerCount(io, room);
  setRoomTimer(room, 'answerCount', () => {
    clearRoomTimer(room, 'answerCount');
    if (room._answerCountDirty) {
      room._answerCountDirty = false;
      emitAnswerCount(io, room);
    }
  }, 250);
}

function submitAnswer(io, room, { pid, answer }) {
  if (room.state !== 'QUESTION') return;
  const player = room.players.find(p => p.id === pid);
  if (!player || player.eliminated) return;

  room.answers[pid] = answer;
  touchRoom(room);

  scheduleAnswerCount(io, room);

  const awaited = awaitedPlayers(room);
  if (awaited.length > 0 && awaited.every(p => room.answers[p.id] !== undefined)) {
    clearRoomTimer(room, 'question');
    endQuestion(io, room);
  }
}

function award(room, pid, points) {
  room.scores[pid] = (room.scores[pid] || 0) + points;
  room._roundPoints[pid] = (room._roundPoints[pid] || 0) + points;
}

function endQuestion(io, room) {
  if (room.state !== 'QUESTION') return; // re-entrancy guard
  clearRoomTimer(room, 'question');
  clearRoomTimer(room, 'answerCount');

  const ranked = computeRanked(room);
  const scored = ranked.filter(r => r.distance !== null);

  if (scored.length > 0) {
    const minDist = scored[0].distance;
    const firstPlacers = scored.filter(r => r.distance === minDist);
    const firstPts = firstPlacers.length === 1 ? 3 : 2;
    firstPlacers.forEach(r => award(room, r.id, firstPts));

    if (firstPlacers.length === 1 && scored.length > 1) {
      const secondDist = scored[1].distance;
      scored.filter(r => r.distance === secondDist).forEach(r => award(room, r.id, 1));
    }
  }

  syncScores(room);

  if (room.isBettingRound) {
    room._lastBettingData = { options: bettingOptions(ranked) };

    io.to(room.code).emit('round:betting', {
      ...room._lastBettingData,
      ...beginPhase(room, 'BETTING', BETTING_TIME),
    });
    setRoomTimer(room, 'betting', () => endBetting(io, room, ranked), BETTING_TIME);
  } else {
    revealAnswers(io, room, ranked);
  }
}

/**
 * What the room sees when it is asked to back a guess.
 *
 * The guesses are shown — betting on a name with no number is a coin flip, and the
 * whole point of the round is arguing about whether 780 or 1200 sounds more like
 * beef. But the order is randomised and the odds are computed from how far a guess
 * sits from the pack rather than from its actual distance to the answer. Sorting by
 * distance, or pricing by it, hands the room the answer before it bets.
 */
function bettingOptions(ranked) {
  const scored = ranked.filter(r => r.distance !== null);
  if (scored.length === 0) return [];

  const guesses = scored.map(r => r.guess).sort((a, b) => a - b);
  const median = guesses[Math.floor(guesses.length / 2)];
  const spread = scored
    .map(r => ({ id: r.id, deviation: Math.abs(r.guess - median) }))
    .sort((a, b) => a.deviation - b.deviation);

  const options = scored.map((r) => {
    const rank = spread.findIndex(s => s.id === r.id);
    return {
      id: r.id,
      name: r.name,
      colorIndex: r.colorIndex,
      avatar: r.avatar,
      guess: r.guess,
      // The furthest-out guess in the room is always ×99. It is a joke, and it is
      // occasionally correct, which is the best kind of joke.
      odds: rank === spread.length - 1 && spread.length > 2
        ? 99
        : Math.round((1.4 + (rank / Math.max(spread.length - 1, 1)) * 5.2) * 10) / 10,
    };
  });

  // Presentation order is random and fixed for the phase, so the layout itself
  // carries no information.
  return shuffle(options).slice(0, 6);
}

// ─── betting ─────────────────────────────────────────────────────────────────

function submitBet(io, room, { pid, targetId }) {
  if (room.state !== 'BETTING') return;
  if (pid === targetId) return;
  if (!room.players.some(p => p.id === targetId)) return;

  room.bets[pid] = targetId;
  touchRoom(room);

  io.to(room.code).emit('round:bet_count', {
    count: Object.keys(room.bets).length,
    total: awaitedPlayers(room).length,
  });

  const awaited = awaitedPlayers(room);
  if (awaited.length > 0 && awaited.every(p => room.bets[p.id] !== undefined)) {
    clearRoomTimer(room, 'betting');
    endBetting(io, room, null);
  }
}

function endBetting(io, room, preRanked) {
  if (room.state !== 'BETTING') return; // re-entrancy guard
  clearRoomTimer(room, 'betting');

  const ranked = preRanked || computeRanked(room);
  const scored = ranked.filter(r => r.distance !== null);

  // Every player who tied for closest pays out, not just the first one the sort
  // happened to return — a tied betting round used to quietly strand the bets
  // placed on the other winner.
  if (scored.length > 0) {
    const best = scored[0].distance;
    const winners = scored.filter(r => r.distance === best).map(r => r.id);
    for (const winnerId of winners) {
      const bettors = Object.entries(room.bets).filter(([, t]) => t === winnerId);
      award(room, winnerId, bettors.length);
      bettors.forEach(([bettorId]) => award(room, bettorId, 1));
    }
  }

  syncScores(room);
  revealAnswers(io, room, ranked, room.bets);
}

// ─── reveal ──────────────────────────────────────────────────────────────────

// Near miss earns the green rank digit; wild miss earns a red one, a struck name and
// a tinted row. Both are computed here so the TV and every phone agree on who was
// close — the difference has to read at 3 metres without reading a digit.
const NEAR_MISS_SHARE = 0.05;
const WILD_MISS_SHARE = 1.0;
const WILD_TAIL = 3;
const WILD_TAIL_MIN_FIELD = 6;

function decorateRanked(ranked, correctAnswer) {
  const scale = Math.max(Math.abs(correctAnswer), 1);
  const scored = ranked.filter(r => r.distance !== null);
  const best = scored.length > 0 ? scored[0].distance : null;
  const tailFrom = scored.length >= WILD_TAIL_MIN_FIELD ? scored.length - WILD_TAIL : Infinity;

  let rank = 0;
  let prevDistance = null;
  return ranked.map((entry) => {
    if (entry.distance === null) {
      return { ...entry, rank: null, nearMiss: false, wildMiss: false, isWinner: false };
    }

    // Dense ranking, so a tie for closest is two 1sts and not a 1st and a 2nd.
    if (entry.distance !== prevDistance) rank += 1;
    prevDistance = entry.distance;

    const index = scored.indexOf(entry);
    const isWinner = entry.distance === best;
    const share = entry.distance / scale;

    return {
      ...entry,
      rank,
      isWinner,
      nearMiss: share <= NEAR_MISS_SHARE,
      // Never the winner, however bad the round was — the closest guess is the
      // closest guess.
      wildMiss: !isWinner && (index >= tailFrom || share > WILD_MISS_SHARE),
    };
  });
}

function revealAnswers(io, room, rawRanked, bets = {}) {
  const correctAnswer = room.currentQuestion.answer;
  // In sudden death the reveal is also the execution, so who went out has to be
  // decided before the board draws it.
  const knockedOut = room.finale ? applyKnockout(io, room, rawRanked) : [];

  const ranked = decorateRanked(rawRanked, correctAnswer).map(r => ({
    ...r,
    points: room._roundPoints?.[r.id] ?? 0,
    knockedOut: knockedOut.includes(r.id),
  }));

  const scored = ranked.filter(r => r.distance !== null);
  const winners = scored.filter(r => r.isWinner);

  // Three outcomes, three different screens: a green winner band, a split band for a
  // tie, or a red "NOBODY WAS CLOSE" where the band would have been.
  let outcome = 'single';
  if (scored.length === 0) outcome = 'nobody_close';
  else if (scored.every(r => r.wildMiss || r.distance / Math.max(Math.abs(correctAnswer), 1) > WILD_MISS_SHARE)) {
    outcome = 'nobody_close';
  } else if (winners.length > 1) outcome = 'tie';

  const schedule = revealSchedule(Math.max(scored.length - winners.length, 1));

  room._lastRevealData = {
    ranked,
    correctAnswer,
    unit: room.currentQuestion.unit,
    funFact: room.currentQuestion.funFact || null,
    bets,
    scores: room.scores,
    roundPoints: room._roundPoints ?? {},
    outcome,
    winnerIds: winners.map(w => w.id),
    knockedOut,
    finale: room.finale
      ? { round: room.finale.round, left: room.players.filter(p => !p.eliminated).length }
      : null,
    schedule,
    revealMs: schedule.total,
  };

  io.to(room.code).emit('round:reveal', {
    ...room._lastRevealData,
    ...beginPhase(room, 'REVEAL', schedule.total),
  });
  setRoomTimer(room, 'reveal', () => showScoreboard(io, room), schedule.total);
}

// ─── scoreboard ──────────────────────────────────────────────────────────────

function showScoreboard(io, room) {
  if (room.state !== 'REVEAL') return; // re-entrancy guard
  clearRoomTimer(room, 'reveal');

  const scoreboard = room.players
    .map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      colorIndex: p.colorIndex,
      avatar: p.avatar,
      connectionState: p.connectionState,
      eliminated: p.eliminated,
      delta: room._roundPoints?.[p.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  const nextRound = room.currentRound + 1;
  const nextQuestion = questions[room.questionIndices[nextRound]];

  room._lastScoreboardData = {
    scoreboard,
    round: room.currentRound + 1,
    total: room.questionIndices.length,
    // The marquee announces what is coming, which is what stops the standings from
    // being the flattest five seconds of the game.
    nextCategory: nextQuestion ? nextQuestion.category : null,
  };

  io.to(room.code).emit('round:scoreboard', {
    ...room._lastScoreboardData,
    ...beginPhase(room, 'SCOREBOARD', SCOREBOARD_TIME),
  });

  setRoomTimer(room, 'scoreboard', () => advanceRound(io, room), SCOREBOARD_TIME);
}

/**
 * The one place a round ends and the next begins.
 *
 * This transition used to be written out three times — the scoreboard timer, the
 * host's skip, and the resume-after-pause path — which is exactly the kind of
 * duplication that leaves one copy behind when a phase is added.
 */
function advanceRound(io, room) {
  room.currentRound++;

  if (room.finale) {
    // In sudden death the deck is topped up a round at a time, because how many
    // rounds it takes depends on how the room plays.
    if (finaleOver(room)) return endGame(io, room);
    extendDeck(room, 1);
    return startIntro(io, room);
  }

  if (room.currentRound >= room.questionIndices.length) return startFinale(io, room);
  startIntro(io, room);
}

// ─── the finale ──────────────────────────────────────────────────────────────

/**
 * Sudden death.
 *
 * The normal rounds decide who qualifies; the finale decides the order among them.
 * Everyone answers, the furthest guess is knocked out, repeat until one is left.
 * That is the whole rule, and it is the whole appeal — from the moment it starts,
 * every guess is the one that might end you.
 *
 * This replaces the old three-strikes mode, which knocked people out at round 6 of
 * a fifteen-round party game and left them watching for ten minutes.
 */
const FINALE_MIN_PLAYERS = 8;   // when 'auto' turns it on
const FINALE_TOP_SMALL = 3;     // finalists under 10 players
const FINALE_TOP_LARGE = 5;     // finalists at 10+
const FINALE_MAX_EXTRA = 3;     // hard cap on no-kill rounds, so the game ends

function finalistCount(room) {
  return room.players.length >= 10 ? FINALE_TOP_LARGE : FINALE_TOP_SMALL;
}

function startFinale(io, room) {
  const mode = room.settings.finale;
  const enabled =
    mode === 'on' ? room.players.length >= 3
    : mode === 'auto' ? room.players.length >= FINALE_MIN_PLAYERS
    : false;

  if (!enabled) return endGame(io, room);

  const standings = [...room.players].sort((a, b) => b.score - a.score);
  const cutoff = standings[Math.min(finalistCount(room), standings.length) - 1]?.score ?? 0;
  // Everyone level with the last qualifying score is in — nobody misses a finale on
  // a sort order they cannot see.
  const finalists = standings.filter(p => p.score >= cutoff);

  if (finalists.length < 2) return endGame(io, room);

  room.finale = {
    round: 0,
    // Reverse knockout order: the first player out finishes last among finalists.
    knockedOutOrder: [],
    noKillRounds: 0,
  };
  room.players.forEach(p => { p.eliminated = !finalists.some(f => f.id === p.id); });

  room._lastFinaleIntro = {
    finalists: finalists.map(p => ({
      id: p.id, name: p.name, score: p.score, colorIndex: p.colorIndex, avatar: p.avatar,
    })),
    total: finalists.length,
  };
  io.to(room.code).emit('round:finale_intro', {
    ...room._lastFinaleIntro,
    ...beginPhase(room, 'FINALE_INTRO', INTRO_TIME + 1000),
  });

  extendDeck(room, 1);
  setRoomTimer(room, 'intro', () => startIntro(io, room), INTRO_TIME + 1000);
}

/** Sudden death needs one more question than we planned for, every time it loops. */
function extendDeck(room, n) {
  const used = new Set(room.questionIndices);
  const spare = pickQuestions(room.questionIndices.length + n, room.settings.categories)
    .filter(i => !used.has(i));
  room.questionIndices.push(...spare.slice(0, n));
  // A tiny bank can run dry; replaying a question is better than ending mid-duel.
  while (room.questionIndices.length <= room.currentRound) {
    room.questionIndices.push(room.questionIndices[room.currentRound % room.questionIndices.length]);
  }
}

function finaleOver(room) {
  const left = room.players.filter(p => !p.eliminated);
  return left.length <= 1 || room.finale.noKillRounds >= FINALE_MAX_EXTRA;
}

/**
 * Who goes out this round.
 *
 * Non-submitters forfeit first — sitting out a sudden-death round is a choice. A tie
 * for furthest takes everyone tied, unless that would empty the board, in which case
 * nobody goes out and the round replays. If nobody submitted at all, nobody goes out.
 */
function resolveKnockout(room, ranked) {
  const live = ranked.filter(r => !room.players.find(p => p.id === r.id)?.eliminated);
  const missing = live.filter(r => r.distance === null);
  const scored = live.filter(r => r.distance !== null);

  if (missing.length > 0 && scored.length > 0) return missing.map(r => r.id);
  if (scored.length <= 1) return [];

  const worst = scored[scored.length - 1].distance;
  const out = scored.filter(r => r.distance === worst);
  return out.length === scored.length ? [] : out.map(r => r.id);
}

function applyKnockout(io, room, ranked) {
  const out = resolveKnockout(room, ranked);
  if (out.length === 0) {
    room.finale.noKillRounds++;
    return [];
  }

  out.forEach(id => {
    const player = room.players.find(p => p.id === id);
    if (player) player.eliminated = true;
  });
  room.finale.knockedOutOrder.push(...out);
  return out;
}

/**
 * The final table.
 *
 * Without a finale it is simply points. With one, points decide who qualified and
 * where everyone else lands, and the finale decides the order among the finalists:
 * the survivor first, then the reverse of the order they were knocked out in. A
 * player cannot be beaten by someone they knocked out.
 */
function finalStandings(room) {
  const shape = (p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    colorIndex: p.colorIndex,
    avatar: p.avatar,
  });

  if (!room.finale) {
    return [...room.players].sort((a, b) => b.score - a.score).map(shape);
  }

  const { knockedOutOrder } = room.finale;
  const finalists = new Set([
    ...knockedOutOrder,
    ...room.players.filter(p => !p.eliminated).map(p => p.id),
  ]);

  const survivors = room.players
    .filter(p => !p.eliminated)
    .sort((a, b) => b.score - a.score);
  const knockedOut = [...knockedOutOrder]
    .reverse()
    .map(id => room.players.find(p => p.id === id))
    .filter(Boolean);
  const rest = room.players
    .filter(p => !finalists.has(p.id))
    .sort((a, b) => b.score - a.score);

  return [...survivors, ...knockedOut, ...rest].map(shape);
}

function endGame(io, room) {
  if (room.state === 'GAME_OVER') return;
  room.state = 'GAME_OVER';
  clearRoomTimers(room);
  touchRoom(room);

  const final = finalStandings(room);

  room._lastFinal = {
    final,
    rounds: room.questionIndices.length,
    finale: room.finale ? { played: room.finale.round } : null,
  };
  io.to(room.code).emit('game:over', room._lastFinal);
}

// Reset back to LOBBY keeping the same room code and roster, so a party of 15
// doesn't have to re-enter a new code between games. Colours are kept too — people
// have spent a whole game learning that they are the blue one.
function resetToLobby(io, room) {
  clearRoomTimers(room);
  room.state = 'LOBBY';
  room.currentRound = 0;
  room.currentQuestion = null;
  room.questionIndices = [];
  room.answers = {};
  room.bets = {};
  room.scores = {};
  room.isBettingRound = false;
  room.finale = null;
  room._roundPoints = {};
  room._lastFinaleIntro = null;
  room._lastIntroData = room._lastRoundStart = room._lastBettingData = null;
  room._lastRevealData = room._lastScoreboardData = room._lastFinal = null;
  room._phaseStartedAt = null;
  room.players.forEach(p => {
    p.score = 0;
    p.eliminated = false;
    room.scores[p.id] = 0;
  });
  touchRoom(room);
  io.to(room.code).emit('room:reset', {
    players: sanitizePlayers(room.players),
    settings: room.settings,
  });
}

function syncScores(room) {
  room.players.forEach(p => { p.score = room.scores[p.id] || 0; });
}

// ─── pause / skip / disconnect ───────────────────────────────────────────────

// A dead host tab used to leave the timers advancing to nobody. Freeze the clock
// and tell the players, then pick up where we left off when the host returns.
function pauseForHost(io, room) {
  if (room.paused || room.state === 'LOBBY' || room.state === 'GAME_OVER') return;
  room.paused = true;
  room._pausedRemaining = room._phaseStartedAt && room._phaseDuration !== null
    ? Math.max(0, room._phaseDuration - (Date.now() - room._phaseStartedAt))
    : 0;
  clearRoomTimers(room);
  io.to(room.code).emit('game:paused', { reason: 'host_disconnected' });
}

const PHASE_RESUME = {
  FINALE_INTRO: (io, room) => (ms) => setRoomTimer(room, 'intro', () => startRound(io, room), ms),
  INTRO:      (io, room) => (ms) => setRoomTimer(room, 'intro', () => startRound(io, room), ms),
  QUESTION:   (io, room) => (ms) => setRoomTimer(room, 'question', () => endQuestion(io, room), ms),
  BETTING:    (io, room) => (ms) => setRoomTimer(room, 'betting', () => endBetting(io, room, null), ms),
  REVEAL:     (io, room) => (ms) => setRoomTimer(room, 'reveal', () => showScoreboard(io, room), ms),
  SCOREBOARD: (io, room) => (ms) => setRoomTimer(room, 'scoreboard', () => advanceRound(io, room), ms),
};

function resumeAfterHost(io, room) {
  if (!room.paused) return;
  room.paused = false;
  const remaining = room._pausedRemaining ?? 0;
  room._phaseStartedAt = Date.now();
  room._phaseDuration = remaining;

  PHASE_RESUME[room.state]?.(io, room)(remaining);
  io.to(room.code).emit('game:resumed', phaseTiming(room));
}

// Host control: cut the current phase short.
function skipPhase(io, room) {
  if (room.paused) return;
  switch (room.state) {
    case 'FINALE_INTRO':
    case 'INTRO':      clearRoomTimer(room, 'intro'); return startRound(io, room);
    case 'QUESTION':   clearRoomTimer(room, 'question'); return endQuestion(io, room);
    case 'BETTING':    clearRoomTimer(room, 'betting'); return endBetting(io, room, null);
    case 'REVEAL':     clearRoomTimer(room, 'reveal'); return showScoreboard(io, room);
    case 'SCOREBOARD': clearRoomTimer(room, 'scoreboard'); return advanceRound(io, room);
  }
}

// When someone drops, the remaining players may already have finished the phase.
function onPlayerDisconnected(io, room) {
  if (room.paused) return;
  const awaited = awaitedPlayers(room);
  if (awaited.length === 0) return;

  if (room.state === 'QUESTION' && awaited.every(p => room.answers[p.id] !== undefined)) {
    clearRoomTimer(room, 'question');
    endQuestion(io, room);
  } else if (room.state === 'BETTING' && awaited.every(p => room.bets[p.id] !== undefined)) {
    clearRoomTimer(room, 'betting');
    endBetting(io, room, null);
  } else if (room.state === 'QUESTION') {
    scheduleAnswerCount(io, room);
  }
}

// ─── resync ──────────────────────────────────────────────────────────────────

/**
 * Re-emit the current phase to one socket that just (re)connected.
 *
 * Everything here carries the real phase timing, including the reveal — which used
 * to replay its full duration from the start, so a phone that came back 8s into a
 * 10s reveal watched the whole sequence again while the TV had already moved on.
 */
function syncPlayerState(socket, room, pid) {
  const timing = phaseTiming(room);

  switch (room.state) {
    case 'LOBBY':
      socket.emit('room:updated', { players: sanitizePlayers(room.players) });
      break;
    case 'INTRO':
      if (room._lastIntroData) socket.emit('round:intro', { ...room._lastIntroData, ...timing });
      break;
    case 'FINALE_INTRO':
      if (room._lastFinaleIntro) socket.emit('round:finale_intro', { ...room._lastFinaleIntro, ...timing });
      break;
    case 'QUESTION':
      if (room._lastRoundStart) {
        socket.emit('round:start', {
          ...room._lastRoundStart,
          ...timing,
          // Land a player who already answered on the locked screen instead of a
          // fresh input they could submit from twice.
          alreadySubmitted: pid ? room.answers[pid] !== undefined : false,
          mySubmission: pid ? room.answers[pid] ?? null : null,
        });
        socket.emit('round:answer_count', {
          count: Object.keys(room.answers).length,
          total: awaitedPlayers(room).length,
          answered: Object.keys(room.answers),
        });
      }
      break;
    case 'BETTING':
      if (room._lastBettingData) {
        socket.emit('round:betting', {
          ...room._lastBettingData,
          ...timing,
          alreadySubmitted: pid ? room.bets[pid] !== undefined : false,
          myBet: pid ? room.bets[pid] ?? null : null,
        });
      }
      break;
    case 'REVEAL':
      if (room._lastRevealData) socket.emit('round:reveal', { ...room._lastRevealData, ...timing });
      break;
    case 'SCOREBOARD':
      if (room._lastScoreboardData) socket.emit('round:scoreboard', { ...room._lastScoreboardData, ...timing });
      break;
    case 'GAME_OVER':
      if (room._lastFinal) socket.emit('game:over', room._lastFinal);
      break;
  }

  if (room.paused) socket.emit('game:paused', { reason: 'host_disconnected' });
}

function computeRanked(room) {
  const answer = room.currentQuestion.answer;
  return activePlayers(room)
    .map(p => ({
      id: p.id,
      name: p.name,
      colorIndex: p.colorIndex,
      avatar: p.avatar,
      submitted: room.answers[p.id] !== undefined,
      guess: room.answers[p.id] ?? null,
      distance: room.answers[p.id] !== undefined ? Math.abs(room.answers[p.id] - answer) : null,
    }))
    .sort((a, b) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
}

module.exports = {
  handleGameEvent,
  syncPlayerState,
  setQuestions,
  resetToLobby,
  pickQuestions,     // exported for tests
  revealSchedule,    // exported for tests
  decorateRanked,    // exported for tests
};
