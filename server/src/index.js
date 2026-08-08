const path = require('path');

/* A repo-root .env, if there is one, before anything reads process.env. Local
 * convenience only — Render sets its variables itself, and the file is gitignored.
 * Real environment variables always win: loadEnvFile does not overwrite them. */
try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'));
} catch { /* no .env, or a Node too old to have loadEnvFile — both are fine */ }

const express = require('express');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  rooms,
  MAX_PLAYERS,
  normalizeSettings,
  createRoom,
  getRoom,
  touchRoom,
  sanitizeName,
  addPlayer,
  setAvatar,
  findPlayerByPid,
  findPlayerBySocket,
  removePlayer,
  deleteRoom,
  startIdleSweeper,
} = require('./roomManager');
const { handleGameEvent, syncPlayerState, setQuestions, resetToLobby } = require('./gameManager');
const { sanitizePlayers } = require('./sanitize');
const { loadQuestions, questionSource } = require('./questionsLoader');

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

/* `questions` is here so you can tell which deck is loaded without reading a log.
 * A game played against the wrong bank is only obvious once somebody recognises a
 * question, which is exactly one question too late. */
app.get('/health', (req, res) => res.json({
  ok: true,
  rooms: rooms.size,
  questions: { source: questionSource(), count: questionCount },
}));

let questionCount = 0;

const LOBBY_GRACE_MS = 15000;
const GAME_GRACE_MS = 90000;
const HOST_GRACE_MS = 20000;
const GAME_OVER_ROOM_TTL = 10 * 60 * 1000;
const MAX_ANSWER_MAGNITUDE = 1e15;
const MAX_ROOMS_PER_SOCKET = 5;

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

