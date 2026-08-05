/**
 * fit-check.js — the invariant no test used to enforce.
 *
 * The host screen is a TV nobody touches: if something overflows 1280x720 there is
 * no scrollbar to save it and nobody in the room can do anything about it. The
 * fifteen-player screens are the hard cases, and they are exactly the ones a change
 * made at five players silently breaks.
 *
 * Every preview is loaded at the size it declares and checked for three things:
 * the document must not scroll, nothing may spill outside the stage, and no page
 * error may have fired while it rendered.
 *
 *   node scripts/fit-check.js            all previews
 *   node scripts/fit-check.js tv-reveal  one of them
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.PREVIEW_URL || 'http://localhost:5173';
const ROOT = path.join(__dirname, '..');

const SIZES = {
  tv: { width: 1280, height: 720 },
  phone: { width: 390, height: 844 },
  short: { width: 375, height: 667 },
};

// Same contract capture-screens.js reads: the preview map is the source of truth
// for what exists, so this cannot drift out of date.
function readPreviews() {
  const src = fs.readFileSync(path.join(ROOT, 'client/src/preview.jsx'), 'utf8');
  const body = src.slice(src.indexOf('export const PREVIEWS'));
  const re = /'([a-z0-9-]+)':\s*\{\s*\n?\s*group:\s*'(\w+)',\s*viewport:\s*'(\w+)'/g;
  const out = [];
  let m;
  while ((m = re.exec(body))) out.push({ key: m[1], group: m[2], viewport: m[3] });
  return out;
}

/** Settle time — the reveal is a 4.6s sequence and only overflows once it lands. */
function settleFor(key) {
  if (key.includes('reveal')) return 5200;
  if (key.includes('intro') || key.includes('finale')) return 1200;
  return 700;
}

(async () => {
  const only = process.argv.slice(2);
  const previews = readPreviews().filter((p) => only.length === 0 || only.includes(p.key));

  if (previews.length === 0) {
    console.error('fit-check: no previews matched');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const failures = [];

  // Four at a time: the reveal alone needs a 5s settle, and forty-two of those in
  // series is a gate nobody runs.
  const CONCURRENCY = 4;

  async function checkOne({ key, viewport }) {
    const size = SIZES[viewport] ?? SIZES.tv;
    const page = await browser.newPage({ viewport: size });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`${URL}/?preview=${key}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(settleFor(key));

    const result = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflowY = doc.scrollHeight - window.innerHeight;
      const overflowX = doc.scrollWidth - window.innerWidth;

      // Inside the board, "fits" means fits the stage, not the window: the stage is
      // scaled, so a child hanging out of it is invisible rather than scrollable.
      const stage = document.querySelector('[data-stage]');
      let spill = null;
      if (stage) {
        const box = stage.getBoundingClientRect();
        for (const el of stage.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const over = Math.max(r.bottom - box.bottom, r.right - box.right);
          if (over > 2 && (!spill || over > spill.over)) {
            spill = {
              over: Math.round(over),
              tag: el.tagName.toLowerCase(),
              cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 40),
            };
          }
        }
      }
      return { overflowY, overflowX, spill, empty: doc.innerText.trim().length === 0 };
    });

    const problems = [];
    if (result.overflowY > 0) problems.push(`scrolls ${result.overflowY}px vertically`);
    if (result.overflowX > 0) problems.push(`scrolls ${result.overflowX}px horizontally`);
    if (result.spill) problems.push(`${result.spill.tag}.${result.spill.cls} spills ${result.spill.over}px past the stage`);
    if (result.empty) problems.push('rendered nothing');
    if (errors.length) problems.push(errors[0].split('\n')[0]);

    if (problems.length) {
      failures.push(`${key} (${size.width}x${size.height}) — ${problems.join('; ')}`);
      console.log(`  FAIL ${key}: ${problems.join('; ')}`);
    } else {
      console.log(`  ok   ${key}`);
    }

    await page.close();
  }

  const queue = [...previews];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await checkOne(queue.shift());
    })
  );

  await browser.close();

  console.log('');
  if (failures.length) {
    console.log(`fit-check: ${failures.length} of ${previews.length} screens do not fit`);
    process.exit(1);
  }
  console.log(`fit-check: all ${previews.length} screens fit`);
})();
