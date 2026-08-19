import { useCallback, useEffect, useState } from 'react';
import socket from './socket';
import { JOIN_CODE } from './session';
import { useToasts } from './hooks/useToasts';
import useMediaQuery, { BOARD_WIDTH, PORTRAIT_PHONE } from './hooks/useMediaQuery';
import useGameSocket, { PLAYER_ID } from './game/useGameSocket';
import { useBoardSettings } from './game/settings';
import useCues from './game/useCues';
import { setMusic, setMusicEnabled, armMusic, duckMusic, stopAllMusic } from './game/music';
import { buzz } from './game/haptics';
import { Toasts } from './board';

import HostLanding from './views/host/HostLanding';
import HostSettings from './views/host/HostSettings';
import HostLobby from './views/host/HostLobby';
import HostIntro from './views/host/HostIntro';
import HostFinale from './views/host/HostFinale';
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
  PlayerBetween, PlayerReconnecting, PlayerRoomError, PlayerGameOver, PlayerSpectating,
} from './views/player/PlayerStatus';

/* Which playlist each host screen is standing in. The whole pre-game — the
 * landing, the settings, the lobby filling up — is one stretch of the night and
 * gets one track: cutting the music between Create Room and the lobby would be
 * the board changing its mind in front of everybody. `game/tracks.js` says what
 * each of these sounds like. */
const MUSIC_BY_SCREEN = {
  landing: 'startup',
  'host-settings': 'startup',
  'host-lobby': 'startup',
  game: 'game',
  'game-over': 'celebration',
};

