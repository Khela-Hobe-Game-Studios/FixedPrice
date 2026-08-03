/**
 * test-reliability.js
 *
 * Socket-level regression tests for the failure modes that break a real
 * 15-person party. These run against the server directly (no browser) so they
 * are fast and deterministic.
 *
 *   1. 15 players play a full game and every one of them finishes with a score.
 *   2. A player who drops mid-game and reconnects keeps their score and can
 *      keep playing (the two headline bugs).
 *   3. Two players with the same name score independently.
 *   4. Garbage answers are rejected instead of poisoning the ranking.
 *
 * Requires the server on :3001 —  cd server && npm run dev
 *
 *   node test-reliability.js
 */

const path = require('path');
const { io } = require(path.join(__dirname, 'client', 'node_modules', 'socket.io-client'));

const URL = process.env.SERVER_URL || 'http://localhost:3001';
const QUESTION_COUNT = 10;

let failures = 0;
const log = (tag, msg) => console.log(`[${String(tag).padEnd(9)}] ${msg}`);

function check(name, cond, detail = '') {
  if (cond) { log('PASS', name); }
  else { failures++; log('FAIL', `${name} ${detail}`); }
}

const uid = (n) => `pid-${n}-${Math.random().toString(36).slice(2, 8)}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function connect() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  return new Promise((res, rej) => {
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
  });
}

function once(sock, event, timeoutMs = 20000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${event}`)), timeoutMs);
    sock.once(event, (payload) => { clearTimeout(t); res(payload); });
  });
}

// A player that answers every round automatically.
function autoPlay(sock, guessFor) {
  sock.on('round:start', (d) => {
    if (d.alreadySubmitted) return;
    sock.emit('player:submit_answer', { answer: guessFor(d) });
  });
  sock.on('round:betting', (d) => {
    if (d.alreadySubmitted) return;
    const target = d.ranked.find(p => p.id !== sock.__pid);
    if (target) sock.emit('player:submit_bet', { targetId: target.id });
  });
}

async function hostRoom(settings = {}) {
  const host = await connect();
  host.emit('host:create_room', { questionCount: QUESTION_COUNT, ...settings });
  const { code } = await once(host, 'room:created');
  return { host, code };
}

async function joinPlayer(code, name, pid) {
  const sock = await connect();
  sock.__pid = pid;
  sock.__name = name;
  sock.emit('player:join', { code, name, pid });
  await once(sock, 'player:joined');
  return sock;
}

// ─── 1 + 2 + 3: full 15-player game with a mid-game reconnect ────────────────

