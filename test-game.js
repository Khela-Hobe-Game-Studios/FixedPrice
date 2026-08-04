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

// ─── HOST ────────────────────────────────────────────────────────────────────

async function runHost(context, resolveCode) {
  const page = await context.newPage();
  await page.goto(URL);
  log('HOST', 'board loaded');

  await page.getByTestId('host-start').click();

  // Betting cadence is a real setting now, so the test states which game it wants
  // rather than toggling whatever control happens to sit second on the screen.
  await page.getByTestId(BETTING ? 'betting-every' : 'betting-never').click();
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
  await start.click();
  log('HOST', 'game started');

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

    await page.getByTestId('score-row').first().waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
    log('HOST', 'scoreboard');
  }

  log('HOST', 'done');
  return page;
}

// ─── PLAYER ──────────────────────────────────────────────────────────────────

async function runPlayer(context, name, code) {
  const page = await context.newPage();
  // The QR deep link is the path fourteen of fifteen guests actually take.
  await page.goto(`${URL}/?join=${code}`);

  await page.getByTestId('player-name-input').fill(name);
  await page.getByTestId('join-game').click();

  await page.getByTestId('use-avatar').waitFor({ state: 'visible', timeout: PHASE_TIMEOUT });
  await page.getByTestId('use-avatar').click();
  log(name, `joined ${code}`);

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
      await page.getByTestId('place-bet').click();
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
    await Promise.all([
      hostRun,
      runPlayer(phones[0], 'Alice', code),
      runPlayer(phones[1], 'Bob', code),
    ]);
    log('DONE', `${ROUNDS_TO_PLAY} rounds complete (betting=${BETTING})`);
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
