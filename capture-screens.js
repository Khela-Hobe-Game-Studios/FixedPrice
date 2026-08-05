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
const SHORT_PHONE = { width: 375, height: 667 };

// The preview list is read out of the app itself rather than duplicated here,
// so adding a preview automatically adds a screenshot. preview.jsx is JSX, so
// pull the keys out of the source instead of importing it.
function previewKeys() {
  const src = fs.readFileSync(path.join(__dirname, 'client', 'src', 'preview.jsx'), 'utf8');
  const body = src.slice(src.indexOf('export const PREVIEWS'));
  const out = [];
  const re = /'([a-z0-9-]+)':\s*\{\s*\n?\s*group:\s*'(\w+)',\s*viewport:\s*'(\w+)'/g;
  let m;
  while ((m = re.exec(body))) out.push({ key: m[1], group: m[2], viewport: m[3] });
  return out;
}

// The reveal is a ~4.6s choreographed sequence; shooting it early captures a
// blackout. Everything else settles in well under a second.
function settleFor(key) {
  if (key.includes('reveal')) return 5200;
  if (key.includes('intro') || key.includes('finale')) return 1200;
  return 800;
}

const SIZES = { tv: DESKTOP, phone: PHONE, short: SHORT_PHONE };

const SHOTS = previewKeys().map(({ key, group, viewport }, i) => [
  `${group.toLowerCase()}-${String(i + 1).padStart(2, '0')}-${key}`,
  key,
  SIZES[viewport] ?? DESKTOP,
  settleFor(key),
]);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // Wipe first: a stale screenshot of a screen that no longer exists is worse
  // than no screenshot, because it is reviewed as if it were current.
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  }
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

  // The live path, which no preview covers: the board opening a real room and a
  // phone arriving through the QR deep link.
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'live-01-landing.png') });
  console.log('captured live-01-landing');

  await page.getByTestId('host-start').click();
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'live-02-settings.png') });
  console.log('captured live-02-settings');

  await page.getByTestId('save-settings').click();
  await sleep(1200);
  const code = (await page.getByTestId('room-code').textContent()).trim();
  await page.screenshot({ path: path.join(OUT, 'live-03-lobby-empty.png') });
  console.log('captured live-03-lobby-empty —', code);

  // The phone as most players actually arrive: scanned, code prefilled.
  const pctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
  const ppage = await pctx.newPage();
  await ppage.goto(`${URL}/?join=${code}`, { waitUntil: 'networkidle' });
  await sleep(700);
  await ppage.getByTestId('player-name-input').fill('Karim');
  await sleep(200);
  await ppage.screenshot({ path: path.join(OUT, 'live-04-join-phone.png') });
  console.log('captured live-04-join-phone (arrived via QR deep link)');

  await ppage.getByTestId('join-game').click();
  await sleep(800);
  await ppage.screenshot({ path: path.join(OUT, 'live-05-avatar-picker.png') });
  console.log('captured live-05-avatar-picker');

  await ppage.getByTestId('use-avatar').click();
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'live-06-lobby-one.png') });
  console.log('captured live-06-lobby-one');

  await ctx.close();
  await pctx.close();
  await browser.close();
  console.log(`\ndone — ${fs.readdirSync(OUT).length} screenshots in .screens/`);
})();
