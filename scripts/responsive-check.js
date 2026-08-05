/**
 * responsive-check.js — the behaviour fit-check cannot see.
 *
 * fit-check proves geometry at fixed viewports. It says nothing about what happens
 * when a viewport *changes*, which is the entire bug this exists for: the landing
 * sampled window.innerWidth once into a useState initialiser, so a browser dragged
 * from desktop width down to phone width — the way anyone actually checks a layout —
 * kept rendering the 1280x720 board at 0.30 scale.
 *
 * So this drives the real app through the decisions that depend on viewport: which
 * side of the game a device is, whether the board is drawable here, and the way back
 * out if it is not. Client only — no backend needed, same as fit-check.
 *
 *   node scripts/responsive-check.js
 */

const { chromium } = require('playwright');

const URL = process.env.PREVIEW_URL || 'http://localhost:5173';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
}

const seen = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: DESKTOP });
  // The socket has no server in a client-only run; its retries are noise, not failure.
  page.on('pageerror', (e) => console.log(`  (page error) ${e.message.split('\n')[0]}`));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  check('desktop opens the board', await seen(page, '[data-stage]'));

  /* ── The bug. Narrow the window without reloading. ─────────────────────────
   *
   * The load-bearing assertion is the join screen, not [data-phone]. Both sides of
   * the game render a phone screen at this width — the host's landing has one too —
   * so `[data-phone]` is true even when the role guess is stuck, and on its own it
   * reports success for the exact regression this file exists to catch. Verified by
   * restoring the useState-initialiser version: only the join-screen check failed. */
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(400);
  check('resizing to phone width picks the player side', await seen(page, '[data-testid="join-game"]'));
  check('…rendering a phone, not a board', await seen(page, '[data-phone]') && !(await seen(page, '[data-stage]')));

  // ── Choosing to host from a phone. ────────────────────────────────────────
  await page.getByTestId('host-instead').click();
  await page.waitForTimeout(300);
  check('a phone that chooses to host gets a phone landing', await seen(page, '[data-phone]'));
  check('…not a 0.30-scale board', !(await seen(page, '[data-stage]')));

  await page.getByTestId('host-start').click();
  await page.waitForTimeout(400);
  check('the board itself asks to be turned', await seen(page, '[data-testid="turn-guard"]'));
  check('…and offers the way back out', await seen(page, '[data-testid="leave-board"]'));

  // ── Turn the phone: the board is drawable, so draw it. ────────────────────
  await page.setViewportSize(PHONE_LANDSCAPE);
  await page.waitForTimeout(400);
  check('landscape drops the guard', !(await seen(page, '[data-testid="turn-guard"]')));
  check('…and shows the board', await seen(page, '[data-stage]'));

  const scale = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('[data-stage]')).getPropertyValue('--stage-scale'))
  );
  check('…at a legible scale', scale >= 0.45, `--stage-scale was ${scale}`);

  // ── Back to portrait, and out via the escape hatch. ───────────────────────
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(400);
  await page.getByTestId('leave-board').click();
  await page.waitForTimeout(300);
  check('the way out lands on the join screen', await seen(page, '[data-testid="join-game"]'));

  // ── An explicit choice outranks the viewport from then on. ────────────────
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(400);
  check('a chosen side survives a resize', await seen(page, '[data-phone]'));

  const width = await page.evaluate(() =>
    document.querySelector('[data-phone]').getBoundingClientRect().width
  );
  check('the phone stays a phone on a desktop', width <= 460, `was ${Math.round(width)}px wide`);

  // ── Nothing tappable under 44px, on the shortest phone we support. ────────
  // Stated twice in the docs and quietly broken anyway: the segment tabs were 38px,
  // and went to 34px the first time the phone's metrics were made fluid.
  await page.setViewportSize({ width: 320, height: 568 });
  for (const key of ['ph-join', 'ph-avatar', 'ph-question', 'ph-betting', 'ph-landing']) {
    await page.goto(`${URL}/?preview=${key}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, [role="button"], input')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
        .map(({ el, r }) => `${(el.className || el.tagName).toString().trim().slice(0, 24)} @ ${Math.round(r.height)}px`)
    );
    check(`${key}: every control is 44px+ at 320x568`, small.length === 0, small.join(', '));
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log('');
  if (failed.length) {
    console.log(`responsive-check: ${failed.length} of ${results.length} checks failed`);
    process.exit(1);
  }
  console.log(`responsive-check: all ${results.length} checks passed`);
})();
