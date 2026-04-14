import { useState, useEffect } from 'react';
import socket from './socket';
import Landing from './views/Landing';
import HostLobby from './views/HostLobby';
import PlayerLobby from './views/PlayerLobby';
import HostGame from './views/HostGame';
import PlayerGame from './views/PlayerGame';
import GameOver from './views/GameOver';

export default function App() {
  const [screen, setScreen] = useState('landing'); // landing | host-lobby | player-lobby | host-game | player-game | game-over
  const [room, setRoom] = useState(null);   // { code, players, settings }
  const [me, setMe] = useState(null);       // { id, name } for players
  const [final, setFinal] = useState(null); // end-of-game scoreboard

  useEffect(() => {
    socket.connect();

    socket.on('room:created', ({ code }) => {
      setRoom(r => ({ ...r, code, players: [] }));
      setScreen('host-lobby');
    });

    socket.on('player:joined', ({ room }) => {
      setRoom(room);
      setScreen('player-lobby');
    });

    socket.on('room:updated', ({ players }) => {
      setRoom(r => r ? { ...r, players } : r);
    });

    socket.on('round:start', () => setScreen(s => s === 'host-lobby' ? 'host-game' : 'player-game'));

    socket.on('game:over', ({ final }) => {
      setFinal(final);
      setScreen('game-over');
    });

    socket.on('error', ({ message }) => alert(message));

    return () => socket.disconnect();
  }, []);

  const props = { room, setRoom, me, setMe, setScreen };

  if (screen === 'landing')       return <Landing {...props} />;
  if (screen === 'host-lobby')    return <HostLobby {...props} />;
  if (screen === 'player-lobby')  return <PlayerLobby {...props} />;
  if (screen === 'host-game')     return <HostGame {...props} />;
  if (screen === 'player-game')   return <PlayerGame {...props} />;
  if (screen === 'game-over')     return <GameOver final={final} setScreen={setScreen} />;
}
