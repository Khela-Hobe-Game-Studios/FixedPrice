import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';
import socket from './socket';
import { JOIN_CODE } from './session';
import { useToasts } from './hooks/useToasts';
import useGameSocket, { PLAYER_ID } from './game/useGameSocket';
import { useBoardSettings } from './game/settings';
import { Toasts } from './board';

import HostLanding from './views/host/HostLanding';
import HostSettings from './views/host/HostSettings';
import HostLobby from './views/host/HostLobby';
import HostIntro from './views/host/HostIntro';
import HostQuestion from './views/host/HostQuestion';
import HostBetting from './views/host/HostBetting';
import HostReveal from './views/host/HostReveal';
import HostScoreboard from './views/host/HostScoreboard';
import HostGameOver from './views/host/HostGameOver';
import HostPause from './views/host/HostPause';

import PlayerJoin from './views/player/PlayerJoin';
import PlayerAvatar from './views/player/PlayerAvatar';
import PlayerLobby from './views/player/PlayerLobby';
import PlayerQuestion from './views/player/PlayerQuestion';
import PlayerLocked from './views/player/PlayerLocked';
import PlayerBetting from './views/player/PlayerBetting';
import PlayerReveal from './views/player/PlayerReveal';
import PlayerScoreboard from './views/player/PlayerScoreboard';
import {
  PlayerBetween, PlayerReconnecting, PlayerRoomError, PlayerGameOver,
} from './views/player/PlayerStatus';

const soundUrls = [
  'https://pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/the_scoring_bell.mp3',
  'https://pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/the_dhaka_lobby.mp3',
  'https://pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/square_wave_bazaar.mp3',
];

