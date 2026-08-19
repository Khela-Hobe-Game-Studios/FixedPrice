import { useEffect, useReducer, useRef, useCallback } from 'react';
import socket from '../socket';
import { getPlayerId, saveSession, loadSession, clearSession, JOIN_CODE } from '../session';
import { syncClock } from './clock';

/**
 * The whole game, in one reducer.
 *
 * Round events used to be handled twice — once in App (because they arrive on a
 * rejoin before the game view is mounted) and once inside the view (for live
 * updates) — with each view then re-deriving ranks, ties and its own timers. One
 * store, fed by the socket, read by screens that are pure functions of it.
 *
 * Following a join link means "put me in THIS game": it must beat a restored
 * session, or someone who hosted earlier lands back in their own dead lobby
 * instead of joining their friend's room.
 */

if (JOIN_CODE) clearSession();
const RESTORED = JOIN_CODE ? null : loadSession();
export const PLAYER_ID = getPlayerId();

// Render's free tier cold-starts in ~30s. Anything past this and we say the server
// is waking rather than leaving the button silently dead.
const COLD_START_HINT_MS = 1500;
const CONNECT_TIMEOUT_MS = 45000;

const initialState = {
  role: RESTORED?.role ?? null,               // 'host' | 'player'
  screen: RESTORED?.role === 'host' ? 'host-lobby'
    : RESTORED?.role === 'player' ? 'player-lobby'
    : 'landing',
  room: RESTORED?.code
    ? { code: RESTORED.code, players: [], settings: RESTORED.settings ?? {} }
    : null,
  me: RESTORED?.role === 'player' ? { id: PLAYER_ID, name: RESTORED.name } : null,

  // The host's half of identity: minted by the server, held only here, presented on
  // rejoin. Without it the room code alone reclaimed host control.
  hostToken: RESTORED?.hostToken ?? null,
  // Whether THIS session was restored from storage. It used to be read straight off
  // the module-load constant inside the reducer, so a forget-then-join in the same
  // page never showed the avatar picker again.
  restored: !!RESTORED,

  phase: null,          // 'intro' | 'question' | 'betting' | 'reveal' | 'scoreboard'
  timing: null,         // { phase, serverNow, startedAt, endsAt, durationMs }
  intro: null,
  finale: null,
  round: null,
  answerCount: { count: 0, total: 0, answered: [] },
  betCount: { count: 0, total: 0 },
  betting: null,
  reveal: null,
  scoreboard: null,
  final: null,

  mySubmission: null,
  myBet: null,          // the option the phone has *selected*
  betPlaced: false,     // …and whether it has been sent. Never the same thing.

  connState: 'connecting', // connecting | online | reconnecting
  pending: null,           // 'create' | 'join'
  paused: false,
};

function clearRound(state) {
  return {
    ...state,
    intro: null,
    finale: null,
    betting: null,
    reveal: null,
    scoreboard: null,
    mySubmission: null,
    myBet: null,
    betPlaced: false,
    answerCount: { count: 0, total: 0, answered: [] },
    betCount: { count: 0, total: 0 },
  };
}

