/**
 * test-game.js
 * Drives a full game with 3 isolated browser contexts:
 *   - Host: creates room, starts game, watches each round phase
 *   - Alice / Bob: join, submit answers, place bets each round
 *
 * Selectors use stable text/role locators that survive CSS/component refactors.
 *
 * Run:
 *   ROUNDS=3 BETTING=true  node test-game.js   (default — 3 rounds, betting on, betting phase at round 5/10/15)
 *   ROUNDS=2 BETTING=false node test-game.js   (no-betting smoke test)
 */

const { chromium } = require('playwright');

const URL = 'http://localhost:5173';
const ROUNDS_TO_PLAY = Number(process.env.ROUNDS ?? 3);
const BETTING = (process.env.BETTING ?? 'true').toLowerCase() !== 'false';

function log(role, msg) {
  console.log(`[${role.padEnd(5)}] ${msg}`);
}

// Race two locator visibilities — returns 'a' or 'b' depending which appears first.
async function whichAppears(page, locA, locB, timeoutMs = 60000) {
  const result = await Promise.race([
    locA.first().waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'a'),
    locB.first().waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'b'),
  ]);
  return result;
}

// ─── HOST ────────────────────────────────────────────────────────────────────

async function runHost(context, resolveCode) {
  const page = await context.newPage();
  await page.goto(URL);
  log('HOST', 'Navigated to app');

  await page.getByRole('button', { name: 'Host a Game' }).click();

  // Toggle betting rounds OFF if BETTING=false (default is ON).
  // The pill-switch toggles are <button aria-pressed>, ordered:
  // 0=Elimination, 1=Betting Rounds, 2=Background Music
  if (!BETTING) {
    const bettingToggle = page.locator('button[aria-pressed]').nth(1);
    await bettingToggle.waitFor({ timeout: 10000 });
    const state = await bettingToggle.getAttribute('aria-pressed');
    if (state === 'true') {
      await bettingToggle.click();
      log('HOST', 'Betting rounds toggled OFF');
    }
  }

  await page.getByRole('button', { name: 'Create Room' }).click();

  // RoomCode renders as <span class="kui-roomcode__code"> with the 4-letter code
  const codeEl = page.locator('.kui-roomcode__code').first();
  await codeEl.waitFor({ timeout: 10000 });
  const code = (await codeEl.textContent()).trim();
  log('HOST', `Room created: ${code}`);
  resolveCode(code);

  // Wait until Start Game button is enabled (≥2 players joined)
  const startBtn = page.getByRole('button', { name: /Start Game/i });
  await page.waitForFunction(
    () => {
      const all = Array.from(document.querySelectorAll('button'));
      const start = all.find(b => /Start Game/.test(b.textContent || ''));
      return start && !start.disabled;
    },
    { timeout: 30000 }
  );
  log('HOST', 'Players joined — starting game');
  await startBtn.click();

  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    log('HOST', `--- Round ${round} ---`);

    // Question phase: QuestionCard is up
    await page.locator('.kui-qcard').first().waitFor({ timeout: 15000 });
    log('HOST', 'Question phase');

    // Wait for either betting ("Who do you trust?") or reveal ("Correct Answer")
    const phase = await whichAppears(
      page,
      page.getByText('Who do you trust?', { exact: false }),
      page.getByText('Correct Answer', { exact: false }),
      60000,
    );

    if (phase === 'a') {
      log('HOST', 'Betting phase');
      await page.getByText('Correct Answer', { exact: false }).first().waitFor({ timeout: 40000 });
    }

    log('HOST', 'Reveal phase');

    // Scoreboard: <h2>Scoreboard</h2>
    await page.getByRole('heading', { name: 'Scoreboard' }).waitFor({ timeout: 25000 });
    log('HOST', 'Scoreboard phase');

    if (round < ROUNDS_TO_PLAY) {
      await page.locator('.kui-qcard').first().waitFor({ timeout: 25000 });
    }
  }

  log('HOST', 'Done');
}

// ─── PLAYER ──────────────────────────────────────────────────────────────────

async function runPlayer(context, name, codePromise) {
  const page = await context.newPage();
  await page.goto(URL);
  log(name, 'Navigated to app');

  await page.getByRole('button', { name: 'Join a Game' }).click();

  const code = await codePromise;
  // KUI Input renders <input id="room-code"> with a separate <label for="room-code">
  await page.locator('#room-code').fill(code);
  await page.locator('#player-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  log(name, `Joined room ${code}`);

  // After join: either still in lobby, or game already in question phase
  const initial = await whichAppears(
    page,
    page.getByText(/Waiting for the host/i),
    page.locator('.kui-answer__input'),
    15000,
  );
  if (initial === 'a') {
    log(name, 'In lobby — waiting for host to start');
    await page.locator('.kui-answer__input').first().waitFor({ timeout: 60000 });
  }

  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    log(name, `--- Round ${round} ---`);

    // Question phase: AnswerInput visible
    await page.locator('.kui-answer__input').first().waitFor({ timeout: 15000 });

    const question = await page.locator('.kui-qcard__question').first().textContent().catch(() => '?');
    log(name, `Q: ${(question || '').trim().slice(0, 80)}`);

    const guess = String(Math.floor(Math.random() * 9000) + 100);
    await page.locator('.kui-answer__input').fill(guess);
    await page.getByRole('button', { name: 'Lock In' }).click();
    log(name, `Guess: ${guess}`);

    // Wait for betting prompt OR reveal answer
    const phase = await whichAppears(
      page,
      page.getByText('Who do you trust?', { exact: false }),
      page.getByText('Correct Answer', { exact: false }),
      60000,
    );

    if (phase === 'a') {
      log(name, 'Betting phase');
      const rows = await page.locator('.kui-betpanel__row').all();
      if (rows.length > 0) {
        await rows[0].click();
        await page.getByRole('button', { name: 'Place Bet' }).click();
        log(name, 'Bet placed');
      }
      await page.getByText('Correct Answer', { exact: false }).first().waitFor({ timeout: 40000 });
    }

    log(name, 'Reveal phase');

    // Scoreboard: SCOREBOARD heading
    await page.locator('h2', { hasText: /SCOREBOARD/i }).waitFor({ timeout: 25000 });
    log(name, 'Scoreboard phase');

    if (round < ROUNDS_TO_PLAY) {
      await page.locator('.kui-answer__input').first().waitFor({ timeout: 25000 });
    }
  }

  log(name, 'Done');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch({ headless: true, slowMo: 50 });

  const hostCtx  = await browser.newContext();
  const aliceCtx = await browser.newContext();
  const bobCtx   = await browser.newContext();

  let resolveCode;
  const codePromise = new Promise(res => { resolveCode = res; });

  const hostPromise = runHost(hostCtx, resolveCode);
  await new Promise(r => setTimeout(r, 1000));

  try {
    await Promise.all([
      hostPromise,
      runPlayer(aliceCtx, 'Alice', codePromise),
      runPlayer(bobCtx, 'Bob', codePromise),
    ]);
    log('DONE', `${ROUNDS_TO_PLAY} rounds complete (betting=${BETTING})`);
  } catch (err) {
    log('FAIL', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
