/**
 * screenshot-game.js
 * Runs a 1-round game and captures a screenshot at every phase:
 *   - Host: question, reveal, scoreboard
 *   - Player: question (with input), locked, reveal, scoreboard
 *   - GameOver screen
 */

const { chromium } = require('playwright');

const URL = 'http://localhost:5173';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });

  const hostCtx  = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const aliceCtx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone size
  const bobCtx   = await browser.newContext({ viewport: { width: 390, height: 844 } });

  const hostPage  = await hostCtx.newPage();
  const alicePage = await aliceCtx.newPage();
  const bobPage   = await bobCtx.newPage();

  // ── CREATE ROOM ──────────────────────────────────────────────────────────────
  await hostPage.goto(URL);
  await hostPage.getByRole('button', { name: 'Host a Game' }).click();
  await hostPage.getByRole('button', { name: 'Create Room' }).click();

  const codeEl = hostPage.locator('[class*="code"]').filter({ hasText: /^[A-Z]{4}$/ }).first();
  await codeEl.waitFor({ timeout: 8000 });
  const code = (await codeEl.textContent()).trim();
  console.log('Room code:', code);

  // ── JOIN AS ALICE & BOB ───────────────────────────────────────────────────────
  for (const [page, name] of [[alicePage, 'Alice'], [bobPage, 'Bob']]) {
    await page.goto(URL);
    await page.getByRole('button', { name: 'Join a Game' }).click();
    await page.locator('input[placeholder="Room Code"]').fill(code);
    await page.locator('input[placeholder="Your Name"]').fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
    await page.waitForSelector('[class*="youBadge"], [class*="answerInput"]', { timeout: 10000 });
  }

  // Screenshot host lobby with 2 players
  await wait(500);
  await hostPage.screenshot({ path: 'screens/host-lobby-2players.png', type: 'png' });
  console.log('✓ host-lobby-2players');

  // Screenshot player lobby (Alice)
  await alicePage.screenshot({ path: 'screens/player-lobby.png', type: 'png' });
  console.log('✓ player-lobby');

  // ── START GAME ───────────────────────────────────────────────────────────────
  await hostPage.getByRole('button', { name: 'Start Game' }).click();

  // ── QUESTION PHASE ────────────────────────────────────────────────────────────
  await hostPage.waitForSelector('[class*="questionPhase"]', { timeout: 15000 });
  await alicePage.waitForSelector('[class*="answerInput"]', { timeout: 15000 });
  await wait(600);

  await hostPage.screenshot({ path: 'screens/host-question.png', type: 'png' });
  console.log('✓ host-question');

  await alicePage.screenshot({ path: 'screens/player-question.png', type: 'png' });
  console.log('✓ player-question');

  // Alice types an answer
  await alicePage.locator('[class*="answerInput"]').fill('450');
  await alicePage.screenshot({ path: 'screens/player-question-filled.png', type: 'png' });
  console.log('✓ player-question-filled');

  // Both submit — Alice first, then Bob
  await alicePage.getByRole('button', { name: 'Lock In' }).click();
  await bobPage.waitForSelector('[class*="answerInput"]', { timeout: 10000 });
  await bobPage.locator('[class*="answerInput"]').fill('8200');

  // Screenshot locked state before Bob submits
  await alicePage.waitForSelector('[class*="lockedTitle"]', { timeout: 5000 }).catch(() => {});
  await alicePage.screenshot({ path: 'screens/player-locked.png', type: 'png' }).catch(() => {});
  console.log('✓ player-locked (best effort)');

  // Bob submits — server will process immediately and send round:reveal
  await bobPage.getByRole('button', { name: 'Lock In' }).click();

  // ── BETTING ──────────────────────────────────────────────────────────────────
  // Check if betting phase (only on betting rounds). Short timeout — move on if not.
  const bettingVisible = await alicePage.waitForSelector('[class*="bettingTitle"]', { timeout: 3000 }).catch(() => null);
  if (bettingVisible) {
    await alicePage.screenshot({ path: 'screens/player-betting.png', type: 'png' });
    console.log('✓ player-betting');
    await hostPage.screenshot({ path: 'screens/host-betting.png', type: 'png' }).catch(() => {});
    console.log('✓ host-betting');
    const betButtons = await alicePage.locator('[class*="betCard"]').all();
    if (betButtons.length > 0) {
      await betButtons[0].click();
      await alicePage.screenshot({ path: 'screens/player-betting-selected.png', type: 'png' });
      console.log('✓ player-betting-selected');
      await alicePage.getByRole('button', { name: 'Place Bet' }).click();
    }
    await bobPage.waitForSelector('[class*="bettingTitle"]', { timeout: 30000 }).catch(() => {});
    const bobBets = await bobPage.locator('[class*="betCard"]').all();
    if (bobBets.length > 0) {
      await bobBets[0].click();
      await wait(300);
      await bobPage.getByRole('button', { name: 'Place Bet' }).click().catch(() => {});
    }
  }

  // ── REVEAL PHASE ─────────────────────────────────────────────────────────────
  // Fixed wait: server sends round:reveal almost instantly after all answers in.
  // 1500ms gives plenty of buffer before the 5s reveal window closes.
  await wait(1500);
  await hostPage.screenshot({ path: 'screens/host-reveal.png', type: 'png' });
  console.log('✓ host-reveal');

  await alicePage.screenshot({ path: 'screens/player-reveal.png', type: 'png' });
  console.log('✓ player-reveal');

  // ── SCOREBOARD ───────────────────────────────────────────────────────────────
  // Reveal lasts 5s total; we already consumed ~1.5s, so scoreboard is ~3.5s away.
  await wait(3800); // wait out the rest of the reveal window
  await hostPage.screenshot({ path: 'screens/host-scoreboard.png', type: 'png' });
  console.log('✓ host-scoreboard');
  await wait(400);
  await hostPage.screenshot({ path: 'screens/host-scoreboard.png', type: 'png' });
  console.log('✓ host-scoreboard');

  await alicePage.screenshot({ path: 'screens/player-scoreboard.png', type: 'png' });
  console.log('✓ player-scoreboard');

  console.log('\nAll screenshots saved to screens/');
  await wait(3000);
  await browser.close();
})();