function reducer(state, action) {
  const { type, payload } = action;

  switch (type) {
    case 'screen':
      return { ...state, screen: payload };

    case 'pending':
      return { ...state, pending: payload };

    case 'conn':
      return { ...state, connState: payload };

    case 'room:created':
      return {
        ...state,
        pending: null,
        role: 'host',
        hostToken: payload.hostToken ?? state.hostToken,
        screen: state.screen === 'landing' || state.screen === 'host-settings' ? 'host-lobby' : state.screen,
        room: { ...state.room, code: payload.code, players: state.room?.players ?? [], settings: payload.settings ?? state.room?.settings ?? {} },
      };

    case 'player:joined':
      return {
        ...state,
        pending: null,
        role: 'player',
        room: payload.room,
        me: payload.you ? { ...state.me, ...payload.you } : state.me,
        screen: ['landing', 'player-join', 'player-lobby'].includes(state.screen)
          // A returning player skips the picker: their face is already chosen and
          // the game may well be mid-round.
          ? (payload.room?.state === 'LOBBY' && !state.restored ? 'player-avatar' : 'player-lobby')
          : state.screen,
      };

    case 'room:updated': {
      const room = state.room ? { ...state.room, players: payload.players } : state.room;
      const mine = payload.players?.find((p) => p.id === state.me?.id);
      return { ...state, room, me: mine ? { ...state.me, ...mine } : state.me };
    }

    // One player changed their face — patch that row rather than taking a whole new
    // roster (and every avatar on it) for it.
    case 'player:avatar': {
      if (!state.room?.players) return state;
      const players = state.room.players.map((p) => (
        p.id === payload.id ? { ...p, avatar: payload.avatar } : p
      ));
      return {
        ...state,
        room: { ...state.room, players },
        me: state.me?.id === payload.id ? { ...state.me, avatar: payload.avatar } : state.me,
      };
    }

    case 'room:settings':
      return { ...state, room: state.room ? { ...state.room, settings: payload.settings } : state.room };

    case 'room:reset':
      return {
        ...clearRound(state),
        phase: null,
        timing: null,
        round: null,
        final: null,
        paused: false,
        room: state.room ? { ...state.room, players: payload.players, settings: payload.settings ?? state.room.settings } : state.room,
        screen: state.role === 'host' ? 'host-lobby' : 'player-lobby',
      };

    case 'round:finale_intro':
      return { ...clearRound(state), phase: 'finale', timing: payload, finale: payload, screen: 'game' };

    case 'round:intro':
      return { ...clearRound(state), phase: 'intro', timing: payload, intro: payload, screen: 'game' };

    case 'round:start':
      return {
        ...clearRound(state),
        phase: 'question',
        timing: payload,
        round: payload,
        // A player who already answered lands on their locked-in guess, not on a
        // fresh input they could submit from twice.
        mySubmission: payload.alreadySubmitted ? payload.mySubmission ?? true : null,
        screen: 'game',
      };

    case 'round:answer_count':
      return { ...state, answerCount: payload };

    case 'round:bet_count':
      return { ...state, betCount: payload };

    case 'round:betting':
      return {
        ...state,
        phase: 'betting',
        timing: payload,
        betting: payload,
        myBet: payload.myBet ?? state.myBet,
        /* Only the sync re-emit carries `alreadySubmitted`; the fresh one has no
         * such key, so this is false at the top of every betting phase and true for
         * a phone that rejoins having already bet. Same shape as `round:start`. */
        betPlaced: !!payload.alreadySubmitted,
        screen: 'game',
      };

    case 'round:reveal':
      return { ...state, phase: 'reveal', timing: payload, reveal: payload, screen: 'game' };

    case 'round:scoreboard':
      return { ...state, phase: 'scoreboard', timing: payload, scoreboard: payload, screen: 'game' };

    case 'game:over':
      return { ...state, phase: null, timing: null, paused: false, final: payload, screen: 'game-over' };

    case 'game:paused':
      return { ...state, paused: true };

    case 'game:resumed':
      return { ...state, paused: false, timing: payload.phase ? payload : state.timing };

    case 'answered':
      return { ...state, mySubmission: payload };

    case 'bet':
      return { ...state, myBet: payload };

    case 'placed':
      return { ...state, betPlaced: true };

    case 'forget':
      // initialState is a module-load snapshot of the restored session, so every
      // field it seeded from that session has to be cleared explicitly here.
      return {
        ...initialState,
        role: null,
        screen: 'landing',
        room: null,
        me: null,
        hostToken: null,
        restored: false,
        connState: state.connState,
      };

    default:
      return state;
  }
}

