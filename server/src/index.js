const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createRoom, getRoom, removePlayer, addPlayer } = require('./roomManager');
const { handleGameEvent } = require('./gameManager');

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

  socket.on('host:start_game', () => {
    const room = getRoom(socket.data?.roomCode || findRoomByHost(socket.id));
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
    removePlayer(room, socket.id);
    io.to(code).emit('room:updated', { players: room.players });
    console.log('disconnected:', socket.id);
  });
});

function findRoomByHost(socketId) {
  // Used as fallback if roomCode not set on host socket
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
