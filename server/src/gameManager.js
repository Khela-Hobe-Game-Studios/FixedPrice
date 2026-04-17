const questions = require('../../questions/questions.json');

const QUESTION_TIME = 30000;
const REVEAL_TIME = 5000;
const SCOREBOARD_TIME = 5000;
const BETTING_TIME = 20000;

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function handleGameEvent(io, room, event, payload = {}) {
  switch (event) {
    case 'START':               return startGame(io, room);
    case 'ANSWER':              return submitAnswer(io, room, payload);
    case 'BET':                 return submitBet(io, room, payload);
    case 'PLAYER_DISCONNECTED': return onPlayerDisconnected(io, room, payload);
  }
}

function startGame(io, room) {
  const indices = shuffle([...Array(questions.length).keys()]).slice(0, room.settings.questionCount);
  room.questionIndices = indices;
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

  const activePlayers = room.players.filter(p => !p.eliminated);
  room._lastRoundStart = {
    round: currentRound + 1,
    total: questionIndices.length,
    question: q.question,
    category: q.category,
    unit: q.unit,
    isBettingRound,
    players: activePlayers.map(p => ({ id: p.id, name: p.name })),
  };

  io.to(room.code).emit('round:start', {
    ...room._lastRoundStart,
    timer: QUESTION_TIME / 1000,
  });

  room._questionTimer = setTimeout(() => endQuestion(io, room), QUESTION_TIME);
}

function submitAnswer(io, room, { socketId, answer }) {
  if (room.state !== 'QUESTION') return;
  const player = room.players.find(p => p.id === socketId);
  if (!player || player.eliminated) return;

  room.answers[socketId] = Number(answer);

  const activePlayers = room.players.filter(p => !p.eliminated && p.connected !== false);
  const allAnswered = activePlayers.length > 0 && activePlayers.every(p => room.answers[p.id] !== undefined);

  io.to(room.code).emit('round:answer_count', {
    count: Object.keys(room.answers).length,
    total: activePlayers.length,
  });

  if (allAnswered) {
    clearTimeout(room._questionTimer);
    endQuestion(io, room);
  }
}

function endQuestion(io, room) {
  const { currentQuestion, answers, players } = room;
  const answer = currentQuestion.answer;

  const activePlayers = players.filter(p => !p.eliminated);
  const ranked = activePlayers
    .map(p => ({
      id: p.id,
      name: p.name,
      submitted: answers[p.id] !== undefined,
      guess: answers[p.id] ?? null,
      distance: answers[p.id] !== undefined ? Math.abs(answers[p.id] - answer) : Infinity,
    }))
    .sort((a, b) => a.distance - b.distance);

  if (ranked.length > 0 && ranked[0].distance !== Infinity) {
    const minDist = ranked[0].distance;
    const firstPlacers = ranked.filter(r => r.distance === minDist);
    firstPlacers.forEach(r => { room.scores[r.id] = (room.scores[r.id] || 0) + 3; });

    if (firstPlacers.length === 1 && ranked.length > 1) {
      const secondDist = ranked[firstPlacers.length].distance;
      if (secondDist !== Infinity) {
        ranked.filter(r => r.distance === secondDist)
          .forEach(r => { room.scores[r.id] = (room.scores[r.id] || 0) + 1; });
      }
    }
  }

  if (room.settings.eliminationMode && ranked.length > 0) {
    const worst = ranked[ranked.length - 1];
    if (worst.distance !== Infinity) {
      const player = players.find(p => p.id === worst.id);
      if (player) {
        player.strikes++;
        room.strikes[worst.id] = player.strikes;
        if (player.strikes >= 3) player.eliminated = true;
      }
    }
  }

  players.forEach(p => { p.score = room.scores[p.id] || 0; });

  room.state = room.isBettingRound ? 'BETTING' : 'REVEAL';

  if (room.isBettingRound) {
    room._phaseStartedAt = Date.now();
    room._phaseDuration = BETTING_TIME;
    room._lastBettingData = { ranked: ranked.map(r => ({ id: r.id, name: r.name })) };

    io.to(room.code).emit('round:betting', {
      ...room._lastBettingData,
      timer: BETTING_TIME / 1000,
    });
    room._bettingTimer = setTimeout(() => endBetting(io, room, ranked), BETTING_TIME);
  } else {
    revealAnswers(io, room, ranked);
  }
}

function submitBet(io, room, { socketId, targetId }) {
  if (room.state !== 'BETTING') return;
  if (socketId === targetId) return;
  room.bets[socketId] = targetId;

  const activePlayers = room.players.filter(p => !p.eliminated && p.connected !== false);
  const allBet = activePlayers.length > 0 && activePlayers.every(p => room.bets[p.id] !== undefined || p.id === targetId);
  if (allBet) {
    clearTimeout(room._bettingTimer);
    endBetting(io, room, null);
  }
}

