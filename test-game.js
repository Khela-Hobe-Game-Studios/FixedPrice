/**
 * test-game.js — the real browser path through the real UI.
 *
 * Three isolated contexts: the board on a TV viewport, two players on phones.
 * The host opens a room from the settings screen, the players join through the QR
 * deep link, pick a face, and play every phase.
 *
 * Selectors are `data-testid` hooks, not text. The board is all-uppercase with
 * heavy letter-spacing and its copy is deliberately mutable — a test that asserts
 * on wording fails every time the design changes its mind, and the old one also
 * picked a settings toggle by index among `button[aria-pressed]`, which passes
 * while silently toggling the wrong thing.
 *
 * Run:
 *   node test-game.js                          3 rounds, betting on
 *   ROUNDS=2 BETTING=false node test-game.js   the smoke test `verify` runs
 */

const { chromium } = require('playwright');

const URL = 'http://localhost:5173';
const ROUNDS_TO_PLAY = Number(process.env.ROUNDS ?? 3);
const BETTING = (process.env.BETTING ?? 'true').toLowerCase() !== 'false';
const PHASE_TIMEOUT = 60000;

function log(role, msg) {
  console.log(`[${role.padEnd(5)}] ${msg}`);
}

/** Race two locators — returns 'a' or 'b' depending which appears first. */
async function whichAppears(locA, locB, timeoutMs = PHASE_TIMEOUT) {
  return Promise.race([
    locA.first().waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'a'),
    locB.first().waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'b'),
  ]);
}

/* ── the music ───────────────────────────────────────────────────────────────
 *
 * There is nothing on the page to assert against: Howler keeps its <audio>
 * elements in an internal pool in html5 mode, and the network is not the answer
 * either, because a second track out of the same folder is served from cache with
 * no request to see. `game/music.js` publishes `window.__music()` in dev for
 * exactly this. */
const musicOf = (page) => page.evaluate(() => window.__music?.() ?? null);

/** Wait for the board to land on a playlist — the crossfades take a beat. */
async function expectMusic(page, playing, note, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await musicOf(page);
    if (last === null) return null; // not a dev build — nothing to check
    if (last.playing === playing) { log('HOST', `music: ${note} → ${last.playing} (${last.track})`); return last; }
    if (Date.now() > deadline) {
      throw new Error(`music: expected "${playing}" ${note}, got "${last.playing}" (${JSON.stringify(last)})`);
    }
    await page.waitForTimeout(200);
  }
}

// ─── HOST ────────────────────────────────────────────────────────────────────

async function runHost(context, resolveCode) {
  const page = await context.newPage();
  await page.goto(URL);
  log('HOST', 'board loaded');

  // Nothing may play before a gesture: a track that starts on load is one the
  // browser refused, and the refusal is what leaves the board silent all night.
  const cold = await musicOf(page);
  if (cold && cold.playing !== null) throw new Error(`music started before any gesture: ${JSON.stringify(cold)}`);

  await page.getByTestId('host-start').click();
  // The first click is the one that arms audio, and the whole pre-game — landing,
  // settings, lobby — is one track.
  const armed = await expectMusic(page, 'startup', 'on the first click');

  // Betting cadence is a real setting now, so the test states which game it wants
  // rather than toggling whatever control happens to sit second on the screen.
  await page.getByTestId(BETTING ? 'betting-every3' : 'betting-never').click();
  await page.getByTestId('rounds-10').click();
  await page.getByTestId('save-settings').click();
  log('HOST', `settings saved (betting=${BETTING})`);

  const code = (await page.getByTestId('room-code').textContent()).trim();
  if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error(`bad room code: "${code}"`);
  log('HOST', `room ${code}`);
  resolveCode(code);

  const start = page.getByTestId('start-game');
  await start.waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="start-game"]')?.disabled,
    null,
    { timeout: PHASE_TIMEOUT }
  );
  // Still the same startup track it started on — the settings screen and a lobby
  // filling with players are not scene changes.
  const inLobby = await musicOf(page);
  if (armed && inLobby && inLobby.track !== armed.track) {
    throw new Error(`music restarted between the landing and the lobby: ${armed.track} → ${inLobby.track}`);
  }

  await start.click();
  log('HOST', 'game started');

  await expectMusic(page, 'game', 'when the game starts');

  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    log('HOST', `--- round ${round} ---`);

    await page.getByTestId('intro-category').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
    log('HOST', 'round intro');

    await page.getByTestId('question').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
    log('HOST', 'question');

    const next = await whichAppears(
      page.getByTestId('betting-board'),
      page.getByTestId('correct-answer')
    );
    if (next === 'a') {
      if (!BETTING) throw new Error('a betting round ran with betting set to never');
      log('HOST', 'betting');
      await page.getByTestId('correct-answer').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
    }
    log('HOST', 'reveal');

    // The music has to get out of the way of the one sequence built to be listened
    // to. Checked every round: the un-duck is a cleanup, and a cleanup that stops
    // running leaves the board quiet for the rest of the night.
    const under = await musicOf(page);
    if (under && under.playing && !under.ducked) {
      throw new Error(`music did not duck under the reveal: ${JSON.stringify(under)}`);
    }

    await page.getByTestId('score-row').first().waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
    log('HOST', 'scoreboard');

    const after = await musicOf(page);
    if (after && after.ducked) throw new Error(`music stayed ducked past the reveal: ${JSON.stringify(after)}`);
  }

  log('HOST', 'done');
  return page;
}

/**
 * The last two transitions, run after every player has finished so that ending
 * the game does not race a phone still waiting on its standings.
 */
