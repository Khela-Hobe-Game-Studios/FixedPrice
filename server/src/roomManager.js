const rooms = new Map();

const WORD_BANK = [
  'AMMU','GHOR','JHOL','LEBU','MEOW','ALOO','CHOP','GORU','MACH','BHAT',
  'MEYE','BHAI','TUMI','BABA','DADA','NANA','NANI','KAKA','MAMA','MAMI',
  'PANI','DAAL','RUTI','JUTA','KOLA','SUJI','GHEE','MURI','CHAI','BIRI',
  'LOHA','PATA','PHUL','MALA','GOLA','DOSH','KHUB','TARA','MEGH','JHOR',
  'BATI','THAK','GHUM','CHUL','BURA','MODH','KALO','SHOB',
];

function generateCode() {
  const available = WORD_BANK.filter(w => !rooms.has(w));
  const pool = available.length > 0 ? available : WORD_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

function createRoom({ hostSocketId, questionCount = 10, eliminationMode = false, bettingRounds = false }) {
  const code = generateCode();
  const room = {
    code,
    hostSocketId,
    state: 'LOBBY',
    players: [],
    settings: { questionCount, eliminationMode, bettingRounds },
    currentQuestion: null,
    currentRound: 0,
    answers: {},      // socketId -> number
    bets: {},         // socketId -> targetSocketId
    scores: {},       // socketId -> number
    strikes: {},      // socketId -> number (elimination mode)
    questionIndices: [],
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return code ? rooms.get(code) : null;
}

function addPlayer(room, { id, name }) {
  if (room.players.find(p => p.id === id)) return;
  room.players.push({ id, name, score: 0, strikes: 0, eliminated: false });
  room.scores[id] = 0;
  room.strikes[id] = 0;
}

function removePlayer(room, socketId) {
  room.players = room.players.filter(p => p.id !== socketId);
}

function deleteRoom(code) {
  rooms.delete(code);
}

module.exports = { rooms, createRoom, getRoom, addPlayer, removePlayer, deleteRoom };
