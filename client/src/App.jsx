import { useState, useEffect } from 'react';
import socket from './socket';
import Landing from './views/Landing';
import HostLobby from './views/HostLobby';
import PlayerLobby from './views/PlayerLobby';
import HostGame from './views/HostGame';
import PlayerGame from './views/PlayerGame';
import GameOver from './views/GameOver';

const SESSION_KEY = 'ek_daam_session';

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [room, setRoom] = useState(null);
  const [me, setMe] = useState(null);
  const [final, setFinal] = useState(null);
  const [roundData, setRoundData] = useState(null); // captured from round:start, passed to game views

  useEffect(() => {
    socket.connect();

    socket.on('room:created', ({ code }) => {
      setRoom(r => ({ ...r, code, players: [] }));
      setScreen('host-lobby');
    });

    socket.on('player:joined', ({ room }) => {
      setRoom(room);
      // Only transition to lobby if we're not already in-game (handles rejoin sync)
      setScreen(s => s === 'landing' || s === 'player-lobby' ? 'player-lobby' : s);
    });

    socket.on('room:updated', ({ players }) => {
      setRoom(r => r ? { ...r, players } : r);
    });

    // Capture round data here so game views get it even on first mount
    socket.on('round:start', (data) => {
      setRoundData(data);
      setScreen(s => s === 'host-lobby' || s === 'host-game' ? 'host-game' : 'player-game');
    });

    socket.on('round:reveal', () => {
      setScreen(s => s === 'host-game' ? 'host-game' : 'player-game');
    });

    socket.on('round:scoreboard', () => {
      setScreen(s => s === 'host-game' ? 'host-game' : 'player-game');
    });

    socket.on('game:over', ({ final }) => {
      setFinal(final);
      setScreen('game-over');
      clearSession();
    });

    socket.on('error', ({ message }) => alert(message));

    // Attempt to restore session on connect
    socket.on('connect', () => {
      const session = loadSession();
      if (!session) return;

      if (session.role === 'host') {
        setRoom({ code: session.code, players: [], settings: session.settings });
        setScreen('host-lobby');
        socket.emit('host:rejoin', { code: session.code });
      } else if (session.role === 'player') {
        setMe({ id: socket.id, name: session.name });
        setRoom({ code: session.code, players: [], settings: {} });
        setScreen('player-lobby');
        socket.emit('player:rejoin', { code: session.code, name: session.name });
      }
    });

    return () => socket.disconnect();
  }, []);

  // Persist session whenever room/me changes
  useEffect(() => {
    if (!room?.code) return;
    if (screen === 'host-lobby' || screen === 'host-game') {
      saveSession({ role: 'host', code: room.code, settings: room.settings });
    } else if ((screen === 'player-lobby' || screen === 'player-game') && me?.name) {
      saveSession({ role: 'player', code: room.code, name: me.name });
    }
  }, [screen, room?.code, me?.name]);

  const props = { room, setRoom, me, setMe, setScreen };

  if (screen === 'landing')       return <Landing {...props} />;
  if (screen === 'host-lobby')    return <HostLobby {...props} />;
  if (screen === 'player-lobby')  return <PlayerLobby {...props} />;
  if (screen === 'host-game')     return <HostGame {...props} initialRound={roundData} />;
  if (screen === 'player-game')   return <PlayerGame {...props} initialRound={roundData} />;
  if (screen === 'game-over')     return <GameOver final={final} setScreen={setScreen} />;
}