async function checkEndgameMusic(page) {
  await page.keyboard.press('Escape');
  const ended = Date.now();
  await page.getByTestId('end-game').click();
  await page.getByTestId('play-again').first().waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });

  /* Celebration deliberately waits out the fanfare cue — the fanfare is written to
   * land on silence, so a track that comes up under it is the bug. Only assertable
   * if we got here inside the delay: on a slow runner the screen itself can take
   * longer than that, and an assertion that depends on the machine being fast is
   * one the gate will eventually fail for no reason. */
  const duringFanfare = await musicOf(page);
  if (Date.now() - ended < 900 && duringFanfare && duringFanfare.playing !== null) {
    throw new Error(`celebration music trampled the fanfare: ${JSON.stringify(duringFanfare)}`);
  }
  const party = await expectMusic(page, 'celebration', 'at game over');

  await page.getByTestId('play-again').first().click();
  await page.getByTestId('start-game').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
  const rematch = await expectMusic(page, 'startup', 'back in the lobby');

  if (party && rematch && party.track === rematch.track) {
    throw new Error(`the rematch opened on the same track it just finished on: ${rematch.track}`);
  }
}

// ─── PLAYER ──────────────────────────────────────────────────────────────────

/* One player is held back a beat at the betting step so that the other is
 * unambiguously first. The first better is the interesting one: they place a bet
 * and then sit there waiting on somebody else, which is the only state in which a
 * phone that fails to acknowledge the bet is visible. When both bet inside the same
 * tick they are both carried into the reveal and the gap hides itself — which is
 * exactly how it shipped. */
async function runPlayer(context, name, code, { betsFirst = false } = {}) {
  const page = await context.newPage();
  // The QR deep link is the path fourteen of fifteen guests actually take.
  await page.goto(`${URL}/?join=${code}`);

  await page.getByTestId('player-name-input').fill(name);
  await page.getByTestId('join-game').click();

  await page.getByTestId('use-avatar').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
  await page.getByTestId('use-avatar').click();
  log(name, `joined ${code}`);

  // A phone never plays music. Fifteen of them would fight the TV, and the one on
  // the slow link is the one everybody hears.
  const m = await musicOf(page);
  if (m && (m.enabled || m.playing)) throw new Error(`${name}'s phone is playing music: ${JSON.stringify(m)}`);

  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    const lock = page.getByTestId('lock-in');
    await lock.waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });

    const guess = String(100 + Math.floor(Math.random() * 900));
    for (const digit of guess) await page.getByTestId(`pad-${digit}`).click();
    await lock.click();
    log(name, `r${round} guessed ${guess}`);

    // The locked-in screen is a race by design — the last player to lock in ends the
    // question phase immediately, so they may never see it. Check without waiting.
    if (await page.getByTestId('locked-in').isVisible().catch(() => false)) {
      log(name, `r${round} locked in`);
    }

    // Whatever comes next comes next: a betting round, or straight to the reveal.
    // Waiting on the reveal alone would sit through the entire betting phase and
    // then report that betting never happened.
    const next = await whichAppears(
      page.getByTestId('bet-option'),
      page.getByTestId('actual-price')
    );
    if (next === 'a') {
      await page.getByTestId('bet-option').first().click();
      if (!betsFirst) await page.waitForTimeout(1500);
      await page.getByTestId('place-bet').click();

      /* The phone has to acknowledge the bet. The first better is still waiting on
       * the other player, so the button must go dead in front of them — otherwise
       * they are looking at a live PLACE BET they have already pressed, and the
       * only available reading is that it did not work. The second better is
       * carried into the reveal instead, which is its own acknowledgement. */
      if (betsFirst) {
        await page
          .locator('[data-testid="place-bet"]:disabled')
          .waitFor({ state: 'visible', timeout: 8000 })
          .catch(() => {
            throw new Error(`${name}: bet placed but PLACE BET stayed live`);
          });
      }
      log(name, `r${round} bet placed`);
      await page.getByTestId('actual-price').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
    }
    log(name, `r${round} reveal`);

    await page.getByTestId('my-standing').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
    log(name, `r${round} standings`);
  }

  log(name, 'done');
  return page;
}

// ─── RUN ─────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch({ headless: true, slowMo: 30 });
  const failures = [];

  const tv = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phones = await Promise.all([
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext({ viewport: { width: 375, height: 667 } }), // the short phone
  ]);

  // Any uncaught error in any context is a failure, even if the flow completes.
  for (const [label, ctx] of [['HOST', tv], ['Alice', phones[0]], ['Bob', phones[1]]]) {
    ctx.on('page', (p) => p.on('pageerror', (e) => failures.push(`${label}: ${e.message}`)));
  }

  let resolveCode;
  const codePromise = new Promise((r) => { resolveCode = r; });

  try {
    const hostRun = runHost(tv, resolveCode);
    const code = await codePromise;
    const [hostPage] = await Promise.all([
      hostRun,
      runPlayer(phones[0], 'Alice', code, { betsFirst: true }),
      runPlayer(phones[1], 'Bob', code),
    ]);
    log('DONE', `${ROUNDS_TO_PLAY} rounds complete (betting=${BETTING})`);

    await checkEndgameMusic(hostPage);
    log('DONE', 'game over and rematch music');
  } catch (err) {
    failures.push(err.message);
  }

  if (failures.length) {
    log('FAIL', `${failures.length} problem(s):`);
    failures.forEach((f) => console.log('   ' + f));
    process.exitCode = 1;
  }

  await browser.close();
})();
