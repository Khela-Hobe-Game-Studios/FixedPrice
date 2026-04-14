const questions = require('../../questions/questions.json');

const QUESTION_TIME = 30000;  // 30s
const REVEAL_TIME = 5000;     // 5s
const SCOREBOARD_TIME = 5000; // 5s
const BETTING_TIME = 20000;   // 20s

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function handleGameEvent(io, room, event, payload = {}) {
  switch (event) {
    case 'START':
      return startGame(io, room);
    case 'ANSWER':
      return submitAnswer(io, room, payload);
    case 'BET':
      return submitBet(io, room, payload);
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

  const activePlayers = room.players.filter(p => !p.eliminated);

  io.to(room.code).emit('round:start', {
    round: currentRound + 1,
    total: questionIndices.length,
    question: q.question,
    category: q.category,
    unit: q.unit,
    isBettingRound,
    timer: QUESTION_TIME / 1000,
    players: activePlayers.map(p => ({ id: p.id, name: p.name })),
  });

  room._questionTimer = setTimeout(() => endQuestion(io, room), QUESTION_TIME);
}

function submitAnswer(io, room, { socketId, answer }) {
  if (room.state !== 'QUESTION') return;
  const player = room.players.find(p => p.id === socketId);
  if (!player || player.eliminated) return;

  room.answers[socketId] = Number(answer);

  const activePlayers = room.players.filter(p => !p.eliminated);
  const allAnswered = activePlayers.every(p => room.answers[p.id] !== undefined);

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

  // Award points
  if (ranked.length > 0 && ranked[0].distance !== Infinity) {
    const minDist = ranked[0].distance;
    // Handle ties for first
    const firstPlacers = ranked.filter(r => r.distance === minDist);
    firstPlacers.forEach(r => { room.scores[r.id] = (room.scores[r.id] || 0) + 3; });

    if (firstPlacers.length === 1 && ranked.length > 1) {
      const secondDist = ranked[firstPlacers.length].distance;
      if (secondDist !== Infinity) {
        const secondPlacers = ranked.filter(r => r.distance === secondDist);
        secondPlacers.forEach(r => { room.scores[r.id] = (room.scores[r.id] || 0) + 1; });
      }
    }
  }

  // Elimination mode: strike the furthest
  if (room.settings.eliminationMode && ranked.length > 0) {
    const worst = ranked[ranked.length - 1];
    if (worst.distance !== Infinity) {
      const player = players.find(p => p.id === worst.id);
      if (player) {
        player.strikes++;
        room.strikes[worst.id] = player.strikes;
        if (player.strikes >= 3) {
          player.eliminated = true;
        }
      }
    }
  }

  // Sync scores back to player objects
  players.forEach(p => { p.score = room.scores[p.id] || 0; });

  room.state = room.isBettingRound ? 'BETTING' : 'REVEAL';

  if (room.isBettingRound) {
    io.to(room.code).emit('round:betting', {
      ranked: ranked.map(r => ({ id: r.id, name: r.name })), // don't reveal guesses yet
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

  const activePlayers = room.players.filter(p => !p.eliminated);
  const allBet = activePlayers.every(p => room.bets[p.id] !== undefined || p.id === targetId);
  if (allBet) {
    clearTimeout(room._bettingTimer);
    endBetting(io, room, null);
  }
}

function endBetting(io, room, preRanked) {
  // If we don't have ranked (timer fired after betting), recompute
  const ranked = preRanked || computeRanked(room);

  // Apply betting bonuses
  const winner = ranked[0];
  if (winner && winner.distance !== Infinity) {
    const bettersOnWinner = Object.entries(room.bets).filter(([, t]) => t === winner.id);
    // Winner gets +1 per bettor on them
    room.scores[winner.id] = (room.scores[winner.id] || 0) + bettersOnWinner.length;
    // Each correct bettor gets +1
    bettersOnWinner.forEach(([bettorId]) => {
      room.scores[bettorId] = (room.scores[bettorId] || 0) + 1;
    });
  }

  room.players.forEach(p => { p.score = room.scores[p.id] || 0; });
  revealAnswers(io, room, ranked, room.bets);
}

function revealAnswers(io, room, ranked, bets = {}) {
  room.state = 'REVEAL';
  io.to(room.code).emit('round:reveal', {
    ranked,
    correctAnswer: room.currentQuestion.answer,
    unit: room.currentQuestion.unit,
    funFact: room.currentQuestion.funFact || null,
    bets,
    scores: room.scores,
    strikes: room.strikes,
  });

  room._revealTimer = setTimeout(() => showScoreboard(io, room), REVEAL_TIME);
}

function showScoreboard(io, room) {
  room.state = 'SCOREBOARD';
  const scoreboard = room.players
    .map(p => ({ id: p.id, name: p.name, score: p.score, strikes: p.strikes, eliminated: p.eliminated }))
    .sort((a, b) => b.score - a.score);

  io.to(room.code).emit('round:scoreboard', { scoreboard });

  room._scoreboardTimer = setTimeout(() => {
    room.currentRound++;
    // Check if only one player left (elimination mode)
    const remaining = room.players.filter(p => !p.eliminated);
    if (room.settings.eliminationMode && remaining.length <= 1) {
      return endGame(io, room);
    }
    startRound(io, room);
  }, SCOREBOARD_TIME);
}

function endGame(io, room) {
  room.state = 'GAME_OVER';
  const final = room.players
    .map(p => ({ id: p.id, name: p.name, score: p.score, strikes: p.strikes }))
    .sort((a, b) => b.score - a.score);

  io.to(room.code).emit('game:over', { final });
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

module.exports = { handleGameEvent };
