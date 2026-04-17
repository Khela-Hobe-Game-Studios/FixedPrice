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

// Read session once at module load so lazy initialisers all see the same snapshot
const _session = loadSession();

export default function App() {
  // Initialise state directly from localStorage so the right screen shows immediately on refresh
  const [screen, setScreen] = useState(() => {
    if (_session?.role === 'host') return 'host-lobby';
    if (_session?.role === 'player') return 'player-lobby';
    return 'landing';
  });
  const [room, setRoom] = useState(() =>
    _session?.code ? { code: _session.code, players: [], settings: _session.settings || {} } : null
  );
  const [me, setMe] = useState(() =>
    _session?.role === 'player' ? { id: null, name: _session.name } : null
  );
  const [final, setFinal] = useState(null);
  const [roundData, setRoundData] = useState(null);
  const [initialPhase, setInitialPhase] = useState('question');
  const [initialBetting, setInitialBetting] = useState(null);
  const [initialReveal, setInitialReveal] = useState(null);
  const [initialScoreboard, setInitialScoreboard] = useState(null);

  useEffect(() => {
    socket.connect();

    // If there's a saved session, rejoin once the socket is connected
    if (_session) {
      socket.once('connect', () => {
        if (_session.role === 'host') {
          socket.emit('host:rejoin', { code: _session.code });
        } else if (_session.role === 'player') {
          // Update me.id now that we have a socket id
          setMe({ id: socket.id, name: _session.name });
          socket.emit('player:rejoin', { code: _session.code, name: _session.name });
        }
      });
    }

    socket.on('room:created', ({ code }) => {
      setRoom(r => ({ ...r, code, players: [] }));
      setScreen('host-lobby');
    });

    socket.on('player:joined', ({ room }) => {
      setRoom(room);
      setScreen(s => ['landing', 'player-lobby'].includes(s) ? 'player-lobby' : s);
    });

    socket.on('room:updated', ({ players }) => {
      setRoom(r => r ? { ...r, players } : r);
    });

    socket.on('round:start', (data) => {
      setRoundData(data);
      setInitialPhase('question');
      setInitialBetting(null);
      setInitialReveal(null);
      setInitialScoreboard(null);
      setScreen(s => ['host-lobby', 'host-game'].includes(s) ? 'host-game' : 'player-game');
    });

    // These also fire on rejoin when PlayerGame/HostGame isn't mounted yet —
    // handle them here so the screen transitions and initial state is set.
    socket.on('round:betting', (data) => {
      setInitialBetting(data);
      setInitialPhase('betting');
      setScreen(s => {
        if (s === 'host-lobby') return 'host-game';
        if (s === 'player-lobby' || s === 'landing') return 'player-game';
        return s;
      });
    });

    socket.on('round:reveal', (data) => {
      setInitialReveal(data);
      setInitialPhase('reveal');
      setScreen(s => {
        if (s === 'host-lobby') return 'host-game';
        if (s === 'player-lobby' || s === 'landing') return 'player-game';
        return s;
      });
    });

    socket.on('round:scoreboard', (data) => {
      setInitialScoreboard(data);
      setInitialPhase('scoreboard');
      setScreen(s => {
        if (s === 'host-lobby') return 'host-game';
        if (s === 'player-lobby' || s === 'landing') return 'player-game';
        return s;
      });
    });

    socket.on('game:over', ({ final }) => {
      setFinal(final);
      setScreen('game-over');
      clearSession();
    });

    socket.on('error', ({ message }) => {
      // Rejoin failed (server restarted and lost state) — clear stale session and go home
      if (message === 'Room not found' || message === 'Player not found in room') {
        clearSession();
        setScreen('landing');
      } else {
        alert(message);
      }
    });

    return () => socket.disconnect();
  }, []);

  // Persist session whenever relevant state changes
  useEffect(() => {
    if (!room?.code) return;
    if (['host-lobby', 'host-game'].includes(screen)) {
      saveSession({ role: 'host', code: room.code, settings: room.settings });
    } else if (['player-lobby', 'player-game'].includes(screen) && me?.name) {
      saveSession({ role: 'player', code: room.code, name: me.name });
    }
  }, [screen, room?.code, me?.name]);

  const props = { room, setRoom, me, setMe, setScreen };

  if (screen === 'landing')       return <Landing {...props} />;
  if (screen === 'host-lobby')    return <HostLobby {...props} />;
  if (screen === 'player-lobby')  return <PlayerLobby {...props} />;
  if (screen === 'host-game')     return <HostGame {...props} initialRound={roundData} initialPhase={initialPhase} initialBetting={initialBetting} initialReveal={initialReveal} initialScoreboard={initialScoreboard} />;
  if (screen === 'player-game')   return <PlayerGame {...props} initialRound={roundData} initialPhase={initialPhase} initialBetting={initialBetting} initialReveal={initialReveal} initialScoreboard={initialScoreboard} />;
  if (screen === 'game-over')     return <GameOver final={final} setScreen={setScreen} />;
}