async function testFifteenPlayersWithReconnect() {
  log('TEST', '15 players, full game, one drops and reconnects mid-game');
  const { host, code } = await hostRoom();
  log('SETUP', `room ${code}`);

  // Roster updates stream in as players join, so track the latest rather than
  // waiting for one after the fact.
  let roster = [];
  host.on('room:updated', ({ players: p }) => { roster = p; });

  const names = ['Karim', 'Karim', 'Rina', 'Tanvir', 'Nadia', 'Sabbir', 'Mim', 'Rafi',
                 'Sadia', 'Imran', 'Tania', 'Hasan', 'Nusrat', 'Arif', 'Priya'];
  const players = [];
  for (let i = 0; i < names.length; i++) {
    const pid = uid(i);
    const sock = await joinPlayer(code, names[i], pid);
    autoPlay(sock, () => 100 + i * 10);
    players.push({ sock, pid, name: names[i], index: i });
  }
  await wait(300);

  check('all 15 players are in the lobby', roster.length === 15, `(got ${roster.length})`);

  const namesInRoom = roster.map(p => p.name);
  check('duplicate name was disambiguated',
        namesInRoom.includes('Karim') && namesInRoom.includes('Karim (2)'),
        `(got ${JSON.stringify(namesInRoom.slice(0, 3))})`);

  const gameOver = once(host, 'game:over', 180000);

  // Drop whoever is actually leading — dropping a player on 0 would make the
  // "kept their score" assertion vacuous.
  let victim = null;
  let scoreBeforeDrop = 0;
  let reconnected = null;
  let sawRevealMs = null;

  host.on('round:reveal', (d) => { sawRevealMs = d.revealMs; });

  host.on('round:scoreboard', async ({ scoreboard }) => {
    if (reconnected) return;
    const leader = scoreboard.find(p => p.score > 0);
    if (!leader) return; // nobody has points yet — wait for a later round

    victim = players.find(p => p.pid === leader.id);
    if (!victim) return;
    scoreBeforeDrop = leader.score;

    log('DROP', `${victim.name} disconnecting with score ${scoreBeforeDrop}`);
    victim.sock.disconnect();

    // Come back as the same device, exactly as the client does on reconnect.
    reconnected = await connect();
    reconnected.__pid = victim.pid;
    // Guess the same value this player used before, so they keep competing.
    autoPlay(reconnected, () => 100 + victim.index * 10);
    reconnected.emit('player:rejoin', { code, pid: victim.pid, name: victim.name });
    await once(reconnected, 'player:joined');
    log('REJOIN', `${victim.name} reconnected`);
  });

  host.emit('host:start_game');
  const { final } = await gameOver;

  check('game reached game:over', Array.isArray(final) && final.length === 15,
        `(got ${final?.length})`);
  check('every player has a numeric score',
        final.every(p => typeof p.score === 'number' && !Number.isNaN(p.score)));

  check('a scoring player was chosen as the drop victim', !!victim && scoreBeforeDrop > 0,
        `(victim=${victim?.name}, score=${scoreBeforeDrop})`);

  const victimFinal = victim && final.find(p => p.id === victim.pid);
  check('reconnected player kept their score',
        victimFinal && victimFinal.score >= scoreBeforeDrop,
        `(before drop ${scoreBeforeDrop}, final ${victimFinal?.score})`);
  check('reconnected player is still in the final table under one identity',
        final.filter(p => p.id === victim?.pid).length === 1);

  const karims = final.filter(p => p.name.startsWith('Karim'));
  check('both Karims exist independently in the final table', karims.length === 2,
        `(got ${karims.length})`);

  check('reveal window scales with player count', sawRevealMs && sawRevealMs > 5000,
        `(revealMs=${sawRevealMs}, must exceed the old fixed 5000ms)`);

  const total = final.reduce((s, p) => s + p.score, 0);
  check('points were actually awarded', total > 0, `(total ${total})`);

  host.disconnect();
  reconnected?.disconnect();
  players.forEach(p => p.sock.connected && p.sock.disconnect());
  await wait(300);
}

// ─── 4: input validation ─────────────────────────────────────────────────────

async function testInputValidation() {
  log('TEST', 'garbage answers are rejected');
  const { host, code } = await hostRoom();

  const a = await joinPlayer(code, 'Alpha', uid('a'));
  const b = await joinPlayer(code, 'Beta', uid('b'));

  const started = once(a, 'round:start');
  host.emit('host:start_game');
  await started;

  const errors = [];
  a.on('error', (e) => errors.push(e.message));

  a.emit('player:submit_answer', { answer: 'not-a-number' });
  a.emit('player:submit_answer', { answer: Infinity });
  a.emit('player:submit_answer', { answer: {} });
  await wait(400);

  check('non-numeric answers produce an error', errors.length >= 3,
        `(got ${errors.length}: ${JSON.stringify(errors.slice(0, 2))})`);

  const reveal = once(a, 'round:reveal', 40000);
  a.emit('player:submit_answer', { answer: 500 });
  b.emit('player:submit_answer', { answer: 900 });
  const r = await reveal;

  const bad = r.ranked.filter(x => x.guess !== null && !Number.isFinite(x.guess));
  check('no NaN/Infinity leaked into the ranking', bad.length === 0,
        `(got ${JSON.stringify(bad)})`);
  check('valid answer was recorded',
        r.ranked.some(x => x.guess === 500), `(ranked ${JSON.stringify(r.ranked.map(x => x.guess))})`);

  host.emit('host:end_game');
  host.disconnect(); a.disconnect(); b.disconnect();
  await wait(300);
}

// ─── run ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await testFifteenPlayersWithReconnect();
    await testInputValidation();
  } catch (err) {
    failures++;
    log('ERROR', err.stack || err.message);
  }

  console.log('');
  if (failures === 0) {
    log('DONE', 'all reliability checks passed');
  } else {
    log('DONE', `${failures} check(s) failed`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
})();
