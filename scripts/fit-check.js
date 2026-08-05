/**
 * fit-check.js — the invariant no test used to enforce.
 *
 * The host screen is a TV nobody touches: if something overflows 1280x720 there is
 * no scrollbar to save it and nobody in the room can do anything about it. The
 * fifteen-player screens are the hard cases, and they are exactly the ones a change
 * made at five players silently breaks.
 *
 * Every preview is loaded at every size it has to survive and checked for four
 * things: the document must not scroll, nothing may spill outside the stage, no
 * element may burst out of the box that is meant to contain it, and no page error
 * may have fired while it rendered.
 *
 *   node scripts/fit-check.js            all previews
 *   node scripts/fit-check.js tv-reveal  one of them
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.PREVIEW_URL || 'http://localhost:5173';
const ROOT = path.join(__dirname, '..');

/* A viewport is a list, not a size.
 *
 * The board only ever has one shape, because it is scaled to whatever it is plugged
 * into. The phone has three, because it is not scaled: it is authored at 390x844 and
 * every metric that spends height gives some back below that (tokens.css), so 844 is
 * the size that proves nothing. 667 is the SE and every small iPhone; 640 is most of
 * the cheap Android fleet, which at a Dhaka party is most of the room.
 *
 * Checking phones at 844 alone is how the question screen shipped with its guess
 * block squashed to 101px on a 640 phone, overflowing the clock through the segment
 * bar and into the keypad. */
const SIZES = {
  tv: [{ label: 'tv', width: 1280, height: 720 }],
  phone: [
    { label: 'phone', width: 390, height: 844 },
    { label: 'short', width: 375, height: 667 },
    { label: 'tiny', width: 360, height: 640 },
  ],
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

  // The parse is a regex over JSX, so an entry reformatted past the pattern simply
  // stops being checked — and the run still prints "all N screens fit", for a
  // smaller N. Count the keys independently and refuse to run if the two disagree:
  // a gate that silently shrinks is worse than one that fails.
  const declared = (body.match(/^\s{2}'[a-z0-9-]+':\s*\{/gm) ?? []).length;
  if (out.length !== declared) {
    console.error(
      `fit-check: parsed ${out.length} previews but preview.jsx declares ${declared}.\n` +
      "Keep 'group' and 'viewport' as the first two keys of each entry (see CLAUDE.md)."
    );
    process.exit(1);
  }
  return out;
}

/** Settle time — the reveal is a 4.6s sequence and only overflows once it lands. */
function settleFor(key) {
  if (key.includes('reveal')) return 5200;
  if (key.includes('intro') || key.includes('finale')) return 1200;
  return 700;
}

/** The four checks, run inside the page: does it scroll, spill, burst, or render. */
function evaluateFit(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflowY = doc.scrollHeight - window.innerHeight;
    const overflowX = doc.scrollWidth - window.innerWidth;
    const name = (el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 40),
    });

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
          spill = { over: Math.round(over), ...name(el) };
        }
      }
    }

    /* The phone's failure mode, which none of the above can see.
     *
     * .bd-phone is overflow:hidden and exactly 100dvh, so it never scrolls the
     * document and nothing ever leaves it — a screen that does not fit resolves
     * itself by squashing one flex child and letting its contents render straight
     * through the next one. That reads as overlapping text and clipped buttons and
     * passes every check we had.
     *
     * So: in anything that stacks its children vertically, a child must stay inside
     * its parent. That means column flex AND grid — grid was exempt when this was
     * written, which let .bd-rows off, and .bd-rows is what the host reveal and
     * scoreboard stack their rows in.
     *
     * Row flex and plain inline flow are deliberately out of scope. Not because
     * overflow there is fine, but because their vertical geometry is a line box: a
     * numeral at line-height 1, or the Bengali face inside a Latin wordmark, sticks
     * out of its parent's box by a few px as a matter of typography rather than
     * layout. Including them reported 30 of those and buried the real thing.
     *
     * Scrollers are exempt too: they are allowed more content than they can show. */
    const root = document.querySelector('[data-phone]') ?? stage;
    let burst = null;
    if (root) {
      for (const el of root.querySelectorAll('*')) {
        const parent = el.parentElement;
        if (!parent) continue;
        const cs = getComputedStyle(el);
        if (cs.position === 'absolute' || cs.position === 'fixed') continue;
        const pcs = getComputedStyle(parent);
        const stacks = pcs.display.includes('grid')
          || (pcs.display.includes('flex') && pcs.flexDirection.startsWith('column'));
        if (!stacks) continue;
        if (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll') continue;

        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const p = parent.getBoundingClientRect();
        const over = Math.max(p.top - r.top, r.bottom - p.bottom);
        if (over > 2 && (!burst || over > burst.over)) {
          burst = { over: Math.round(over), ...name(el), parent: name(parent).cls };
        }
      }
    }

    return { overflowY, overflowX, spill, burst, empty: doc.innerText.trim().length === 0 };
  });
}

