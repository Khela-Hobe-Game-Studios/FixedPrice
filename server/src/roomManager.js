const rooms = new Map();

const WORD_BANK = [
  'AMMU','GHOR','JHOL','LEBU','MEOW','ALOO','CHOP','GORU','MACH','BHAT',
  'MEYE','BHAI','TUMI','BABA','DADA','NANA','NANI','KAKA','MAMA','MAMI',
  'PANI','DAAL','RUTI','JUTA','KOLA','SUJI','GHEE','MURI','CHAI','BIRI',
  'LOHA','PATA','PHUL','MALA','GOLA','DOSH','KHUB','TARA','MEGH','JHOR',
  'BATI','THAK','GHUM','CHUL','BURA','MODH','KALO','SHOB',
];

const MAX_PLAYERS = 20;
const NAME_MAX = 16;
const IDLE_ROOM_MS = 2 * 60 * 60 * 1000; // reap rooms untouched for 2h

// Never hand out a code that belongs to a live room — an in-progress game must
// never be clobbered. Once the word bank is exhausted we suffix a digit rather
// than overwrite (WORD_BANK gives 48 codes, +digits gives 480).
function generateCode() {
  const available = WORD_BANK.filter(w => !rooms.has(w));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  for (let digit = 2; digit <= 9; digit++) {
    const pool = WORD_BANK.map(w => w.slice(0, 3) + digit).filter(c => !rooms.has(c));
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  }
  return null; // every code in use — caller must surface an error
}

function createRoom({ hostSocketId, questionCount = 10, eliminationMode = false, bettingRounds = false }) {
  const code = generateCode();
  if (!code) return null;

  const room = {
    code,
    hostSocketId,
    hostConnected: true,
    state: 'LOBBY',
    players: [],
    settings: { questionCount, eliminationMode, bettingRounds },
    currentQuestion: null,
    currentRound: 0,
    // All of these are keyed by the player's STABLE pid, never by socket id —
    // socket ids change on every reconnect and would silently reset scores.
    answers: {},      // pid -> number
    bets: {},         // pid -> target pid
    scores: {},       // pid -> number
    strikes: {},      // pid -> number (elimination mode)
    questionIndices: [],
    _timers: {},
    lastActivityAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return code ? rooms.get(code) : null;
}

function touchRoom(room) {
  if (room) room.lastActivityAt = Date.now();
}

function sanitizeName(raw) {
  const name = String(raw ?? '')
    // Strip C0/C1 control chars only — Bengali and emoji names must survive.
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
    .slice(0, NAME_MAX);
  return name || null;
}

// Names are display-only now that identity is the pid, but a party of 15 still
// needs to tell two Karims apart on the shared screen.
function uniqueName(room, name) {
  const taken = new Set(room.players.map(p => p.name));
  if (!taken.has(name)) return name;
  for (let n = 2; n < 100; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate)) return candidate;
  }
  return name;
}

function addPlayer(room, { pid, socketId, name }) {
  const existing = room.players.find(p => p.id === pid);
  if (existing) {
    // Same device re-joining — reattach the transport, keep score/strikes.
    existing.socketId = socketId;
    existing.connected = true;
    return existing;
  }
  if (room.players.length >= MAX_PLAYERS) return null;

  const player = {
    id: pid,
    socketId,
    name: uniqueName(room, name),
    score: 0,
    strikes: 0,
    eliminated: false,
    connected: true,
  };
  room.players.push(player);
  room.scores[pid] = room.scores[pid] ?? 0;
  room.strikes[pid] = room.strikes[pid] ?? 0;
  return player;
}

function findPlayerByPid(room, pid) {
  return pid ? room.players.find(p => p.id === pid) : undefined;
}

function findPlayerBySocket(room, socketId) {
  return room.players.find(p => p.socketId === socketId);
}

function removePlayer(room, pid) {
  room.players = room.players.filter(p => p.id !== pid);
}

function clearRoomTimers(room) {
  if (!room?._timers) return;
  for (const t of Object.values(room._timers)) clearTimeout(t);
  room._timers = {};
}

function setRoomTimer(room, key, fn, ms) {
  clearTimeout(room._timers[key]);
  room._timers[key] = setTimeout(fn, ms);
  return room._timers[key];
}

function clearRoomTimer(room, key) {
  clearTimeout(room._timers[key]);
  delete room._timers[key];
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearRoomTimers(room);
  for (const p of room.players) {
    if (p._disconnectTimer) clearTimeout(p._disconnectTimer);
  }
  rooms.delete(code);
}

// Rooms used to leak forever: abandoned games kept their timer chains alive and
// the code space filled up until new rooms overwrote live ones.
function startIdleSweeper(intervalMs = 15 * 60 * 1000) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.lastActivityAt > IDLE_ROOM_MS) {
        console.log('[rooms] reaping idle room', code);
        deleteRoom(code);
      }
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  rooms,
  MAX_PLAYERS,
  createRoom,
  getRoom,
  touchRoom,
  sanitizeName,
  addPlayer,
  findPlayerByPid,
  findPlayerBySocket,
  removePlayer,
  deleteRoom,
  clearRoomTimers,
  clearRoomTimer,
  setRoomTimer,
  startIdleSweeper,
};