export default function useGameSocket({ notify, dismiss }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // The connect handler must read the CURRENT session, not a module-load snapshot —
  // a player who joins fresh has no session at mount time.
  const sessionRef = useRef(RESTORED);

  const persist = useCallback((data) => {
    sessionRef.current = data;
    saveSession(data);
  }, []);

  const forget = useCallback(() => {
    sessionRef.current = null;
    clearSession();
    dispatch({ type: 'forget' });
  }, []);

  useEffect(() => {
    const on = (event, handler) => {
      socket.on(event, handler);
      return () => socket.off(event, handler);
    };

    const offs = [];

    offs.push(on('connect', () => {
      dispatch({ type: 'conn', payload: 'online' });
      dismiss('conn');
      syncClock(socket);

      // Re-announce on EVERY connect. socket.io reconnects on its own after a phone
      // locks or switches apps; without this the new socket is not in the room and
      // the player silently stops receiving the game.
      const s = sessionRef.current;
      if (!s?.code) return;
      if (s.role === 'host') socket.emit('host:rejoin', { code: s.code, hostToken: s.hostToken });
      else if (s.role === 'player') socket.emit('player:rejoin', { code: s.code, pid: PLAYER_ID, name: s.name });
    }));

    offs.push(on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return; // deliberate teardown
      dispatch({ type: 'conn', payload: 'reconnecting' });
      notify('Connection lost — reconnecting', { type: 'danger', ttl: 0, key: 'conn' });
    }));

    offs.push(on('connect_error', () => dispatch({ type: 'conn', payload: 'reconnecting' })));

    for (const event of [
      'room:created', 'player:joined', 'room:updated', 'player:avatar', 'room:settings', 'room:reset',
      'round:finale_intro', 'round:intro', 'round:start', 'round:answer_count', 'round:bet_count', 'round:betting',
      'round:reveal', 'round:scoreboard', 'game:over', 'game:paused', 'game:resumed',
    ]) {
      offs.push(on(event, (payload) => dispatch({ type: event, payload })));
    }

    offs.push(on('game:paused', () => {
      notify('Host disconnected — game paused', { type: 'danger', ttl: 0, key: 'paused' });
    }));
    offs.push(on('game:resumed', () => {
      dismiss('paused');
      notify('Host is back — resuming', { type: 'success' });
    }));

    // The server restarted and lost its in-memory rooms, or this device is no longer
    // the host — either way the stored session is stale and retrying into it loops.
    const FATAL = ['Room not found', 'Player not found in room', 'Not the host of this room'];

    offs.push(on('error', ({ message }) => {
      dispatch({ type: 'pending', payload: null });
      if (FATAL.includes(message)) forget();
      notify(message, { type: 'danger' });
    }));

    socket.connect();

    return () => {
      offs.forEach((off) => off());
      socket.disconnect();
    };
  }, [notify, dismiss, forget]);

  // Cold-start feedback: the button used to do nothing at all for ~30s.
  useEffect(() => {
    if (!state.pending) { dismiss('cold'); return undefined; }

    const hint = setTimeout(() => {
      if (!socket.connected) {
        notify('Waking up the server — this can take up to 30s', { type: 'info', ttl: 0, key: 'cold' });
      }
    }, COLD_START_HINT_MS);

    const fail = setTimeout(() => {
      dismiss('cold');
      dispatch({ type: 'pending', payload: null });
      notify("Couldn't reach the server. Check your connection and try again.", { type: 'danger', ttl: 6000 });
    }, CONNECT_TIMEOUT_MS);

    return () => { clearTimeout(hint); clearTimeout(fail); };
  }, [state.pending, notify, dismiss]);

  // Persist so a refresh — or a reconnect — can re-announce us.
  //
  // Deps are the four fields that actually go into the session. `state` itself used
  // to be in here too, which made the rest of the list decorative and wrote to
  // localStorage on every socket event, answer counts included.
  const { role, me, hostToken } = state;
  const roomCode = state.room?.code;
  const roomSettings = state.room?.settings;
  const myName = me?.name;

  useEffect(() => {
    if (!roomCode) return;
    if (role === 'host') persist({ role: 'host', code: roomCode, settings: roomSettings, hostToken });
    else if (role === 'player' && myName) persist({ role: 'player', code: roomCode, name: myName });
  }, [role, roomCode, roomSettings, myName, hostToken, persist]);

  return { state, dispatch, forget };
}
