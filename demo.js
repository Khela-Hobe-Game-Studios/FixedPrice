/**
 * demo.js
 * Real-world style simulation of এক দাম (Fixed Price).
 *
 * 3 players with distinct personalities play 5 rounds — hitting the
 * betting round on round 5. Run:  node demo.js
 *
 * Rahim  — the overconfident one. Big numbers, rarely close.
 * Fatima — methodical. Usually within the right order of magnitude.
 * Karim  — wildcard. Either suspiciously accurate or hilariously off.
 */

const { chromium } = require('playwright');

const URL = 'http://localhost:5173';
const ROUNDS = 5;

// Each player has a guess generator: (round) => number string
// Since we don't know answers in advance, these produce "personality-flavored" numbers.
const PLAYERS = [
  {
    name: 'Rahim',
    color: 'yellow',
    guess: () => String(Math.floor(Math.random() * 50000 + 5000)),   // big, usually wrong
  },
  {
    name: 'Fatima',
    color: 'green',
    guess: () => String(Math.floor(Math.random() * 5000 + 200)),     // more measured
  },
  {
    name: 'Karim',
    color: 'purple',
    guess: () => {
      // Either shockingly close (10–200) or hilariously far (100k+)
      return Math.random() < 0.4
        ? String(Math.floor(Math.random() * 200 + 1))
        : String(Math.floor(Math.random() * 200000 + 50000));
    },
  },
];

function log(role, msg) {
  const pad = role.padEnd(6);
  console.log(`[${pad}] ${msg}`);
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HOST ──────────────────────────────────────────────────────────────────────
async function runHost(ctx, resolveCode) {
  const page = await ctx.newPage();
  await page.goto(URL);

  await page.getByRole('button', { name: 'Host a Game' }).click();
  await page.getByRole('button', { name: 'Create Room' }).click();

  const codeEl = page.locator('[class*="code"]').filter({ hasText: /^[A-Z]{4}$/ }).first();
  await codeEl.waitFor({ timeout: 10000 });
  const code = (await codeEl.textContent()).trim();
  log('HOST', `Room ready — code: ${code}`);
  resolveCode(code);

  // Wait for all 3 players to join (playerCount shows "N joined")
  await page.waitForFunction(
    () => document.body.textContent.includes('3 joined'),
    { timeout: 30000 }
  );

  log('HOST', '3 players in — starting!');
  await page.getByRole('button', { name: 'Start Game' }).click();

  for (let round = 1; round <= ROUNDS; round++) {
    log('HOST', `━━━ Round ${round}/${ROUNDS} ━━━`);

    await page.waitForSelector('[class*="questionPhase"]', { timeout: 20000 });
    const q = await page.locator('[class*="question"]').first().textContent().catch(() => '?');
    log('HOST', `Q: ${q.trim()}`);

    // Wait for betting OR reveal
    await page.waitForFunction(
      () => document.body.textContent.includes('Correct:') || document.querySelector('[class*="bettingPhase"]'),
      { timeout: 60000 }
    );

    const isBetting = await page.$('[class*="bettingPhase"]');
    if (isBetting) {
      log('HOST', '🎲 BETTING ROUND — players are choosing who to back');
      await page.waitForFunction(
        () => document.body.textContent.includes('Correct:'),
        { timeout: 60000 }
      );
    }

    log('HOST', 'Reveal!');
    const answer = await page.locator('[class*="correctAnswer"]').textContent().catch(() => '?');
    log('HOST', answer.trim());

    if (round < ROUNDS) {
      await page.waitForSelector('[class*="scoreboardPhase"]', { timeout: 20000 });
      log('HOST', 'Scoreboard shown');
    }
  }

  log('HOST', '🏁 Game complete');
}

// ── PLAYER ────────────────────────────────────────────────────────────────────
async function runPlayer(ctx, player, codePromise) {
  const { name, guess } = player;
  const page = await ctx.newPage();
  await page.goto(URL);

  await page.getByRole('button', { name: 'Join a Game' }).click();
  const code = await codePromise;
  await page.locator('input[placeholder="Room Code"]').fill(code);
  await page.locator('input[placeholder="Your Name"]').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  log(name, `Joined room ${code}`);

  // Wait past lobby — look for text unique to each state
  await page.waitForFunction(
    () => document.body.textContent.includes('Waiting for the host') ||
          document.body.textContent.includes('Lock In'),
    { timeout: 20000 }
  );
  if (await page.evaluate(() => document.body.textContent.includes('Waiting for the host'))) {
    log(name, 'Waiting in lobby...');
    await page.waitForFunction(
      () => document.body.textContent.includes('Lock In'),
      { timeout: 60000 }
    );
  }

  for (let round = 1; round <= ROUNDS; round++) {
    log(name, `Round ${round}`);

    await page.waitForFunction(
      () => document.body.textContent.includes('Lock In'),
      { timeout: 20000 }
    );

    const myGuess = guess(round);
    await page.locator('[class*="answerInput"]').fill(myGuess);

    // Small human-like pause before submitting
    await wait(400 + Math.random() * 800);
    await page.getByRole('button', { name: 'Lock In' }).click();
    log(name, `Locked in: ${myGuess}`);

    // Wait for betting OR reveal — use text content, immune to CSS module class hashing
    await page.waitForFunction(
      () => document.body.textContent.includes('Correct Answer') ||
            document.body.textContent.includes('Who do you trust?') ||
            document.body.textContent.includes('Place Bet'),
      { timeout: 60000 }
    );

    const isBetting = await page.evaluate(() => document.body.textContent.includes('Place Bet'));

    if (isBetting) {
      log(name, 'Betting time!');
      await wait(600 + Math.random() * 1000); // deliberate pause — thinking
      const betCards = await page.locator('[class*="betCard"]').all();
      if (betCards.length > 0) {
        const pick = Math.floor(Math.random() * betCards.length);
        await betCards[pick].click();
        await wait(400);
        await page.getByRole('button', { name: 'Place Bet' }).click();
        log(name, `Bet placed (card ${pick + 1})`);
      }
      await page.waitForFunction(
        () => document.body.textContent.includes('Correct Answer'),
        { timeout: 60000 }
      );
    }

    const answer = await page.locator('[class*="revealAnswer"]').textContent().catch(() => '?');
    log(name, `Answer was: ${answer.trim()}`);

    await page.waitForFunction(
      () => document.body.textContent.includes('Your Score'),
      { timeout: 20000 }
    );
    const score = await page.locator('[class*="myScore"]').textContent().catch(() => '?');
    const rank  = await page.locator('[class*="myRank"]').textContent().catch(() => '?');
    log(name, `Score: ${score.trim()} — ${rank.trim()}`);

    if (round < ROUNDS) {
      // Wait for next question — text unique to question phase
      await page.waitForFunction(
        () => document.body.textContent.includes('Lock In'),
        { timeout: 25000 }
      );
    }
  }

  log(name, '✓ Done');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,   // fast enough to watch, slow enough to read
  });

  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // 3 player contexts — phone-sized
  const playerCtxs = await Promise.all(
    PLAYERS.map(() => browser.newContext({ viewport: { width: 390, height: 844 } }))
  );

  let resolveCode;
  const codePromise = new Promise(res => { resolveCode = res; });

  const hostDone = runHost(hostCtx, resolveCode);

  await wait(800); // let host reach lobby first

  await Promise.all([
    hostDone,
    ...PLAYERS.map((p, i) => runPlayer(playerCtxs[i], p, codePromise)),
  ]);

  log('DONE', `${ROUNDS} rounds complete — closing in 8s`);
  await wait(8000);
  await browser.close();
})();
