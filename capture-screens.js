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

// Reveal screens stagger their cards; wait out the animation before shooting.
function settleFor(key) {
  if (key.includes('reveal') && key.endsWith('-15')) return 8500;
  if (key.includes('reveal')) return 4500;
  if (key.includes('game-over')) return 1800;
  return 800;
}

const SHOTS = previewKeys().map(({ key, group, viewport }, i) => [
  `${group.toLowerCase()}-${String(i + 1).padStart(2, '0')}-${key}`,
  key,
  viewport === 'phone' ? PHONE : DESKTOP,
  settleFor(key),
]);

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
