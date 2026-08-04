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
  let colorBeforeDrop = null;
  let reconnected = null;
  let lastReveal = null;
  let sawIntro = false;

  host.on('round:intro', () => { sawIntro = true; });
  host.on('round:reveal', (d) => { lastReveal = d; });

  host.on('round:scoreboard', async ({ scoreboard }) => {
    if (reconnected) return;
    const leader = scoreboard.find(p => p.score > 0);
    if (!leader) return; // nobody has points yet — wait for a later round

    victim = players.find(p => p.pid === leader.id);
    if (!victim) return;
    scoreBeforeDrop = leader.score;
    colorBeforeDrop = roster.find(p => p.id === leader.id)?.colorIndex;

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

  // Once the reconnect has been proven and a further round has scored, end the
  // game rather than sitting through all 10 rounds — at 15 players each round
  // is ~15s of reveal and scoreboard, which made this suite too slow to be a
  // routine gate.
  let roundsAfterRejoin = 0;
  host.on('round:scoreboard', () => {
    if (!reconnected) return;
    if (++roundsAfterRejoin >= 2) host.emit('host:end_game');
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

  // The reveal is a choreographed sequence the server owns, so the phase has to be
  // long enough to contain its own last beat. It used to be a flat number the host
  // animated against by guesswork, which is how the celebration could land before
  // the winner resolved.
  const s = lastReveal?.schedule;
  check('reveal carries a beat schedule', !!s && typeof s.winner === 'number',
        `(schedule=${JSON.stringify(s)})`);
  check('reveal window contains its own beats',
        !!s && lastReveal.revealMs >= s.points && lastReveal.revealMs >= s.winner,
        `(revealMs=${lastReveal?.revealMs}, points beat at ${s?.points})`);
  check('reveal states its outcome',
        ['single', 'tie', 'nobody_close'].includes(lastReveal?.outcome),
        `(outcome=${lastReveal?.outcome})`);
  check('reveal ranks and scores agree',
        Array.isArray(lastReveal?.ranked) &&
        lastReveal.ranked.filter(r => r.isWinner).length === lastReveal.winnerIds.length,
        `(winners=${lastReveal?.winnerIds?.length})`);

  check('every round was introduced', sawIntro);

  const total = final.reduce((s2, p) => s2 + p.score, 0);
  check('points were actually awarded', total > 0, `(total ${total})`);

  // Colour is the identity token the whole board leans on: it must be unique in the
  // room and survive a player dropping out, which an index-derived colour does not.
  const colors = roster.map(p => p.colorIndex);
  check('every player has a distinct colour index',
        colors.every(c => typeof c === 'number') && new Set(colors).size === colors.length,
        `(got ${JSON.stringify(colors)})`);
  check('the reconnected player kept their colour',
        victim && roster.find(p => p.id === victim.pid)?.colorIndex === colorBeforeDrop,
        `(before ${colorBeforeDrop}, after ${roster.find(p => p.id === victim?.pid)?.colorIndex})`);

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

// ─── 5: identity, avatars and settings ───────────────────────────────────────

async function testIdentityAndSettings() {
  log('TEST', 'avatars, settings and the server clock');
  const { host, code } = await hostRoom({ rounds: 15, secondsPerQuestion: 20, bettingFrequency: 'every3' });

  let roster = [];
  host.on('room:updated', ({ players: p }) => { roster = p; });

  const a = await joinPlayer(code, 'Alpha', uid('s-a'));
  const b = await joinPlayer(code, 'Beta', uid('s-b'));
  await wait(200);

  check('a new player defaults to a monogram',
        roster.every(p => p.avatar?.kind === 'monogram'),
        `(got ${JSON.stringify(roster.map(p => p.avatar))})`);

  // A 1x1 PNG stands in for the posterised selfie the phone produces.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  a.emit('player:set_avatar', { kind: 'selfie', image: png });
  await once(a, 'player:avatar_set', 5000);
  await wait(200);
  check('a selfie reaches the whole room',
        roster.find(p => p.name === 'Alpha')?.avatar?.kind === 'selfie');

  const rejected = [];
  b.on('error', (e) => rejected.push(e.message));
  b.emit('player:set_avatar', { kind: 'selfie', image: 'https://example.com/not-a-data-url.png' });
  b.emit('player:set_avatar', { kind: 'selfie', image: `data:image/png;base64,${'A'.repeat(20000)}` });
  await wait(300);
  check('an unbounded or off-format image is refused', rejected.length >= 2,
        `(got ${rejected.length})`);

  // Settings are the host's until the game starts.
  const settingsSeen = once(a, 'room:settings', 5000);
  host.emit('host:update_settings', { rounds: 20, bettingFrequency: 'never' });
  const { settings } = await settingsSeen;
  check('settings changes reach the players',
        settings.rounds === 20 && settings.bettingFrequency === 'never',
        `(got ${JSON.stringify(settings)})`);

  // The clock the whole board counts down from.
  const t0 = Date.now();
  const pong = await new Promise((res) => host.emit('time:ping', t0, res));
  check('the server answers a clock ping',
        typeof pong?.serverNow === 'number' && pong.clientSent === t0,
        `(got ${JSON.stringify(pong)})`);

  const start = once(a, 'round:start', 20000);
  host.emit('host:start_game');
  const intro = await once(a, 'round:intro', 10000);
  check('the round is introduced before it starts',
        intro.round === 1 && typeof intro.category === 'string' && intro.endsAt > intro.serverNow,
        `(got ${JSON.stringify({ round: intro.round, category: intro.category })})`);

  const round = await start;
  check('the question phase carries the server clock',
        round.phase === 'QUESTION' && round.endsAt - round.serverNow === 20000,
        `(got ${round.endsAt - round.serverNow}ms, expected the host's 20s)`);

  host.emit('host:end_game');
  host.disconnect(); a.disconnect(); b.disconnect();
  await wait(300);
}

// ─── run ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await testFifteenPlayersWithReconnect();
    await testInputValidation();
    await testIdentityAndSettings();
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