export default function App() {
  const { toasts, notify, dismiss } = useToasts();
  const { state, dispatch, forget } = useGameSocket({ notify, dismiss });
  const {
    role, screen, room, me, phase, timing, intro, round, answerCount, betting,
    betCount, reveal, scoreboard, final, mySubmission, myBet, connState, paused, pending,
  } = state;

  const isPhone = role === 'player';
  const [board, setBoard] = useBoardSettings({ isPhone });

  const [code, setCode] = useState(JOIN_CODE ?? '');
  const [name, setName] = useState('');
  const [showPause, setShowPause] = useState(false);
  const bgMusic = useRef(null);

  /* Which side of the game this device is.
   *
   * Following a join link is unambiguous: you are a player. Otherwise guess from the
   * screen — the board runs on a TV or a laptop, players arrive on phones — and let
   * either side switch, because the guess is only ever a default. */
  const [asHost, setAsHost] = useState(() => !JOIN_CODE && window.innerWidth >= 900);

  const go = useCallback((next) => dispatch({ type: 'screen', payload: next }), [dispatch]);

  // Autoplay needs a user gesture, so the track is primed on the host's own click.
  const primeMusic = useCallback(() => {
    if (!board.sound || bgMusic.current) return;
    const url = soundUrls[Math.floor(Math.random() * soundUrls.length)];
    bgMusic.current = new Howl({ src: [url], loop: true, volume: 0.35, html5: true });
    bgMusic.current.play();
  }, [board.sound]);

  // Music belongs to the host device and only while a game is running. Unloading it
  // between games means the next one opens on a different track.
  useEffect(() => {
    const playing = role === 'host' && screen === 'game' && board.sound;
    if (playing) bgMusic.current?.play();
    else {
      bgMusic.current?.unload();
      bgMusic.current = null;
    }
  }, [role, screen, board.sound]);

  // Esc is the host's way out of a game that has to end early.
  useEffect(() => {
    if (role !== 'host') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowPause((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role]);

  const createRoom = (settings) => {
    dispatch({ type: 'pending', payload: 'create' });
    socket.emit('host:create_room', settings);
  };

  const join = () => {
    dispatch({ type: 'pending', payload: 'join' });
    socket.emit('player:join', { code, name, pid: PLAYER_ID });
  };

  const submitAnswer = (value) => {
    dispatch({ type: 'answered', payload: value });
    socket.emit('player:submit_answer', { answer: value });
  };

  const placeBet = () => {
    if (myBet) socket.emit('player:submit_bet', { targetId: myBet });
  };

  // ── host ───────────────────────────────────────────────────────────────────

  if (role === 'host' || screen === 'host-settings' || (role === null && asHost)) {
    let view = null;

    if (screen === 'landing') {
      view = (
        <HostLanding
          onStart={() => go('host-settings')}
          onJoinInstead={() => setAsHost(false)}
          pending={pending}
        />
      );
    } else if (screen === 'host-settings') {
      view = (
        <HostSettings
          settings={room?.settings}
          board={board}
          onBoard={setBoard}
          started={!!room?.code}
          onSave={(next) => {
            if (room?.code) {
              socket.emit('host:update_settings', next);
              go('host-lobby');
            } else {
              createRoom(next);
            }
          }}
          onClose={() => go(room?.code ? 'host-lobby' : 'landing')}
        />
      );
    } else if (screen === 'host-lobby') {
      view = (
        <HostLobby
          room={room}
          onSettings={() => go('host-settings')}
          onStart={() => {
            primeMusic();
            socket.emit('host:start_game');
          }}
        />
      );
    } else if (screen === 'game-over') {
      view = (
        <HostGameOver
          final={final}
          onPlayAgain={() => socket.emit('host:play_again')}
          onStandings={() => setShowPause(true)}
        />
      );
    } else if (phase === 'intro') {
      view = <HostIntro intro={intro} timing={timing} />;
    } else if (phase === 'betting') {
      view = <HostBetting betting={betting} round={round} timing={timing} betCount={betCount} />;
    } else if (phase === 'reveal') {
      view = <HostReveal reveal={reveal} round={round} />;
    } else if (phase === 'scoreboard') {
      view = <HostScoreboard scoreboard={scoreboard} />;
    } else {
      view = (
        <HostQuestion
          round={round}
          timing={timing}
          answerCount={answerCount}
          players={room?.players}
        />
      );
    }

    return (
      <>
        {view}
        {(showPause || paused) && (
          <HostPause
            paused={paused}
            round={round}
            onResume={() => setShowPause(false)}
            onSettings={() => { setShowPause(false); go('host-settings'); }}
            onEnd={() => { setShowPause(false); socket.emit('host:end_game'); }}
          />
        )}
        <Toasts toasts={toasts} />
      </>
    );
  }

  // ── player ─────────────────────────────────────────────────────────────────

  let view = null;

  if (connState === 'reconnecting' && room?.code) {
    view = (
      <PlayerReconnecting
        me={me}
        score={room?.players?.find((p) => p.id === me?.id)?.score}
        seatHoldUntil={room?.players?.find((p) => p.id === me?.id)?.seatHoldUntil}
        onLeave={forget}
      />
    );
  } else if (screen === 'landing' || screen === 'player-join') {
    view = (
      <PlayerJoin
        code={code}
        setCode={setCode}
        name={name}
        setName={setName}
        onJoin={join}
        onHostInstead={() => setAsHost(true)}
        pending={pending === 'join'}
      />
    );
  } else if (screen === 'player-avatar') {
    view = (
      <PlayerAvatar
        me={me}
        onSet={(avatar) => socket.emit('player:set_avatar', avatar)}
        onDone={() => go('player-lobby')}
      />
    );
  } else if (screen === 'player-lobby') {
    view = <PlayerLobby me={me} room={room} onEditAvatar={() => go('player-avatar')} />;
  } else if (screen === 'game-over') {
    view = <PlayerGameOver me={me} final={final} onLeave={forget} />;
  } else if (phase === 'intro' || phase === 'scoreboard') {
    view =
      phase === 'scoreboard' ? (
        <PlayerScoreboard scoreboard={scoreboard} me={me} timing={timing} />
      ) : (
        <PlayerBetween me={me} scoreboard={scoreboard} intro={intro} timing={timing} />
      );
  } else if (phase === 'betting') {
    view = (
      <PlayerBetting
        betting={betting}
        timing={timing}
        me={me}
        myBet={myBet}
        onBet={(id) => dispatch({ type: 'bet', payload: id })}
        onPlace={placeBet}
      />
    );
  } else if (phase === 'reveal') {
    view = <PlayerReveal reveal={reveal} round={round} me={me} />;
  } else if (phase === 'question') {
    view = mySubmission != null ? (
      <PlayerLocked
        round={round}
        guess={typeof mySubmission === 'number' ? mySubmission : null}
        answerCount={answerCount}
        onChange={() => dispatch({ type: 'answered', payload: null })}
      />
    ) : (
      <PlayerQuestion
        round={round}
        timing={timing}
        answerCount={answerCount}
        onSubmit={submitAnswer}
      />
    );
  } else {
    view = <PlayerRoomError code={code} onRetry={forget} />;
  }

  return (
    <>
      {view}
      <Toasts toasts={toasts} />
    </>
  );
}