(async () => {
  const only = process.argv.slice(2);
  const previews = readPreviews().filter((p) => only.length === 0 || only.includes(p.key));

  if (previews.length === 0) {
    console.error('fit-check: no previews matched');
    process.exit(1);
  }

  // One job per (screen, size). The phone screens are the reason this is a cross
  // product rather than a list: they have to hold at three heights, not one.
  const jobs = previews.flatMap(({ key, viewport }) =>
    (SIZES[viewport] ?? SIZES.tv).map((size) => ({ key, size }))
  );

  const browser = await chromium.launch();
  const failures = [];

  // Four at a time: the reveal alone needs a 5s settle, and ninety of those in
  // series is a gate nobody runs.
  const CONCURRENCY = 4;

  async function checkOne({ key, size }) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // A screen that cannot even be loaded is a failed check, not a crashed run. Left
    // unguarded this rejected out of Promise.all, skipped browser.close() and leaked
    // a Chromium process behind a stack trace that named no screen.
    let result;
    try {
      await page.goto(`${URL}/?preview=${key}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(settleFor(key));
      result = await evaluateFit(page);
    } catch (err) {
      failures.push(`${key} (${size.width}x${size.height}) — ${err.message.split('\n')[0]}`);
      console.log(`  FAIL ${key}: ${err.message.split('\n')[0]}`);
      await page.close().catch(() => {});
      return;
    }

    const problems = [];
    if (result.overflowY > 0) problems.push(`scrolls ${result.overflowY}px vertically`);
    if (result.overflowX > 0) problems.push(`scrolls ${result.overflowX}px horizontally`);
    if (result.spill) problems.push(`${result.spill.tag}.${result.spill.cls} spills ${result.spill.over}px past the stage`);
    if (result.burst) {
      problems.push(
        `${result.burst.tag}.${result.burst.cls} bursts ${result.burst.over}px out of .${result.burst.parent}`
      );
    }
    if (result.empty) problems.push('rendered nothing');
    if (errors.length) problems.push(errors[0].split('\n')[0]);

    const where = `${key} @ ${size.label}`;
    if (problems.length) {
      failures.push(`${where} (${size.width}x${size.height}) — ${problems.join('; ')}`);
      console.log(`  FAIL ${where}: ${problems.join('; ')}`);
    } else {
      console.log(`  ok   ${where}`);
    }

    await page.close();
  }

  const queue = [...jobs];
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) await checkOne(queue.shift());
      })
    );
  } finally {
    // Even on a launch-level failure, don't leave Chromium running.
    await browser.close().catch(() => {});
  }

  console.log('');
  if (failures.length) {
    console.log(`fit-check: ${failures.length} of ${jobs.length} checks failed`);
    process.exit(1);
  }
  console.log(`fit-check: ${previews.length} screens fit, at all ${jobs.length} sizes`);
})();
