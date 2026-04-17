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
const ROUNDS = 10;

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

  await page.waitForFunction(
    () => document.body.textContent.includes('3 joined'),
    null,
    { timeout: 30000 }
  );
  log('HOST', '3 players in — starting!');
  await page.getByRole('button', { name: 'Start Game' }).click();

  for (let round = 1; round <= ROUNDS; round++) {
    log('HOST', `━━━ Round ${round}/${ROUNDS} ━━━`);

    // 'Answer in:' is unique to the host question phase
    await page.waitForFunction(
      () => document.body.textContent.includes('answered'),
      null,
      { timeout: 20000 }
    );
    const q = await page.locator('[class*="question"]').first().textContent().catch(() => '?');
    log('HOST', `Q: ${q.trim()}`);

    // Wait for betting or reveal — 'Correct:' is unique to reveal, 'Who do you trust?' to betting
    await page.waitForFunction(
      () => document.body.textContent.includes('Correct:') ||
            document.body.textContent.includes('Who do you trust?'),
      null,
      { timeout: 60000 }
    );
    if (await page.evaluate(() => document.body.textContent.includes('Who do you trust?'))) {
      log('HOST', '🎲 BETTING ROUND — players are choosing who to back');
      await page.waitForFunction(
        () => document.body.textContent.includes('Correct:'),
        null,
        { timeout: 60000 }
      );
    }

    log('HOST', 'Reveal!');
    const answer = await page.locator('[class*="correctAnswer"]').textContent().catch(() => '?');
    log('HOST', answer.trim());

    // After last round, wait for game over; otherwise wait for scoreboard
    if (round < ROUNDS) {
      await page.waitForFunction(
        () => document.body.textContent.includes('Scoreboard'),
        null,
        { timeout: 20000 }
      );
      log('HOST', 'Scoreboard shown');
    } else {
      await page.waitForFunction(
        () => document.body.textContent.includes('Play Again'),
        null,
        { timeout: 25000 }
      );
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
    null,
    { timeout: 20000 }
  );
  if (await page.evaluate(() => document.body.textContent.includes('Waiting for the host'))) {
    log(name, 'Waiting in lobby...');
    await page.waitForFunction(
      () => document.body.textContent.includes('Lock In'),
      null,
      { timeout: 60000 }
    );
  }

  for (let round = 1; round <= ROUNDS; round++) {
    log(name, `Round ${round}`);

    // Confirm we're in the question phase
    await page.waitForFunction(
      () => document.body.textContent.includes('Lock In'),
      null,
      { timeout: 30000 }
    );

    // Submit answer
    const myGuess = guess(round);
    await page.locator('[class*="answerInput"]').fill(myGuess);
    await wait(150 + Math.random() * 300);
    await page.getByRole('button', { name: 'Lock In' }).click({ timeout: 5000 }).catch(() => {
      log(name, '(Lock In missed — phase already moved on)');
    });
    log(name, `Locked in: ${myGuess}`);

    // ── BETTING (only on rounds 5, 10) ─────────────────────────────────────────
    // Use short click timeouts (800ms) so the block can't outlast the reveal window.
    await wait(300);
    if (await page.evaluate(() => document.body.textContent.includes('Place Bet'))) {
      log(name, 'Betting time!');
      try {
        const betCards = await page.locator('[class*="betCard"]').all();
        if (betCards.length > 0) {
          const pick = Math.floor(Math.random() * betCards.length);
          await betCards[pick].click({ timeout: 800 });
          await wait(200);
          await page.getByRole('button', { name: 'Place Bet' }).click({ timeout: 800 });
          log(name, `Bet placed (card ${pick + 1})`);
        }
      } catch {
        log(name, 'Bet click missed (phase moved on)');
      }
    }

    // ── WAIT FOR END OF ROUND ─────────────────────────────────────────────────
    // Catch reveal, scoreboard, or game over.
    // 'Lock In' = next round started = both windows were missed; still safe to
    // advance since the scoreboard wait below also resolves on 'Lock In'.
    await page.waitForFunction(
      () => {
        const t = document.body.textContent;
        return t.includes('Correct Answer') || t.includes('Your Score') ||
               t.includes('Play Again')      || t.includes('Lock In');
      },
      null,
      { timeout: 90000 }
    );

    if (await page.evaluate(() => document.body.textContent.includes('Play Again'))) {
      log(name, '🎉 Game over screen!');
      break;
    }

    const answer = await page.locator('[class*="revealAnswer"]').textContent().catch(() => '?');
    log(name, `Answer was: ${answer.trim()}`);

    // Scoreboard lasts 5s — catch it if we can, then move on
    await page.waitForFunction(
      () => document.body.textContent.includes('Scoreboard') ||
            document.body.textContent.includes('Lock In') ||
            document.body.textContent.includes('Play Again'),
      null,
      { timeout: 20000 }
    ).catch(() => {});

    const myRow = await page.locator('[class*="miniBoardMe"]').first().textContent().catch(() => '?');
    log(name, `Standing: ${myRow.trim()}`);
  }

  log(name, '✓ Done');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 20,   // minimal delay — reduces waitForFunction polling contention across 4 contexts
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
    ...PLAYERS.map((p, i) => runPlayer(playerCtxs[i], p, codePromise).catch(e => log(p.name, `⚠ ${e.message.split('\n')[0]}`))),
  ]);

  log('DONE', `${ROUNDS} rounds complete — closing in 8s`);
  await wait(8000);
  await browser.close();
})();
