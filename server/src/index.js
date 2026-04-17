const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createRoom, getRoom, removePlayer, addPlayer } = require('./roomManager');
const { handleGameEvent, syncPlayerState } = require('./gameManager');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.get('/health', (req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('host:create_room', ({ questionCount, eliminationMode, bettingRounds }) => {
    const room = createRoom({ hostSocketId: socket.id, questionCount, eliminationMode, bettingRounds });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.emit('room:created', { code: room.code });
    console.log('room created:', room.code);
  });

  socket.on('player:join', ({ code, name }) => {
    const room = getRoom(code);
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.state !== 'LOBBY') return socket.emit('error', { message: 'Game already started' });

    addPlayer(room, { id: socket.id, name });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = name;

    io.to(code).emit('room:updated', { players: room.players });
    socket.emit('player:joined', { room: sanitizeRoom(room) });
    console.log(`${name} joined room ${code}`);
  });

  // Reconnect handler for players who refreshed mid-game
  socket.on('player:rejoin', ({ code, name }) => {
    const room = getRoom(code);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    const player = room.players.find(p => p.name === name);
    if (!player) return socket.emit('error', { message: 'Player not found in room' });

    // Update socket id and mark as reconnected
    player.id = socket.id;
    player.connected = true;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = name;

    socket.emit('player:joined', { room: sanitizeRoom(room) });
    syncPlayerState(socket, room);
    console.log(`${name} rejoined room ${code}`);
  });

  // Reconnect handler for host who refreshed mid-game
  socket.on('host:rejoin', ({ code }) => {
    const room = getRoom(code);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    room.hostSocketId = socket.id;
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit('room:created', { code: room.code });
    syncPlayerState(socket, room);
    console.log(`host rejoined room ${code}`);
  });

  socket.on('host:start_game', () => {
    const code = socket.data?.roomCode || findRoomCodeByHost(socket.id);
    const room = getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return;
    handleGameEvent(io, room, 'START');
  });

  socket.on('player:submit_answer', ({ answer }) => {
    const room = getRoom(socket.data?.roomCode);
    if (!room) return;
    handleGameEvent(io, room, 'ANSWER', { socketId: socket.id, answer });
  });

  socket.on('player:submit_bet', ({ targetId }) => {
    const room = getRoom(socket.data?.roomCode);
    if (!room) return;
    handleGameEvent(io, room, 'BET', { socketId: socket.id, targetId });
  });

  socket.on('disconnect', () => {
    const code = socket.data?.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;

    if (room.state === 'LOBBY') {
      // Pre-game: fully remove the player
      removePlayer(room, socket.id);
      io.to(code).emit('room:updated', { players: room.players });
    } else {
      // Mid-game: mark as disconnected so they don't block phase progression
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.connected = false;
        handleGameEvent(io, room, 'PLAYER_DISCONNECTED', { socketId: socket.id });
      }
    }
    console.log('disconnected:', socket.id);
  });
});

function findRoomCodeByHost(socketId) {
  const { rooms } = require('./roomManager');
  for (const [code, room] of rooms) {
    if (room.hostSocketId === socketId) return code;
  }
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    state: room.state,
    players: room.players,
    settings: room.settings,
  };
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
