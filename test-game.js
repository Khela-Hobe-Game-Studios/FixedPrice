/**
 * test-game.js
 * Drives a full game round with 3 isolated browser contexts:
 *   - Host: creates room, starts game, watches each round phase
 *   - Alice: joins, submits answers and bets each round
 *   - Bob:   joins, submits answers and bets each round
 *
 * Run:  node test-game.js
 */

const { chromium } = require('playwright');

const URL = 'http://localhost:5173';
const ROUNDS_TO_PLAY = 3;

function log(role, msg) {
  console.log(`[${role.padEnd(5)}] ${msg}`);
}

// ─── HOST ────────────────────────────────────────────────────────────────────

async function runHost(context, resolveCode) {
  const page = await context.newPage();
  await page.goto(URL);
  log('HOST', 'Navigated to app');

  await page.getByRole('button', { name: 'Host a Game' }).click();
  await page.getByRole('button', { name: 'Create Room' }).click();

  // Extract 4-letter room code from the lobby
  const codeEl = page.locator('[class*="code"]').filter({ hasText: /^[A-Z]{4}$/ }).first();
  await codeEl.waitFor({ timeout: 10000 });
  const code = (await codeEl.textContent()).trim();
  log('HOST', `Room created: ${code}`);

  // Unblock players immediately — they can now join
  resolveCode(code);

  // Wait until Start Game button is enabled (2 players present)
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button');
      // Find the start button specifically by its text
      const all = Array.from(document.querySelectorAll('button'));
      const start = all.find(b => b.textContent.includes('Start Game'));
      return start && !start.disabled;
    },
    { timeout: 30000 }
  );
  log('HOST', '2 players joined — starting game');
  await page.getByRole('button', { name: 'Start Game' }).click();

  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    log('HOST', `--- Round ${round} ---`);

    // Wait for question phase to appear (answerCount bar = host question view)
    await page.waitForSelector('[class*="questionPhase"]', { timeout: 15000 });
    log('HOST', 'Question phase');

    // Wait for betting or reveal (question phase ends automatically via timer or all answered)
    await page.waitForSelector('[class*="bettingPhase"], [class*="revealPhase"]', { timeout: 60000 });

    const inBetting = await page.$('[class*="bettingPhase"]');
    if (inBetting) {
      log('HOST', 'Betting phase');
      await page.waitForSelector('[class*="revealPhase"]', { timeout: 40000 });
    }

    log('HOST', 'Reveal phase');
    await page.waitForSelector('[class*="scoreboardPhase"]', { timeout: 20000 });
    log('HOST', 'Scoreboard phase');

    if (round < ROUNDS_TO_PLAY) {
      await page.waitForSelector('[class*="questionPhase"]', { timeout: 20000 });
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
  await page.locator('input[placeholder="Room Code"]').fill(code);
  await page.locator('input[placeholder="Your Name"]').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  log(name, `Joined room ${code}`);

  // After joining, we may land in the lobby OR go straight to a round if the game
  // already started. Wait for whichever appears first.
  await page.waitForSelector('[class*="playerGrid"], [class*="waiting"], [class*="answerInput"]', { timeout: 15000 });
  const inLobby = await page.$('[class*="playerGrid"], [class*="waiting"]');
  if (inLobby) {
    log(name, 'In lobby — waiting for host to start');
    await page.waitForSelector('[class*="answerInput"]', { timeout: 60000 });
  }

  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    log(name, `--- Round ${round} ---`);

    // Should already be on question screen; confirm answerInput is visible
    await page.waitForSelector('[class*="answerInput"]', { timeout: 15000 });

    const question = await page.locator('[class*="question"]').first().textContent().catch(() => '?');
    log(name, `Q: ${question.trim()}`);

    const guess = String(Math.floor(Math.random() * 9000) + 100);
    await page.locator('[class*="answerInput"]').fill(guess);
    await page.getByRole('button', { name: 'Lock In' }).click();
    log(name, `Guess: ${guess}`);

    // Wait for betting OR reveal — skip checking for lockedTitle since it can
    // disappear instantly when both players answer simultaneously
    await page.waitForSelector('[class*="bettingTitle"], [class*="revealLabel"]', { timeout: 60000 });

    const inBetting = await page.$('[class*="bettingTitle"]');
    if (inBetting) {
      log(name, 'Betting phase');
      const betButtons = await page.locator('[class*="betCard"]').all();
      if (betButtons.length > 0) {
        await betButtons[0].click();
        await page.getByRole('button', { name: 'Place Bet' }).click();
        log(name, 'Bet placed');
      }
      await page.waitForSelector('[class*="revealLabel"]', { timeout: 40000 });
    }

    const correctAnswer = await page.locator('[class*="revealAnswer"]').textContent().catch(() => '?');
    log(name, `Answer: ${correctAnswer.trim()}`);

    await page.waitForSelector('[class*="scoreLabel"]', { timeout: 20000 });
    const score = await page.locator('[class*="myScore"]').textContent().catch(() => '?');
    const rank  = await page.locator('[class*="myRank"]').textContent().catch(() => '?');
    log(name, `Score: ${score.trim()}  ${rank.trim()}`);

    if (round < ROUNDS_TO_PLAY) {
      await page.waitForSelector('[class*="answerInput"]', { timeout: 25000 });
    }
  }

  log(name, 'Done');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });

  const hostCtx  = await browser.newContext();
  const aliceCtx = await browser.newContext();
  const bobCtx   = await browser.newContext();

  let resolveCode;
  const codePromise = new Promise(res => { resolveCode = res; });

  // Start host — it resolves codePromise as soon as the room code is available
  const hostPromise = runHost(hostCtx, resolveCode);

  // Give host 1s head start to reach the lobby
  await new Promise(r => setTimeout(r, 1000));

  await Promise.all([
    hostPromise,
    runPlayer(aliceCtx, 'Alice', codePromise),
    runPlayer(bobCtx, 'Bob', codePromise),
  ]);

  log('DONE', `${ROUNDS_TO_PLAY} rounds complete — closing in 5s`);
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
