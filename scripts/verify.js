#!/usr/bin/env node
/**
 * scripts/verify.js — the "did I break it" gate. Run this before you commit.
 *
 *   npm run verify           # everything (~90s)
 *   npm run verify -- --fast # skip the browser test (~60s)
 *
 * Brings the dev servers up itself if they aren't already, and leaves them in
 * the state it found them. Exits non-zero on the first failure with the output
 * that matters, so an agent can act on it without digging through logs.
 */

const { spawnSync, execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEV = path.join(__dirname, 'dev.js');
const FAST = process.argv.includes('--fast');

const results = [];
let startedServers = false;

function run(label, cmd, args, opts = {}) {
  process.stdout.write(`\n▸ ${label}\n`);
  const t = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...opts.env },
  });
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  const ok = r.status === 0;
  const out = `${r.stdout || ''}${r.stderr || ''}`;

  results.push({ label, ok, secs });
  if (ok) {
    console.log(`  ok (${secs}s)`);
  } else {
    console.log(`  FAILED (${secs}s)\n`);
    console.log(out.trim().split('\n').slice(-40).map(l => `  | ${l}`).join('\n'));
  }
  return { ok, out };
}

function devCmd(sub) {
  return execFileSync(process.execPath, [DEV, sub], { encoding: 'utf8', cwd: ROOT });
}

function serversUp() {
  try { return !/DOWN/.test(devCmd('status')); } catch { return false; }
}

function summarise() {
  console.log('\n' + '─'.repeat(52));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(34)} ${r.secs}s`);
  const failed = results.filter(r => !r.ok);
  console.log('─'.repeat(52));
  console.log(failed.length ? `\n${failed.length} check(s) failed\n` : '\nall checks passed\n');
  return failed.length;
}

function cleanup() {
  if (startedServers) {
    process.stdout.write('\n▸ stopping servers we started\n');
    try { devCmd('down'); } catch { /* best effort */ }
  }
}

(async () => {
  // 1. Question banks — pure, no servers needed, fails fastest. The mock is linted
  // by the same rules as the real bank: it is what you actually play against while
  // testing, so a broken question in it wastes a whole session.
  run('questions lint', process.execPath, ['questions/lint.js']);
  run('mock bank lint', process.execPath, ['questions/lint.js', 'questions/questions.mock.json']);

  // 2. Client build — catches import and syntax errors across every view.
  run('client build', process.execPath,
    [path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    { cwd: path.join(ROOT, 'client') });

  // 3. Servers, for the integration tests.
  if (!serversUp()) {
    process.stdout.write('\n▸ starting dev servers\n');
    try {
      console.log(devCmd('up').split('\n').map(l => `  ${l}`).join('\n'));
      startedServers = true;
    } catch (err) {
      console.error('  could not start dev servers:\n', err.stdout || err.message);
      results.push({ label: 'dev servers', ok: false, secs: '0.0' });
      cleanup();
      process.exit(summarise() ? 1 : 0);
    }
  } else {
    console.log('\n▸ dev servers already up — reusing');
  }

  // 4. The party-scale regressions: 15 players, mid-game reconnect keeping
  //    score, duplicate names, answer validation.
  run('reliability suite (15 players)', process.execPath, ['test-reliability.js']);

  // 5. Every screen fits the screen it is meant for. The host board is a TV
  //    nobody touches — there is no scrollbar to rescue an overflow, and the
  //    fifteen-player cases are the ones a change made at five silently breaks.
  if (!FAST) {
    run('fit check (every screen)', process.execPath, ['scripts/fit-check.js']);
  } else {
    console.log('\n▸ fit check — skipped (--fast)');
  }

  // 5b. What fit-check structurally cannot see: the decisions that depend on the
  //     viewport *changing*. A window dragged narrow, a phone turned over, and the
  //     44px floor under everything you tap.
  if (!FAST) {
    run('responsive check (resize + rotate)', process.execPath, ['scripts/responsive-check.js']);
  } else {
    console.log('\n▸ responsive check — skipped (--fast)');
  }

  // 6. The real browser path through the real UI.
  if (!FAST) {
    run('browser smoke (host + 2 players)', process.execPath, ['test-game.js'],
      { env: { ROUNDS: '2', BETTING: 'false' } });
  } else {
    console.log('\n▸ browser smoke — skipped (--fast)');
  }

  cleanup();
  process.exit(summarise() ? 1 : 0);
})();
