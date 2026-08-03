/**
 * capture-screens.js — screenshot every screen via preview mode.
 *
 * Host screens render at 1280x720 (a TV / shared laptop), player screens at
 * 390x844 (a phone). Reveal screens wait out their staggered card animation.
 *
 *   node capture-screens.js          # needs `cd client && npm run dev` on :5173
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'http://localhost:5173';
const OUT = path.join(__dirname, '.screens');

const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };

// [file, preview key, viewport, settle ms]
const SHOTS = [
  ['host-01-lobby-empty',    'host-lobby-empty',      DESKTOP, 600],
  ['host-02-lobby',          'host-lobby',            DESKTOP, 800],
  ['host-03-lobby-15',       'host-lobby-15',         DESKTOP, 800],
  ['host-04-question',       'host-question',         DESKTOP, 800],
  ['host-05-question-15',    'host-question-15',      DESKTOP, 800],
  ['host-06-betting',        'host-betting',          DESKTOP, 800],
  ['host-07-reveal',         'host-reveal',           DESKTOP, 4500],
  ['host-08-reveal-15',      'host-reveal-15',        DESKTOP, 8500],
  ['host-09-scoreboard',     'host-scoreboard',       DESKTOP, 800],
  ['host-10-scoreboard-15',  'host-scoreboard-15',    DESKTOP, 800],
  ['host-11-game-over',      'game-over',             DESKTOP, 1800],
  ['host-12-game-over-15',   'game-over-15',          DESKTOP, 1800],

  ['player-01-lobby',        'player-lobby',          PHONE, 800],
  ['player-02-question',     'player-question',       PHONE, 800],
  ['player-03-scale-warning','player-scale-warning',  PHONE, 800],
  ['player-04-locked',       'player-locked-guess',   PHONE, 900],
  ['player-05-betting',      'player-betting',        PHONE, 800],
  ['player-06-reveal',       'player-reveal',         PHONE, 900],
  ['player-07-scoreboard',   'player-scoreboard',     PHONE, 900],
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const [name, key, viewport, settle] of SHOTS) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${URL}/?preview=${key}`, { waitUntil: 'networkidle' });
    await sleep(settle);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    await ctx.close();
    console.log('captured', name);
  }

  // Landing screens need real interaction, and a clean context so no saved
  // session bounces us into a lobby.
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'landing-01-home.png') });
  console.log('captured landing-01-home');

  await page.getByRole('button', { name: 'Host a Game' }).click();
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'landing-02-host-settings.png') });
  console.log('captured landing-02-host-settings');

  await page.getByRole('button', { name: '← Back' }).click();
  await sleep(500);
  await page.getByRole('button', { name: 'Join a Game' }).click();
  await sleep(700);
  await page.locator('#room-code').fill('AMMU');
  await page.locator('#player-name').fill('Karim');
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'landing-03-join.png') });
  console.log('captured landing-03-join');

  // Same join form on a phone — this is what most players actually see.
  await ctx.close();
  const pctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
  const ppage = await pctx.newPage();
  await ppage.goto(`${URL}/?join=AMMU`, { waitUntil: 'networkidle' });
  await sleep(900);
  await ppage.locator('#player-name').fill('Karim');
  await sleep(300);
  await ppage.screenshot({ path: path.join(OUT, 'landing-04-join-phone-qr.png') });
  console.log('captured landing-04-join-phone-qr (arrived via QR deep link)');

  await pctx.close();
  await browser.close();
  console.log(`\ndone — ${fs.readdirSync(OUT).length} screenshots in .screens/`);
})();