function endBetting(io, room, preRanked) {
  const ranked = preRanked || computeRanked(room);
  const winner = ranked[0];
  if (winner && winner.distance !== Infinity) {
    const bettersOnWinner = Object.entries(room.bets).filter(([, t]) => t === winner.id);
    room.scores[winner.id] = (room.scores[winner.id] || 0) + bettersOnWinner.length;
    bettersOnWinner.forEach(([bettorId]) => {
      room.scores[bettorId] = (room.scores[bettorId] || 0) + 1;
    });
  }
  room.players.forEach(p => { p.score = room.scores[p.id] || 0; });
  revealAnswers(io, room, ranked, room.bets);
}

function revealAnswers(io, room, ranked, bets = {}) {
  room.state = 'REVEAL';
  room._lastRevealData = {
    ranked,
    correctAnswer: room.currentQuestion.answer,
    unit: room.currentQuestion.unit,
    funFact: room.currentQuestion.funFact || null,
    bets,
    scores: room.scores,
    strikes: room.strikes,
  };
  io.to(room.code).emit('round:reveal', room._lastRevealData);
  room._revealTimer = setTimeout(() => showScoreboard(io, room), REVEAL_TIME);
}

function showScoreboard(io, room) {
  room.state = 'SCOREBOARD';
  const scoreboard = room.players
    .map(p => ({ id: p.id, name: p.name, score: p.score, strikes: p.strikes, eliminated: p.eliminated }))
    .sort((a, b) => b.score - a.score);

  room._lastScoreboardData = { scoreboard };
  io.to(room.code).emit('round:scoreboard', room._lastScoreboardData);

  room._scoreboardTimer = setTimeout(() => {
    room.currentRound++;
    const remaining = room.players.filter(p => !p.eliminated);
    if (room.settings.eliminationMode && remaining.length <= 1) return endGame(io, room);
    startRound(io, room);
  }, SCOREBOARD_TIME);
}

function endGame(io, room) {
  room.state = 'GAME_OVER';
  const final = room.players
    .map(p => ({ id: p.id, name: p.name, score: p.score, strikes: p.strikes }))
    .sort((a, b) => b.score - a.score);

  room._lastFinal = { final };
  io.to(room.code).emit('game:over', room._lastFinal);
}

// When a player drops mid-game, re-check if the remaining connected players have already
// completed the current phase — if so, advance immediately rather than waiting for the timer.
function onPlayerDisconnected(io, room, { socketId }) {
  if (room.state === 'QUESTION') {
    const activePlayers = room.players.filter(p => !p.eliminated && p.connected !== false);
    if (activePlayers.length > 0 && activePlayers.every(p => room.answers[p.id] !== undefined)) {
      clearTimeout(room._questionTimer);
      endQuestion(io, room);
    }
  } else if (room.state === 'BETTING') {
    const activePlayers = room.players.filter(p => !p.eliminated && p.connected !== false);
    if (activePlayers.length > 0 && activePlayers.every(p => room.bets[p.id] !== undefined || p.id === socketId)) {
      clearTimeout(room._bettingTimer);
      endBetting(io, room, null);
    }
  }
}

// Re-emit current game state to a single reconnecting socket
function syncPlayerState(socket, room) {
  const timeLeft = room._phaseStartedAt
    ? Math.max(0, Math.round((room._phaseDuration - (Date.now() - room._phaseStartedAt)) / 1000))
    : 0;

  switch (room.state) {
    case 'LOBBY':
      socket.emit('room:updated', { players: room.players });
      break;
    case 'QUESTION':
      if (room._lastRoundStart) {
        socket.emit('round:start', { ...room._lastRoundStart, timer: timeLeft });
        socket.emit('round:answer_count', {
          count: Object.keys(room.answers).length,
          total: room.players.filter(p => !p.eliminated).length,
        });
      }
      break;
    case 'BETTING':
      if (room._lastBettingData) {
        socket.emit('round:betting', { ...room._lastBettingData, timer: timeLeft });
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
}

function computeRanked(room) {
  const { currentQuestion, answers, players } = room;
  const answer = currentQuestion.answer;
  return players
    .filter(p => !p.eliminated)
    .map(p => ({
      id: p.id,
      name: p.name,
      submitted: answers[p.id] !== undefined,
      guess: answers[p.id] ?? null,
      distance: answers[p.id] !== undefined ? Math.abs(answers[p.id] - answer) : Infinity,
    }))
    .sort((a, b) => a.distance - b.distance);
}

module.exports = { handleGameEvent, syncPlayerState };
