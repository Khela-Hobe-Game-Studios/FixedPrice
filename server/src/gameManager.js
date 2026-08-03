const { setRoomTimer, clearRoomTimer, clearRoomTimers, touchRoom } = require('./roomManager');

let questions = [];

// Player objects carry `_disconnectTimer` (a Node Timeout with circular linked-list
// internals). Emitting them raw blows the stack inside socket.io's hasBinary().
function sanitizePlayers(players) {
  return players.map(({ id, name, score, strikes, eliminated, connected }) =>
    ({ id, name, score, strikes, eliminated, connected }));
}

function setQuestions(q) { questions = q; }

const QUESTION_TIME = 30000;
const SCOREBOARD_TIME = 5000;
const BETTING_TIME = 20000;

// The host animates reveal cards at 450ms apart. A fixed 5s reveal cut the
// animation off partway through at anything above ~9 players, so nobody ever
// saw the winner land. Scale with the field and cap so it never drags.
const REVEAL_BASE_MS = 3000;
const REVEAL_PER_PLAYER_MS = 450;
const REVEAL_MAX_MS = 10000;

function revealDuration(rankedCount) {
  return Math.min(REVEAL_BASE_MS + rankedCount * REVEAL_PER_PLAYER_MS, REVEAL_MAX_MS);
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
  return room.players.filter(p => !p.eliminated && p.connected !== false);
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

function pickQuestions(count) {
  const order = shuffle([...Array(questions.length).keys()]);
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
  const count = Math.min(room.settings.questionCount, questions.length);
  room.questionIndices = pickQuestions(count);
  room.currentRound = 0;
  room.state = 'IN_GAME';
  startRound(io, room);
}

function startRound(io, room) {
  const { currentRound, questionIndices, settings } = room;
  if (currentRound >= questionIndices.length) return endGame(io, room);

  const q = questions[questionIndices[currentRound]];
  const isBettingRound = settings.bettingRounds && (currentRound + 1) % 5 === 0;

  room.currentQuestion = q;
  room.state = 'QUESTION';
  room.answers = {};
  room.bets = {};
  room.isBettingRound = isBettingRound;
  room._phaseStartedAt = Date.now();
  room._phaseDuration = QUESTION_TIME;
  room._answerCountDirty = false;
  touchRoom(room);

  room._lastRoundStart = {
    round: currentRound + 1,
    total: questionIndices.length,
    question: q.question,
    category: q.category,
    unit: q.unit,
    isBettingRound,
    players: activePlayers(room).map(p => ({ id: p.id, name: p.name })),
  };

  io.to(room.code).emit('round:start', {
    ...room._lastRoundStart,
    timer: QUESTION_TIME / 1000,
  });

  setRoomTimer(room, 'question', () => endQuestion(io, room), QUESTION_TIME);
}

function emitAnswerCount(io, room) {
  io.to(room.code).emit('round:answer_count', {
    count: Object.keys(room.answers).length,
    total: awaitedPlayers(room).length,
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
    firstPlacers.forEach(r => { room.scores[r.id] = (room.scores[r.id] || 0) + firstPts; });

    if (firstPlacers.length === 1 && scored.length > 1) {
      const secondDist = scored[1].distance;
      scored.filter(r => r.distance === secondDist)
        .forEach(r => { room.scores[r.id] = (room.scores[r.id] || 0) + 1; });
    }
  }

  // Strike the worst *submitter*. Previously this read the last ranked entry,
  // which is a non-submitter whenever anyone sits out — its null-distance guard
  // then skipped striking entirely, so at 15 players nobody was ever eliminated.
  if (room.settings.eliminationMode && scored.length > 0) {
    const worst = scored[scored.length - 1];
    const player = room.players.find(p => p.id === worst.id);
    if (player) {
      player.strikes++;
      room.strikes[worst.id] = player.strikes;
      if (player.strikes >= 3) player.eliminated = true;
    }
  }

  syncScores(room);

  if (room.isBettingRound) {
    room.state = 'BETTING';
    room._phaseStartedAt = Date.now();
    room._phaseDuration = BETTING_TIME;
    room._lastBettingData = { ranked: ranked.map(r => ({ id: r.id, name: r.name })) };

    io.to(room.code).emit('round:betting', {
      ...room._lastBettingData,
      timer: BETTING_TIME / 1000,
    });
    setRoomTimer(room, 'betting', () => endBetting(io, room, ranked), BETTING_TIME);
  } else {
    revealAnswers(io, room, ranked);
  }
}

function submitBet(io, room, { pid, targetId }) {
  if (room.state !== 'BETTING') return;
  if (pid === targetId) return;
  if (!room.players.some(p => p.id === targetId)) return;

  room.bets[pid] = targetId;
  touchRoom(room);

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
  const winner = ranked.find(r => r.distance !== null);
  if (winner) {
    const bettorsOnWinner = Object.entries(room.bets).filter(([, t]) => t === winner.id);
    room.scores[winner.id] = (room.scores[winner.id] || 0) + bettorsOnWinner.length;
    bettorsOnWinner.forEach(([bettorId]) => {
      room.scores[bettorId] = (room.scores[bettorId] || 0) + 1;
    });
  }
  syncScores(room);
  revealAnswers(io, room, ranked, room.bets);
}

function revealAnswers(io, room, ranked, bets = {}) {
  room.state = 'REVEAL';
  const revealMs = revealDuration(ranked.length);
  room._phaseStartedAt = Date.now();
  room._phaseDuration = revealMs;

  room._lastRevealData = {
    ranked,
    correctAnswer: room.currentQuestion.answer,
    unit: room.currentQuestion.unit,
    funFact: room.currentQuestion.funFact || null,
    bets,
    scores: room.scores,
    strikes: room.strikes,
    revealMs,
  };
  io.to(room.code).emit('round:reveal', room._lastRevealData);
  setRoomTimer(room, 'reveal', () => showScoreboard(io, room), revealMs);
}

function showScoreboard(io, room) {
  if (room.state !== 'REVEAL') return; // re-entrancy guard
  room.state = 'SCOREBOARD';
  clearRoomTimer(room, 'reveal');
  room._phaseStartedAt = Date.now();
  room._phaseDuration = SCOREBOARD_TIME;

  const scoreboard = room.players
    .map(p => ({ id: p.id, name: p.name, score: p.score, strikes: p.strikes, eliminated: p.eliminated }))
    .sort((a, b) => b.score - a.score);

  room._lastScoreboardData = { scoreboard };
  io.to(room.code).emit('round:scoreboard', room._lastScoreboardData);

  setRoomTimer(room, 'scoreboard', () => {
    room.currentRound++;
    const remaining = room.players.filter(p => !p.eliminated);
    if (room.settings.eliminationMode && remaining.length <= 1) return endGame(io, room);
    startRound(io, room);
  }, SCOREBOARD_TIME);
}

function endGame(io, room) {
  if (room.state === 'GAME_OVER') return;
  room.state = 'GAME_OVER';
  clearRoomTimers(room);
  touchRoom(room);

  const final = room.players
    .map(p => ({ id: p.id, name: p.name, score: p.score, strikes: p.strikes }))
    .sort((a, b) => b.score - a.score);

  room._lastFinal = { final };
  io.to(room.code).emit('game:over', room._lastFinal);
}

// Reset back to LOBBY keeping the same room code and roster, so a party of 15
// doesn't have to re-enter a new code between games.
function resetToLobby(io, room) {
  clearRoomTimers(room);
  room.state = 'LOBBY';
  room.currentRound = 0;
  room.currentQuestion = null;
  room.questionIndices = [];
  room.answers = {};
  room.bets = {};
  room.scores = {};
  room.strikes = {};
  room.isBettingRound = false;
  room._lastRoundStart = room._lastBettingData = room._lastRevealData = null;
  room._lastScoreboardData = room._lastFinal = null;
  room._phaseStartedAt = null;
  room.players.forEach(p => {
    p.score = 0; p.strikes = 0; p.eliminated = false;
    room.scores[p.id] = 0; room.strikes[p.id] = 0;
  });
  touchRoom(room);
  io.to(room.code).emit('room:reset', { players: sanitizePlayers(room.players) });
}

function syncScores(room) {
  room.players.forEach(p => { p.score = room.scores[p.id] || 0; });
}

// A dead host tab used to leave the timers advancing to nobody. Freeze the clock
// and tell the players, then pick up where we left off when the host returns.
function pauseForHost(io, room) {
  if (room.paused || room.state === 'LOBBY' || room.state === 'GAME_OVER') return;
  room.paused = true;
  room._pausedRemaining = room._phaseStartedAt
    ? Math.max(0, room._phaseDuration - (Date.now() - room._phaseStartedAt))
    : 0;
  clearRoomTimers(room);
  io.to(room.code).emit('game:paused', { reason: 'host_disconnected' });
}

function resumeAfterHost(io, room) {
  if (!room.paused) return;
  room.paused = false;
  const remaining = room._pausedRemaining ?? 0;
  room._phaseStartedAt = Date.now();
  room._phaseDuration = remaining;

  const resume = {
    QUESTION:   () => setRoomTimer(room, 'question',   () => endQuestion(io, room), remaining),
    BETTING:    () => setRoomTimer(room, 'betting',    () => endBetting(io, room, null), remaining),
    REVEAL:     () => setRoomTimer(room, 'reveal',     () => showScoreboard(io, room), remaining),
    SCOREBOARD: () => setRoomTimer(room, 'scoreboard', () => {
      room.currentRound++;
      const left = room.players.filter(p => !p.eliminated);
      if (room.settings.eliminationMode && left.length <= 1) return endGame(io, room);
      startRound(io, room);
    }, remaining),
  }[room.state];

  resume?.();
  io.to(room.code).emit('game:resumed', { timer: Math.round(remaining / 1000) });
}

// Host control: cut the current phase short.
function skipPhase(io, room) {
  if (room.paused) return;
  if (room.state === 'QUESTION')   { clearRoomTimer(room, 'question'); return endQuestion(io, room); }
  if (room.state === 'BETTING')    { clearRoomTimer(room, 'betting'); return endBetting(io, room, null); }
  if (room.state === 'REVEAL')     { clearRoomTimer(room, 'reveal'); return showScoreboard(io, room); }
  if (room.state === 'SCOREBOARD') {
    clearRoomTimer(room, 'scoreboard');
    room.currentRound++;
    const left = room.players.filter(p => !p.eliminated);
    if (room.settings.eliminationMode && left.length <= 1) return endGame(io, room);
    return startRound(io, room);
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

// Re-emit the current phase to one reconnecting socket, with a time-corrected timer.
function syncPlayerState(socket, room, pid) {
  const timeLeft = room._phaseStartedAt && !room.paused
    ? Math.max(0, Math.round((room._phaseDuration - (Date.now() - room._phaseStartedAt)) / 1000))
    : Math.round((room._pausedRemaining ?? 0) / 1000);

  switch (room.state) {
    case 'LOBBY':
      socket.emit('room:updated', { players: sanitizePlayers(room.players) });
      break;
    case 'QUESTION':
      if (room._lastRoundStart) {
        socket.emit('round:start', {
          ...room._lastRoundStart,
          timer: timeLeft,
          // Land a player who already answered on the locked screen instead of a
          // fresh input they could submit from twice.
          alreadySubmitted: pid ? room.answers[pid] !== undefined : false,
          mySubmission: pid ? room.answers[pid] ?? null : null,
        });
        socket.emit('round:answer_count', {
          count: Object.keys(room.answers).length,
          total: awaitedPlayers(room).length,
        });
      }
      break;
    case 'BETTING':
      if (room._lastBettingData) {
        socket.emit('round:betting', {
          ...room._lastBettingData,
          timer: timeLeft,
          alreadySubmitted: pid ? room.bets[pid] !== undefined : false,
        });
      }
      break;
    case 'REVEAL':
      if (room._lastRevealData) socket.emit('round:reveal', room._lastRevealData);
      break;
    case 'SCOREBOARD':
      if (room._lastScoreboardData) socket.emit('round:scoreboard', room._lastScoreboardData);
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
  sanitizePlayers,
  pickQuestions, // exported for tests
};