// Constant-time compare so a wrong host token cannot be narrowed down by timing.
// Both sides are our own base64url, but length-equality is checked first because
// crypto.timingSafeEqual throws on a mismatch rather than returning false.
function timingSafeEqual(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
  // Clients derive every countdown from the server's clock rather than from a
  // number handed to them once, so they measure the offset here first. Round-trip
  // halved is close enough on a LAN and stops a slow socket from showing 30 when
  // the board says 27.
  socket.on('time:ping', (clientSent, ack) => {
    const payload = { clientSent, serverNow: Date.now() };
    if (typeof ack === 'function') return ack(payload);
    socket.emit('time:pong', payload);
  });

  socket.on('host:create_room', (settings = {}) => {
    if (!allow(socket, 'create', 2)) return;

    // A ceiling on top of the rate limit, to raise the cost of walking the 480-code
    // space. It is not a guarantee: this counter lives on the socket, so reconnecting
    // clears it exactly as it clears the token bucket. What actually closes the
    // exhaustion hole is reaping abandoned empty lobbies on a short clock
    // (EMPTY_LOBBY_MS in roomManager.js) — this just makes it slower to try.
    socket.data._created = (socket.data._created ?? []).filter((c) => rooms.has(c));
    if (socket.data._created.length >= MAX_ROOMS_PER_SOCKET) {
      return socket.emit('error', { message: 'Too many open rooms from this device' });
    }

    const room = createRoom({ hostSocketId: socket.id, settings });
    if (!room) return socket.emit('error', { message: 'No rooms available right now — try again shortly' });

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    socket.data.hostToken = room.hostToken;
    socket.data._created.push(room.code);
    // The token goes to this socket only, never over a broadcast — it is what the
    // host presents on rejoin instead of just knowing the room code.
    socket.emit('room:created', { code: room.code, settings: room.settings, hostToken: room.hostToken });
    console.log('room created:', room.code);
  });

  // Settings are editable until the game starts, so the host can open the room
  // (and let people join and pick a face) before deciding how long to play for.
  socket.on('host:update_settings', (settings = {}) => {
    const room = getRoom(socket.data?.roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.state !== 'LOBBY') return;
    if (!allow(socket, 'settings', 5)) return;

    room.settings = normalizeSettings(settings, room.settings);
    touchRoom(room);
    io.to(room.code).emit('room:settings', { settings: room.settings });
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
    socket.emit('player:joined', {
      room: sanitizeRoom(room),
      you: { id: pid, name: player.name, colorIndex: player.colorIndex, avatar: player.avatar },
    });
    if (room.state !== 'LOBBY') syncPlayerState(socket, room, pid);
    console.log(`${player.name} joined room ${room.code}`);
  });

  // Picking a face is a lobby activity. Left ungated it also fired mid-reveal, and
  // every call re-broadcast the whole roster — twenty 12KB avatars to twenty
  // sockets for one player changing their mind, on a free-tier box.
  socket.on('player:set_avatar', (avatar = {}) => {
    if (!allow(socket, 'avatar', 3)) return;
    const room = getRoom(socket.data?.roomCode);
    const pid = socket.data?.pid;
    if (!room || !pid) return;
    if (room.state !== 'LOBBY') return socket.emit('error', { message: 'Faces are locked once the game starts' });

    const player = findPlayerByPid(room, pid);
    if (!setAvatar(player, avatar)) return socket.emit('error', { message: 'That picture did not stick — try again' });

    touchRoom(room);
    socket.emit('player:avatar_set', { avatar: player.avatar });
    // One player changed, so send one player — not the roster and every picture on it.
    io.to(room.code).emit('player:avatar', { id: pid, avatar: player.avatar });
  });

  // Fires on every reconnect, not just an explicit refresh.
  socket.on('player:rejoin', ({ code, pid, name } = {}) => {
    // In the lobby this is also a join path (it can call addPlayer), so it needs the
    // same ceiling player:join has or it is simply the unlimited way in.
    if (!allow(socket, 'join', 3)) return;
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
    player.connectionState = 'connected';
    player.seatHoldUntil = null;
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.pid = pid;
    touchRoom(room);

    socket.emit('player:joined', {
      room: sanitizeRoom(room),
      you: { id: pid, name: player.name, colorIndex: player.colorIndex, avatar: player.avatar },
    });
    syncPlayerState(socket, room, pid);
    broadcastPlayers(room.code, room);
    console.log(`${player.name} rejoined room ${room.code}`);
  });

  socket.on('host:rejoin', ({ code, hostToken } = {}) => {
    if (!allow(socket, 'hostrejoin', 3)) return;
    if (!isValidCode(code)) return socket.emit('error', { message: 'Room not found' });
    const room = getRoom(String(code).toUpperCase());
    if (!room) return socket.emit('error', { message: 'Room not found' });

    // Host control used to be granted on the room code alone. The code is one of 48
    // words and this handler is reachable by anyone, so guessing it took over the
    // game and demoted the real host — their socket id no longer matched.
    if (!timingSafeEqual(hostToken, room.hostToken)) {
      return socket.emit('error', { message: 'Not the host of this room' });
    }

    room.hostSocketId = socket.id;
    room.hostConnected = true;
    if (room._hostTimer) { clearTimeout(room._hostTimer); delete room._hostTimer; }

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    socket.data.hostToken = room.hostToken;
    touchRoom(room);

    socket.emit('room:created', { code: room.code, hostToken: room.hostToken });
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

    const inLobby = room.state === 'LOBBY';
    const timeout = inLobby ? LOBBY_GRACE_MS : GAME_GRACE_MS;

    player.connectionState = 'reconnecting';
    player.seatHoldUntil = Date.now() + timeout;
    if (!inLobby) handleGameEvent(io, room, 'PLAYER_DISCONNECTED', { pid: player.id });
    broadcastPlayers(code, room);

    player._disconnectTimer = setTimeout(() => {
      if (player.connectionState !== 'reconnecting') return;

      // In the lobby a no-show is just gone. Mid-game they keep their seat and
      // their score — a phone that dies at round 6 should still be on the final
      // standings, and they can walk back in on the same name.
      if (inLobby) {
        removePlayer(room, player.id);
      } else {
        player.connectionState = 'dropped';
        player.seatHoldUntil = null;
      }
      broadcastPlayers(code, room);

      // Nobody left to play and no host watching — let the room go.
      const anyoneLeft = room.players.some(p => p.connectionState === 'connected');
      if (!anyoneLeft && !room.hostConnected) deleteRoom(code);
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
    questionCount = q.length;
    server.listen(PORT, () => console.log(`Server running on port ${PORT} — ${q.length} questions from ${questionSource()}`));
  })
  .catch(err => {
    console.error('[questions] Failed to load questions:', err.message);
    process.exit(1);
  });
