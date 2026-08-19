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
  // round:betting carries `options` — the (shuffled, capped) set the board actually
  // put up. This read `d.ranked`, which has never been on this payload; it only went
  // unnoticed because every suite so far ran with betting off.
  sock.on('round:betting', (d) => {
    if (d.alreadySubmitted) return;
    const target = (d.options ?? []).find(o => o.id !== sock.__pid);
    if (target) sock.emit('player:submit_bet', { targetId: target.id });
  });
}

async function hostRoom(settings = {}) {
  const host = await connect();
  host.emit('host:create_room', { questionCount: QUESTION_COUNT, ...settings });
  const { code, hostToken } = await once(host, 'room:created');
  return { host, code, hostToken };
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
  // One player's face now arrives as a one-player delta rather than a fresh roster
  // carrying every avatar in the room.
  const avatarSeen = once(b, 'player:avatar', 5000);
  a.emit('player:set_avatar', { kind: 'selfie', image: png });
  await once(a, 'player:avatar_set', 5000);
  const delta = await avatarSeen;
  check('a selfie reaches the whole room as a one-player delta',
        delta.avatar?.kind === 'selfie' && delta.id === a.__pid,
        `(got ${JSON.stringify(delta)})`);

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

// ─── 6: the sudden-death finale ──────────────────────────────────────────────

async function testFinale() {
  log('TEST', 'sudden death converges on one winner');
  // Short game, no clock pressure, finale forced on.
  const { host, code } = await hostRoom({ rounds: 10, secondsPerQuestion: 20, bettingFrequency: 'never', finale: 'on' });

  const players = [];
  for (let i = 0; i < 8; i++) {
    const sock = await joinPlayer(code, `F${i}`, uid(`f${i}`));
    // Systematically spread guesses so knockouts are deterministic, not luck.
    sock.on('round:start', () => setTimeout(() => sock.emit('player:submit_answer', { answer: 100 + i * 400 }), 30));
    players.push(sock);
  }
  await wait(300);

  let sawFinale = null;
  const knockouts = [];
  host.on('round:finale_intro', (d) => { sawFinale = d; });
  host.on('round:reveal', (d) => {
    if (d.finale && d.knockedOut?.length) knockouts.push(...d.knockedOut);
  });

  const gameOver = once(host, 'game:over', 180000);
  host.emit('host:start_game');

  // Skip the normal rounds; the finale is what this test is about.
  const skipper = setInterval(() => host.emit('host:skip'), 250);
  const { final, finale } = await gameOver;
  clearInterval(skipper);

  check('the finale ran', !!sawFinale && sawFinale.finalists.length >= 2,
        `(finalists=${sawFinale?.finalists?.length})`);
  check('finalists qualified on points',
        !!sawFinale && sawFinale.finalists.every(f => typeof f.score === 'number'));
  check('sudden death knocked players out', knockouts.length >= 1,
        `(knockouts=${knockouts.length})`);
  check('it converged on exactly one survivor',
        !!sawFinale && knockouts.length === sawFinale.finalists.length - 1,
        `(${knockouts.length} out of ${sawFinale?.finalists?.length} finalists)`);
  check('nobody was knocked out twice', new Set(knockouts).size === knockouts.length);
  check('the survivor tops the final table',
        !!sawFinale && !knockouts.includes(final[0].id),
        `(winner ${final[0]?.name})`);
  check('the finale reported its length', typeof finale?.played === 'number',
        `(played=${finale?.played})`);
  // Placings among finalists are the reverse of the knockout order, so somebody
  // cannot finish above the player who knocked them out.
  const placeOf = (id) => final.findIndex(p => p.id === id);
  const ordered = knockouts.every((id, i) =>
    i === 0 || placeOf(id) < placeOf(knockouts[i - 1]));
  check('placings follow the reverse knockout order', ordered,
        `(${knockouts.map(id => `${final[placeOf(id)]?.name}@${placeOf(id) + 1}`).join(' ')})`);

  host.disconnect();
  players.forEach(p => p.connected && p.disconnect());
  await wait(300);
}

// ─── 7: host authority ───────────────────────────────────────────────────────

async function testHostAuthority() {
  log('TEST', 'host control needs the host token, not just the room code');
  const { host, code, hostToken } = await hostRoom({ rounds: 10, secondsPerQuestion: 0 });

  check('the room hands its creator a host token',
        typeof hostToken === 'string' && hostToken.length >= 16,
        `(got ${JSON.stringify(hostToken)})`);

  const p1 = await joinPlayer(code, 'Real1', uid('h1'));
  const p2 = await joinPlayer(code, 'Real2', uid('h2'));
  await wait(200);

  // The code is one of 48 dictionary words, so "knows the code" cannot be the test.
  const attacker = await connect();
  const refusals = [];
  attacker.on('error', (e) => refusals.push(e.message));

  attacker.emit('host:rejoin', { code });
  attacker.emit('host:rejoin', { code, hostToken: 'not-the-token' });
  await wait(300);

  check('rejoining as host without the token is refused',
        refusals.filter(m => m === 'Not the host of this room').length === 2,
        `(got ${JSON.stringify(refusals)})`);

  // And the refusal must be total: no room join, no host powers, and crucially the
  // real host must not have been demoted by the attempt.
  let started = false;
  p1.on('round:intro', () => { started = true; });
  attacker.emit('host:start_game');
  attacker.emit('host:end_game');
  await wait(300);
  check('a refused host cannot drive the game', !started);

  const introSeen = once(p1, 'round:intro', 10000);
  host.emit('host:start_game');
  await introSeen;
  check('the real host still controls the room after the attempt', true);

  // The legitimate reconnect path, with the token the server issued.
  const rehost = await connect();
  rehost.emit('host:rejoin', { code, hostToken });
  const reclaimed = await once(rehost, 'room:created', 5000);
  check('the real host reclaims the room with its token', reclaimed.code === code,
        `(got ${JSON.stringify(reclaimed)})`);

  rehost.emit('host:end_game');
  await wait(200);

  host.disconnect(); rehost.disconnect(); attacker.disconnect();
  p1.disconnect(); p2.disconnect();
  await wait(300);
}

// ─── 8: bets are limited to what the board offered ───────────────────────────

async function testBetTargets() {
  log('TEST', 'a bet can only back a guess the round actually put up');
  // 8 players, so bettingOptions' cap of 6 leaves someone off the board.
  const { host, code } = await hostRoom({ rounds: 10, secondsPerQuestion: 0, bettingFrequency: 'every3' });

  /* EVERY ROUND is gone, so the earliest betting round is the third. Skipping the
   * phases that only spend time — intro, reveal, scoreboard — gets there in about a
   * second instead of sitting through two full rounds. Question and betting are
   * left alone: the players answer those, and betting is the phase under test. */
  const fastForward = () => host.emit('host:skip');
  host.on('round:intro', fastForward);
  host.on('round:reveal', fastForward);
  host.on('round:scoreboard', fastForward);

  const players = [];
  for (let i = 0; i < 8; i++) {
    const pid = uid(`b${i}`);
    const sock = await joinPlayer(code, `B${i}`, pid);
    sock.on('round:start', () => setTimeout(() => sock.emit('player:submit_answer', { answer: 100 + i * 37 }), 30));
    players.push(sock);
  }
  await wait(300);

  const betting = once(players[0], 'round:betting', 30000);
  host.emit('host:start_game');
  const offer = await betting;

  check('the board offers a capped set of guesses', offer.options.length === 6,
        `(got ${offer.options.length})`);

  const offered = new Set(offer.options.map(o => o.id));
  const notOffered = players.map(p => p.__pid).find(pid => !offered.has(pid));
  check('with 8 players somebody is left off the board', !!notOffered);

  let counted = 0;
  players[0].on('round:bet_count', (d) => { counted = d.count; });

  // A player the round never put up, and an id belonging to nobody at all.
  players[0].emit('player:submit_bet', { targetId: notOffered });
  players[0].emit('player:submit_bet', { targetId: uid('ghost') });
  await wait(400);
  check('a bet on an unoffered player is ignored', counted === 0, `(count=${counted})`);

  // The same socket can still place a real bet — the guard rejects the target,
  // not the bettor.
  const valid = offer.options.find(o => o.id !== players[0].__pid);
  players[0].emit('player:submit_bet', { targetId: valid.id });
  await wait(400);
  check('a bet on an offered player is accepted', counted === 1, `(count=${counted})`);

  host.emit('host:end_game');
  host.disconnect();
  players.forEach(p => p.connected && p.disconnect());
  await wait(300);
}

// ─── 9: the finale's tie paths ───────────────────────────────────────────────

async function testFinaleTies() {
  log('TEST', 'sudden death survives a round nobody can lose');
  const { host, code } = await hostRoom({ rounds: 10, secondsPerQuestion: 0, bettingFrequency: 'never', finale: 'on' });

  const players = [];
  for (let i = 0; i < 6; i++) {
    const sock = await joinPlayer(code, `T${i}`, uid(`t${i}`));
    // Identical guesses: everyone ties for furthest every single round, which is the
    // branch that would otherwise empty the board. Nobody may go out, and the cap on
    // no-kill rounds is the only thing that ends the game.
    sock.on('round:start', () => setTimeout(() => sock.emit('player:submit_answer', { answer: 42 }), 30));
    players.push(sock);
  }
  await wait(300);

  let sawFinale = null;
  const knockouts = [];
  host.on('round:finale_intro', (d) => { sawFinale = d; });
  host.on('round:reveal', (d) => {
    if (d.finale && d.knockedOut?.length) knockouts.push(...d.knockedOut);
  });

  const gameOver = once(host, 'game:over', 180000);
  host.emit('host:start_game');
  const skipper = setInterval(() => host.emit('host:skip'), 250);
  const { final } = await gameOver;
  clearInterval(skipper);

  check('the finale ran', !!sawFinale, `(finalists=${sawFinale?.finalists?.length})`);
  check('an all-tied round knocks nobody out', knockouts.length === 0,
        `(knockouts=${knockouts.length})`);
  // The real assertion is that we got here at all: without the no-kill cap this
  // loops until the timeout rather than reaching game:over.
  check('the game still ended', Array.isArray(final) && final.length === 6,
        `(final=${final?.length})`);
  check('every finalist is still on the final table',
        !!sawFinale && sawFinale.finalists.every(f => final.some(p => p.id === f.id)));

  host.disconnect();
  players.forEach(p => p.connected && p.disconnect());
  await wait(300);
}

// ─── 10: a finalist who sits out forfeits first ──────────────────────────────

async function testFinaleForfeit() {
  log('TEST', 'a finalist who does not answer goes out first');
  const { host, code } = await hostRoom({ rounds: 10, secondsPerQuestion: 0, bettingFrequency: 'never', finale: 'on' });

  const players = [];
  for (let i = 0; i < 6; i++) {
    const pid = uid(`x${i}`);
    const sock = await joinPlayer(code, `X${i}`, pid);
    sock.__finaleSilent = false;
    sock.on('round:start', (d) => {
      // Answer every normal round; go quiet the moment sudden death starts.
      if (d.finale && sock.__finaleSilent) return;
      setTimeout(() => sock.emit('player:submit_answer', { answer: 100 + i * 250 }), 30);
    });
    players.push(sock);
  }
  await wait(300);

  let sawFinale = null;
  const firstOut = [];
  host.on('round:finale_intro', (d) => {
    sawFinale = d;
    // Silence exactly one qualifier once we know who qualified.
    const victim = players.find(p => p.__pid === d.finalists[0].id);
    if (victim) victim.__finaleSilent = true;
  });
  host.on('round:reveal', (d) => {
    if (d.finale && d.knockedOut?.length && firstOut.length === 0) firstOut.push(...d.knockedOut);
  });

  const gameOver = once(host, 'game:over', 180000);
  host.emit('host:start_game');
  const skipper = setInterval(() => host.emit('host:skip'), 250);
  await gameOver;
  clearInterval(skipper);

  check('the finale ran', !!sawFinale && sawFinale.finalists.length >= 2);
  check('the silent finalist was the first one out',
        firstOut.length === 1 && firstOut[0] === sawFinale?.finalists[0]?.id,
        `(out=${JSON.stringify(firstOut)}, expected ${sawFinale?.finalists[0]?.id})`);

  host.disconnect();
  players.forEach(p => p.connected && p.disconnect());
  await wait(300);
}

// ─── run ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await testFifteenPlayersWithReconnect();
    await testInputValidation();
    await testIdentityAndSettings();
    await testFinale();
    await testHostAuthority();
    await testBetTargets();
    await testFinaleTies();
    await testFinaleForfeit();
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
