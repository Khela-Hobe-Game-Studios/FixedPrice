const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
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
  startIdleSweeper,
} = require('./roomManager');
const { handleGameEvent, syncPlayerState, setQuestions, resetToLobby, sanitizePlayers } = require('./gameManager');
const { loadQuestions } = require('./questionsLoader');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  // Phones sleep aggressively; give a backgrounded tab room to come back before
  // the server declares it gone.
  pingInterval: 20000,
  pingTimeout: 25000,
});

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const LOBBY_GRACE_MS = 15000;
const GAME_GRACE_MS = 90000;
const HOST_GRACE_MS = 20000;
const GAME_OVER_ROOM_TTL = 10 * 60 * 1000;
const MAX_ANSWER_MAGNITUDE = 1e15;

// ─── validation ──────────────────────────────────────────────────────────────

// Only accept a real number or a numeric string. Coercing with Number() alone
// is a trap: socket.io serializes with JSON, so a client sending Infinity/NaN
// arrives as `null` — and Number(null), Number(''), Number([]) are all 0, which
// would silently score as a guess of zero.
function parseAnswer(raw) {
  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    n = Number(raw);
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > MAX_ANSWER_MAGNITUDE) return null;
  return n;
}

function isValidCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{4}$/.test(code.toUpperCase());
}

function isValidPid(pid) {
  return typeof pid === 'string' && pid.length > 0 && pid.length <= 64;
}

// Simple token bucket per socket — a spammed submit used to fan out a broadcast
// to every client in the room with no ceiling.
function allow(socket, key, perSec = 5) {
  const now = Date.now();
  socket.data._buckets ??= {};
  const b = (socket.data._buckets[key] ??= { tokens: perSec, last: now });
  b.tokens = Math.min(perSec, b.tokens + ((now - b.last) / 1000) * perSec);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    state: room.state,
    players: sanitizePlayers(room.players),
    settings: room.settings,
  };
}

function broadcastPlayers(code, room) {
  io.to(code).emit('room:updated', { players: sanitizePlayers(room.players) });
}