export default function App() {
  const { toasts, notify, dismiss } = useToasts();
  const { state, dispatch, forget } = useGameSocket({ notify, dismiss });
  const {
    role, screen, room, me, phase, timing, intro, round, answerCount, betting,
    betCount, reveal, scoreboard, final, finale, mySubmission, myBet, betPlaced, connState, paused, pending,
  } = state;

  /* Which side of the game this device is.
   *
   * Following a join link is unambiguous: you are a player. Otherwise guess from the
   * screen — the board runs on a TV or a laptop, players arrive on phones — and let
   * either side switch, because the guess is only ever a default.
   *
   * The guess follows the viewport until somebody overrules it. It used to be sampled
   * once into a useState initialiser, so a window dragged down to phone width, or a
   * tablet turned on its side, kept whichever answer was true when the tab opened —
   * which on a narrow window is the 1280x720 board at 0.30 scale.
   *
   * `chose` is tri-state on purpose: null means nobody has said, so keep following
   * the viewport. Once it is a boolean the override sticks, and resizing does not
   * un-pick a side for you. */
  const boardSized = useMediaQuery(BOARD_WIDTH);
  const portraitPhone = useMediaQuery(PORTRAIT_PHONE);
  const [chose, setChose] = useState(null);
  const asHost = chose ?? (!JOIN_CODE && boardSized);

  /* "Phones are always night" is a claim about the device, not about the role: a
   * phone is held close and glanced at, and the dark board is the more legible of the
   * two at arm's length. So the host's phone landing counts too — keyed off the role
   * alone, a host on a phone got the day palette on a phone-shaped screen between 8
   * and 5. A host in landscape is running the actual board and keeps day mode. */
  const isPhone = role === 'player' || portraitPhone;
  const [board, setBoard] = useBoardSettings({ isPhone });

  const [code, setCode] = useState(JOIN_CODE ?? '');
  const [name, setName] = useState('');
  const [showPause, setShowPause] = useState(false);

  const go = useCallback((next) => dispatch({ type: 'screen', payload: next }), [dispatch]);

  /* Music. Host device only — fifteen phones must not fight the TV — and gated on
   * the same SOUND toggle as the cues. `role !== 'player'` rather than
   * `role === 'host'` because the landing and the settings both run before a room
   * exists, and those are the screens the startup track is for.
   *
   * The engine is a module singleton (game/music.js): it is handed a playlist name
   * and owns the crossfade, the random pick, and every way a track can fail to
   * arrive. Nothing here restarts on a render. */
  const musicOn = asHost && board.sound;
  const musicPhase = musicOn && role !== 'player' ? MUSIC_BY_SCREEN[screen] ?? null : null;

  useEffect(() => { setMusicEnabled(musicOn); }, [musicOn]);
  useEffect(() => { setMusic(musicPhase); }, [musicPhase]);
  useEffect(() => () => stopAllMusic(), []);

  /* Autoplay needs a gesture, and these listeners stay up for the whole session
   * rather than firing once: a browser that refuses a `play()` mid-game (Safari
   * after an interruption) is recoverable only on the next click.
   *
   * Deliberately ungated. Gating on `musicOn` lost the one gesture that matters
   * most: on a window under 900px the app opens on the player side with `musicOn`
   * false and no listener, and the click on RUNNING THE BOARD INSTEAD is what makes
   * it true — so the effect attached the listener one render *after* the click that
   * should have armed it, and the board arrived silent until something else was
   * clicked. `armMusic` is a boolean latch when the engine is disabled, so arming
   * from a phone costs nothing and is discarded with the rest of the module.
   *
   * The cue engine keeps its own gate on purpose: `unlockAudio()` constructs an
   * AudioContext, which is not free on a phone that will never play a cue, and no
   * cue is due for many clicks after the switch. Music is due immediately. */
  useEffect(() => {
    window.addEventListener('pointerdown', armMusic);
    window.addEventListener('keydown', armMusic);
    return () => {
      window.removeEventListener('pointerdown', armMusic);
      window.removeEventListener('keydown', armMusic);
    };
  }, []);

  /* The twelve cues. Host device only, gated on the same SOUND toggle as the music
   * — but deliberately NOT on MOTION: REDUCED, which is a separate accessibility
   * axis. Somebody who kills the strobe still wants to hear the klaxon. */
  useCues({ enabled: musicOn, state, duck: duckMusic });

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

  // The phone's confirmation is the motor, not a speaker — see game/haptics.js.
  const submitAnswer = (value) => {
    buzz('lock');
    dispatch({ type: 'answered', payload: value });
    socket.emit('player:submit_answer', { answer: value });
  };

  const placeBet = () => {
    if (!myBet || betPlaced) return;
    buzz('bet');
    // Mark it here, the same way submitAnswer does. Emitting and saying nothing
    // left the phone showing a live PLACE BET over a bet the server had already
    // taken, which reads as the button being broken.
    dispatch({ type: 'placed' });
    socket.emit('player:submit_bet', { targetId: myBet });
  };

  // ── host ───────────────────────────────────────────────────────────────────

  if (role === 'host' || screen === 'host-settings' || (role === null && asHost)) {
    let view = null;

    if (screen === 'landing') {
      view = (
        <HostLanding
          onStart={() => go('host-settings')}
          onJoinInstead={() => setChose(false)}
          pending={pending}
          phone={portraitPhone}
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
          /* The rotate guard's way out, offered only while there is nothing to
             abandon. Once a room is open this device is running a live game. */
          onLeaveBoard={room?.code ? undefined : () => { setChose(false); go('landing'); }}
        />
      );
    } else if (screen === 'host-lobby') {
      view = (
        <HostLobby
          room={room}
          onSettings={() => go('host-settings')}
          onStart={() => socket.emit('host:start_game')}
        />
      );
    } else if (screen === 'game-over') {
      view = (
        <HostGameOver
          final={final}
          onPlayAgain={() => socket.emit('host:play_again')}
        />
      );
    } else if (phase === 'finale') {
      view = <HostFinale finale={finale} />;
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

  const wasEliminated = !!room?.players?.find((p) => p.id === me?.id)?.eliminated;
  // Only during sudden death: outside it nobody is eliminated, and a normal round
  // must never hide the controls.
  const amSpectating = wasEliminated && (!!round?.finale || phase === 'finale');

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
        onHostInstead={() => setChose(true)}
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
  } else if (amSpectating) {
    view = (
      <PlayerSpectating
        me={me}
        finale={round?.finale ?? finale}
        knockedOut={reveal?.knockedOut?.includes(me?.id) || wasEliminated}
      />
    );
  } else if (phase === 'finale') {
    view = <PlayerSpectating me={me} finale={{ left: finale?.total }} />;
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
        placed={betPlaced}
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
