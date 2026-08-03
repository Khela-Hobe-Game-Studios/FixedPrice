import { useState, useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { ToastStack } from '@khelahobe/kui';
import socket from './socket';
import { getPlayerId, saveSession, loadSession, clearSession, JOIN_CODE } from './session';
import { useToasts } from './hooks/useToasts';

const soundUrls = [
  'https://pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/the_scoring_bell.mp3',
  'https://pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/the_dhaka_lobby.mp3',
  'https://pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/square_wave_bazaar.mp3',
];
import Landing from './views/Landing';
import HostLobby from './views/HostLobby';
import PlayerLobby from './views/PlayerLobby';
import HostGame from './views/HostGame';
import PlayerGame from './views/PlayerGame';
import GameOver from './views/GameOver';
import EkBrandLine from './components/EkBrandLine';

// Render's free tier cold-starts in ~30s. Anything past this and we tell the
// user the server is waking rather than leaving the button silently dead.
const COLD_START_HINT_MS = 1500;
const CONNECT_TIMEOUT_MS = 45000;

// Following a join link means "put me in THIS game" — it must beat a restored
// session, or someone who hosted earlier lands back in their own dead lobby
// instead of joining their friend's room.
if (JOIN_CODE) clearSession();
const _session = JOIN_CODE ? null : loadSession();
const PLAYER_ID = getPlayerId();

export default function App() {
  const [screen, setScreen] = useState(() => {
    if (_session?.role === 'host') return 'host-lobby';
    if (_session?.role === 'player') return 'player-lobby';
    return 'landing';
  });
  const [room, setRoom] = useState(() =>
    _session?.code ? { code: _session.code, players: [], settings: _session.settings || {} } : null
  );
  const [me, setMe] = useState(() =>
    _session?.role === 'player' ? { id: PLAYER_ID, name: _session.name } : null
  );
  const [final, setFinal] = useState(null);
  const [roundData, setRoundData] = useState(null);
  const [initialPhase, setInitialPhase] = useState('question');
  const [initialBetting, setInitialBetting] = useState(null);
  const [initialReveal, setInitialReveal] = useState(null);
  const [initialScoreboard, setInitialScoreboard] = useState(null);
  const [connState, setConnState] = useState('connecting'); // connecting | online | reconnecting
  const [pending, setPending] = useState(null);             // 'create' | 'join' | null
  const [paused, setPaused] = useState(false);

  const bgMusic = useRef(null);
  const { toasts, notify, dismiss } = useToasts();

  // The connect handler must read the CURRENT session, not a module-load
  // snapshot — a player who joins fresh has no session at mount time.
  const sessionRef = useRef(_session);

  const persist = useCallback((data) => {
    sessionRef.current = data;
    saveSession(data);
  }, []);

  const forget = useCallback(() => {
    sessionRef.current = null;
    clearSession();
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnState('online');
      dismiss('conn');

      // Re-announce ourselves on EVERY connect. socket.io reconnects on its own
      // after a phone locks or switches apps; without this the new socket is not
      // in the room and the player silently stops receiving the game.
      const s = sessionRef.current;
      if (!s?.code) return;
      if (s.role === 'host') {
        socket.emit('host:rejoin', { code: s.code });
      } else if (s.role === 'player') {
        socket.emit('player:rejoin', { code: s.code, pid: PLAYER_ID, name: s.name });
      }
    };

    const onDisconnect = (reason) => {
      if (reason === 'io client disconnect') return; // deliberate teardown
      setConnState('reconnecting');
      notify('Connection lost — reconnecting…', { type: 'danger', emoji: '📡', ttl: 0, key: 'conn' });
    };

    const onConnectError = () => setConnState('reconnecting');

    const onRoomCreated = ({ code }) => {
      setPending(null);
      setRoom(r => ({ ...r, code, players: r?.players ?? [] }));
      setScreen(s => (s === 'landing' ? 'host-lobby' : s));
    };

    const onPlayerJoined = ({ room: joinedRoom, you }) => {
      setPending(null);
      setRoom(joinedRoom);
      if (you) setMe({ id: you.id, name: you.name });
      setScreen(s => (['landing', 'player-lobby'].includes(s) ? 'player-lobby' : s));
    };

    const onRoomUpdated = ({ players }) => setRoom(r => (r ? { ...r, players } : r));

    const onRoundStart = (data) => {
      setRoundData(data);
      setInitialPhase(data.alreadySubmitted ? 'locked' : 'question');
      setInitialBetting(null);
      setInitialReveal(null);
      setInitialScoreboard(null);
      setScreen(s => (['host-lobby', 'host-game'].includes(s) ? 'host-game' : 'player-game'));
    };

    // These also arrive on rejoin before HostGame/PlayerGame is mounted, so the
    // screen switch and seed state have to happen here.
    const toGameScreen = (s) => {
      if (s === 'host-lobby') return 'host-game';
      if (s === 'player-lobby' || s === 'landing') return 'player-game';
      return s;
    };
    const onBetting = (data) => {
      setInitialBetting(data);
      setInitialPhase(data.alreadySubmitted ? 'locked' : 'betting');
      setScreen(toGameScreen);
    };
    const onReveal = (data) => {
      setInitialReveal(data);
      setInitialPhase('reveal');
      setScreen(toGameScreen);
    };
    const onScoreboard = (data) => {
      setInitialScoreboard(data);
      setInitialPhase('scoreboard');
      setScreen(toGameScreen);
    };

    const onGameOver = ({ final: results }) => {
      setFinal(results);
      setScreen('game-over');
      setPaused(false);
    };

    // Rematch keeps the same code and roster — everyone lands back in the lobby.
    const onRoomReset = ({ players }) => {
      setFinal(null);
      setRoundData(null);
      setInitialBetting(null);
      setInitialReveal(null);
      setInitialScoreboard(null);
      setInitialPhase('question');
      setPaused(false);
      setRoom(r => (r ? { ...r, players } : r));
      setScreen(s => (s === 'host-game' || s === 'host-lobby' ? 'host-lobby' : 'player-lobby'));
    };

    const onPaused = () => {
      setPaused(true);
      notify('Host disconnected — game paused', { type: 'danger', emoji: '⏸️', ttl: 0, key: 'paused' });
    };
    const onResumed = () => {
      setPaused(false);
      dismiss('paused');
      notify('Host is back — resuming', { type: 'success', emoji: '▶️' });
    };

    const onError = ({ message }) => {
      setPending(null);
      // Server restarted and lost in-memory state — drop the stale session.
      if (message === 'Room not found' || message === 'Player not found in room') {
        forget();
        setScreen('landing');
        setRoom(null);
        notify(message, { type: 'danger', emoji: '⚠️' });
      } else {
        notify(message, { type: 'danger', emoji: '⚠️' });
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:created', onRoomCreated);
    socket.on('player:joined', onPlayerJoined);
    socket.on('room:updated', onRoomUpdated);
    socket.on('room:reset', onRoomReset);
    socket.on('round:start', onRoundStart);
    socket.on('round:betting', onBetting);
    socket.on('round:reveal', onReveal);
    socket.on('round:scoreboard', onScoreboard);
    socket.on('game:over', onGameOver);
    socket.on('game:paused', onPaused);
    socket.on('game:resumed', onResumed);
    socket.on('error', onError);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:created', onRoomCreated);
      socket.off('player:joined', onPlayerJoined);
      socket.off('room:updated', onRoomUpdated);
      socket.off('room:reset', onRoomReset);
      socket.off('round:start', onRoundStart);
      socket.off('round:betting', onBetting);
      socket.off('round:reveal', onReveal);
      socket.off('round:scoreboard', onScoreboard);
      socket.off('game:over', onGameOver);
      socket.off('game:paused', onPaused);
      socket.off('game:resumed', onResumed);
      socket.off('error', onError);
      socket.disconnect();
    };
  }, [notify, dismiss, forget]);

  // Cold-start feedback: the button used to do nothing at all for ~30s.
  useEffect(() => {
    if (!pending) return;
    const hint = setTimeout(() => {
      if (!socket.connected) {
        notify('Waking up the server — this can take up to 30s…', {
          type: 'info', emoji: '☕', ttl: 0, key: 'cold',
        });
      }
    }, COLD_START_HINT_MS);
    const fail = setTimeout(() => {
      dismiss('cold');
      setPending(null);
      notify("Couldn't reach the server. Check your connection and try again.", {
        type: 'danger', emoji: '⚠️', ttl: 6000,
      });
    }, CONNECT_TIMEOUT_MS);
    return () => { clearTimeout(hint); clearTimeout(fail); };
  }, [pending, notify, dismiss]);

  useEffect(() => { if (!pending) dismiss('cold'); }, [pending, dismiss]);

  function primeMusic() {
    if (room?.settings?.backgroundMusic === false) return;
    const url = soundUrls[Math.floor(Math.random() * soundUrls.length)];
    bgMusic.current = new Howl({ src: [url], loop: true, volume: 0.4, html5: true });
    bgMusic.current.play();
  }

  useEffect(() => {
    const isInGame = screen === 'host-game' && room?.settings?.backgroundMusic !== false;
    if (isInGame) {
      bgMusic.current?.play();
    } else {
      bgMusic.current?.unload();
      bgMusic.current = null;
    }
  }, [screen, room?.settings?.backgroundMusic]);

  // Persist session so a refresh (or a reconnect) can re-announce us.
  useEffect(() => {
    if (!room?.code) return;
    if (['host-lobby', 'host-game'].includes(screen)) {
      persist({ role: 'host', code: room.code, settings: room.settings });
    } else if (['player-lobby', 'player-game'].includes(screen) && me?.name) {
      persist({ role: 'player', code: room.code, name: me.name });
    }
  }, [screen, room?.code, room?.settings, me?.name, persist]);

  const props = { room, setRoom, me, setMe, setScreen, connState, paused, notify };

  let view = null;
  if (screen === 'landing')            view = <Landing {...props} pending={pending} setPending={setPending} />;
  else if (screen === 'host-lobby')    view = <HostLobby {...props} onStartGame={primeMusic} />;
  else if (screen === 'player-lobby')  view = <PlayerLobby {...props} />;
  else if (screen === 'host-game')     view = <HostGame {...props} initialRound={roundData} initialPhase={initialPhase} initialBetting={initialBetting} initialReveal={initialReveal} initialScoreboard={initialScoreboard} />;
  else if (screen === 'player-game')   view = <PlayerGame {...props} initialRound={roundData} initialPhase={initialPhase} initialBetting={initialBetting} initialReveal={initialReveal} initialScoreboard={initialScoreboard} />;
  else if (screen === 'game-over')     view = <GameOver final={final} setScreen={setScreen} onForget={forget} room={room} me={me} />;

  return (
    <>
      {view}
      <EkBrandLine />
      <ToastStack toasts={toasts} />
    </>
  );
}