// ─── socket handlers ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('host:create_room', ({ questionCount, eliminationMode, bettingRounds } = {}) => {
    if (!allow(socket, 'create', 2)) return;

    const count = [10, 15, 20].includes(Number(questionCount)) ? Number(questionCount) : 10;
    const room = createRoom({
      hostSocketId: socket.id,
      questionCount: count,
      eliminationMode: !!eliminationMode,
      bettingRounds: !!bettingRounds,
    });
    if (!room) return socket.emit('error', { message: 'No rooms available right now — try again shortly' });

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    socket.emit('room:created', { code: room.code });
    console.log('room created:', room.code);
  });

  socket.on('player:join', ({ code, name, pid } = {}) => {
    if (!allow(socket, 'join', 3)) return;
    if (!isValidCode(code)) return socket.emit('error', { message: 'Room not found' });
    if (!isValidPid(pid)) return socket.emit('error', { message: 'Invalid session — please refresh' });

    const room = getRoom(String(code).toUpperCase());
    if (!room) return socket.emit('error', { message: 'Room not found' });

    const clean = sanitizeName(name);
    if (!clean) return socket.emit('error', { message: 'Please enter a name' });

    // A returning device is allowed back in mid-game; a brand-new one is not.
    const existing = findPlayerByPid(room, pid);
    if (!existing && room.state !== 'LOBBY') {
      return socket.emit('error', { message: 'Game already started' });
    }

    const player = addPlayer(room, { pid, socketId: socket.id, name: clean });
    if (!player) return socket.emit('error', { message: `Room is full (max ${MAX_PLAYERS} players)` });

    if (player._disconnectTimer) {
      clearTimeout(player._disconnectTimer);
      delete player._disconnectTimer;
    }

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.pid = pid;
    touchRoom(room);

    broadcastPlayers(room.code, room);
    socket.emit('player:joined', { room: sanitizeRoom(room), you: { id: pid, name: player.name } });
    if (room.state !== 'LOBBY') syncPlayerState(socket, room, pid);
    console.log(`${player.name} joined room ${room.code}`);
  });

  // Fires on every reconnect, not just an explicit refresh.
  socket.on('player:rejoin', ({ code, pid, name } = {}) => {
    if (!isValidCode(code) || !isValidPid(pid)) {
      return socket.emit('error', { message: 'Room not found' });
    }
    const room = getRoom(String(code).toUpperCase());
    if (!room) return socket.emit('error', { message: 'Room not found' });

    let player = findPlayerByPid(room, pid);

    // Dropped from the lobby and came back — let them straight back in.
    if (!player && room.state === 'LOBBY') {
      const clean = sanitizeName(name);
      if (clean) player = addPlayer(room, { pid, socketId: socket.id, name: clean });
    }
    if (!player) return socket.emit('error', { message: 'Player not found in room' });

    if (player._disconnectTimer) {
      clearTimeout(player._disconnectTimer);
      delete player._disconnectTimer;
    }

    player.socketId = socket.id;
    player.connected = true;
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.pid = pid;
    touchRoom(room);

    socket.emit('player:joined', { room: sanitizeRoom(room), you: { id: pid, name: player.name } });
    syncPlayerState(socket, room, pid);
    broadcastPlayers(room.code, room);
    console.log(`${player.name} rejoined room ${room.code}`);
  });

  socket.on('host:rejoin', ({ code } = {}) => {
    if (!isValidCode(code)) return socket.emit('error', { message: 'Room not found' });
    const room = getRoom(String(code).toUpperCase());
    if (!room) return socket.emit('error', { message: 'Room not found' });

    room.hostSocketId = socket.id;
    room.hostConnected = true;
    if (room._hostTimer) { clearTimeout(room._hostTimer); delete room._hostTimer; }

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    touchRoom(room);

    socket.emit('room:created', { code: room.code });
    socket.emit('room:updated', { players: sanitizePlayers(room.players) });
    if (room.paused) handleGameEvent(io, room, 'HOST_BACK');
    syncPlayerState(socket, room, null);
    console.log(`host rejoined room ${room.code}`);
  });

  socket.on('host:start_game', () => {
    const room = getRoom(socket.data?.roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players' });
    handleGameEvent(io, room, 'START');
  });

  socket.on('host:skip', () => {
    const room = getRoom(socket.data?.roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    if (!allow(socket, 'skip', 2)) return;
    handleGameEvent(io, room, 'SKIP');
  });

  socket.on('host:end_game', () => {
    const room = getRoom(socket.data?.roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    handleGameEvent(io, room, 'END');
  });

  // Rematch with the same room code and roster.
  socket.on('host:play_again', () => {
    const room = getRoom(socket.data?.roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    resetToLobby(io, room);
  });

  socket.on('player:submit_answer', ({ answer } = {}) => {
    if (!allow(socket, 'answer', 5)) return;
    const room = getRoom(socket.data?.roomCode);
    const pid = socket.data?.pid;
    if (!room || !pid) return;

    const value = parseAnswer(answer);
    if (value === null) return socket.emit('error', { message: 'Please enter a valid number' });

    handleGameEvent(io, room, 'ANSWER', { pid, answer: value });
  });

  socket.on('player:submit_bet', ({ targetId } = {}) => {
    if (!allow(socket, 'bet', 5)) return;
    const room = getRoom(socket.data?.roomCode);
    const pid = socket.data?.pid;
    if (!room || !pid || !isValidPid(targetId)) return;
    handleGameEvent(io, room, 'BET', { pid, targetId });
  });

  socket.on('disconnect', () => {
    const code = socket.data?.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;

    // Host went away — freeze rather than play on to an empty screen.
    if (socket.data.isHost && room.hostSocketId === socket.id) {
      room.hostConnected = false;
      room._hostTimer = setTimeout(() => {
        if (!room.hostConnected) handleGameEvent(io, room, 'HOST_LOST');
      }, HOST_GRACE_MS);
      return;
    }

    const player = findPlayerBySocket(room, socket.id);
    if (!player) return;

    player.connected = false;
    if (room.state !== 'LOBBY') handleGameEvent(io, room, 'PLAYER_DISCONNECTED', { pid: player.id });
    broadcastPlayers(code, room);

    const timeout = room.state === 'LOBBY' ? LOBBY_GRACE_MS : GAME_GRACE_MS;
    player._disconnectTimer = setTimeout(() => {
      if (player.connected === false) {
        removePlayer(room, player.id);
        broadcastPlayers(code, room);
        // Nobody left and no host watching — let the room go.
        if (room.players.length === 0 && !room.hostConnected) deleteRoom(code);
      }
    }, timeout);
  });
});

// Reap finished rooms shortly after the podium so codes return to the pool.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.state === 'GAME_OVER' && now - room.lastActivityAt > GAME_OVER_ROOM_TTL) {
      deleteRoom(code);
    }
  }
}, 60000).unref?.();

startIdleSweeper();

const PORT = process.env.PORT || 3001;
loadQuestions()
  .then(q => {
    setQuestions(q);
    server.listen(PORT, () => console.log(`Server running on port ${PORT} — ${q.length} questions loaded`));
  })
  .catch(err => {
    console.error('[questions] Failed to load questions:', err.message);
    process.exit(1);
  });
