#!/usr/bin/env node
/**
 * scripts/dev.js — start, stop and inspect the two dev servers.
 *
 *   node scripts/dev.js up       # start both in the background, wait until ready
 *   node scripts/dev.js down     # stop both
 *   node scripts/dev.js status   # what's running, is it healthy, which deck
 *   node scripts/dev.js restart  # down then up
 *   node scripts/dev.js logs [server|client] [lines]
 *
 * `up` and `restart` also take:
 *   --mock                 play against questions/questions.mock.json
 *   --questions=<path>     …or any other local bank
 *
 * The flag exists rather than `QUESTIONS_FILE=… npm run dev` because that syntax is
 * a parse error in PowerShell, which is where this repo is usually driven from.
 *
 * Why this exists: `npm run dev` uses concurrently, which blocks the terminal
 * forever — fine for a human with two tabs, useless for an agent that needs the
 * command to return. This starts them detached, waits for both to actually
 * answer, and can stop them again.
 *
 * The stop path matters on Windows: killing a PID does not kill the child
 * process tree, and a second `node src/index.js` that fails with EADDRINUSE
 * exits silently while the ORIGINAL server keeps serving. You then debug
 * against stale code. `taskkill /T` kills the tree; `status` shows the real
 * listener so you can tell.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUN = path.join(ROOT, '.dev');
const IS_WIN = process.platform === 'win32';

const SERVICES = {
  server: { cwd: path.join(ROOT, 'server'), args: ['src/index.js'], port: 3001, path: '/health' },
  client: { cwd: path.join(ROOT, 'client'), args: [path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5173'], port: 5173, path: '/' },
};

// Vite binds IPv6 [::1] only while the game server binds IPv4 0.0.0.0, and
// Node's `localhost` resolution picks between them inconsistently — which made
// health checks flap. Try every form before calling a service down.
const HOSTS = ['127.0.0.1', '[::1]', 'localhost'];

const MOCK_BANK = 'questions/questions.mock.json';

const pidFile = n => path.join(RUN, `${n}.pid`);
const logFile = n => path.join(RUN, `${n}.log`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** `--mock` / `--questions=<path>` → the QUESTIONS_FILE the server is started with. */
function questionsFlag(argv) {
  if (argv.includes('--mock')) return MOCK_BANK;
  const explicit = argv.find(a => a.startsWith('--questions='));
  return explicit ? explicit.slice('--questions='.length) : null;
}

async function isUp(svc) {
  for (const host of HOSTS) {
    try {
      const res = await fetch(`http://${host}:${svc.port}${svc.path}`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch { /* try the next host form */ }
  }
  return false;
}

function readPid(name) {
  try { return parseInt(fs.readFileSync(pidFile(name), 'utf8').trim(), 10) || null; }
  catch { return null; }
}

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-pid, 'SIGTERM');
  } catch { /* already gone */ }
}

// Anything holding the port that we did not start — a leftover from a previous
// session. Without this, `up` looks like it worked while serving old code.
function findPortOwner(port) {
  try {
    if (IS_WIN) {
      // Parse columns rather than substring-matching: `-p tcp` hides IPv6, and
      // Vite listens on [::1]. A naive `findstr :5173` would also match a remote
      // port or a PID that happens to contain the digits.
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        const c = line.trim().split(/\s+/);
        if (c.length < 5 || !/^TCP$/i.test(c[0]) || c[3] !== 'LISTENING') continue;
        const localPort = c[1].slice(c[1].lastIndexOf(':') + 1);
        if (localPort === String(port)) pids.add(Number(c[4]));
      }
      return [...pids].filter(Boolean);
    }
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return [...new Set(out.trim().split('\n').map(Number).filter(Boolean))];
  } catch { return []; }
}

async function up(questionsFile) {
  fs.mkdirSync(RUN, { recursive: true });

  if (questionsFile) console.log(`deck   ${questionsFile}`);

  for (const [name, svc] of Object.entries(SERVICES)) {
    if (await isUp(svc)) {
      const ours = readPid(name);
      const note = questionsFile && name === 'server'
        ? ' — run `npm run dev:restart` to pick up the deck'
        : '';
      console.log(`${name.padEnd(6)} already up on :${svc.port}${ours ? ` (pid ${ours})` : ' (not started by us)'}${note}`);
      continue;
    }

    // Port busy but not answering health — a wedged process. Clear it.
    const squatters = findPortOwner(svc.port).filter(p => p !== process.pid);
    if (squatters.length) {
      console.log(`${name.padEnd(6)} clearing stale listener(s) on :${svc.port}: ${squatters.join(', ')}`);
      squatters.forEach(killTree);
      await sleep(500);
    }

    const out = fs.openSync(logFile(name), 'a');
    // detached must be true on Windows too: a non-detached child shares this
    // process's console and is killed the moment `up` exits, so the servers
    // would report ready and then immediately vanish. windowsHide stops it
    // popping a console window.
    const child = spawn(process.execPath, svc.args, {
      cwd: svc.cwd,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, out],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        ...(questionsFile && name === 'server' ? { QUESTIONS_FILE: questionsFile } : {}),
      },
    });
    child.unref();
    fs.writeFileSync(pidFile(name), String(child.pid));
    console.log(`${name.padEnd(6)} starting (pid ${child.pid})…`);
  }

  // Wait for both to actually answer, not just for the process to exist.
  const deadline = Date.now() + 45000;
  const pending = new Set(Object.keys(SERVICES));
  while (pending.size && Date.now() < deadline) {
    for (const name of [...pending]) {
      if (await isUp(SERVICES[name])) {
        pending.delete(name);
        console.log(`${name.padEnd(6)} ready on :${SERVICES[name].port}`);
      }
    }
    if (pending.size) await sleep(500);
  }

  if (pending.size) {
    console.error(`\nnot ready: ${[...pending].join(', ')}`);
    for (const name of pending) {
      console.error(`\n--- ${name} log (last 20) ---`);
      try { console.error(fs.readFileSync(logFile(name), 'utf8').trim().split('\n').slice(-20).join('\n')); }
      catch { console.error('(no log)'); }
    }
    process.exit(1);
  }
  console.log('\nboth up — client http://localhost:5173  server http://localhost:3001');
}

function down() {
  for (const [name, svc] of Object.entries(SERVICES)) {
    const pid = readPid(name);
    if (alive(pid)) { killTree(pid); console.log(`${name.padEnd(6)} stopped (pid ${pid})`); }
    // Also clear anything else still holding the port.
    const rest = findPortOwner(svc.port).filter(p => p !== pid && p !== process.pid);
    rest.forEach(p => { killTree(p); console.log(`${name.padEnd(6)} stopped stray listener (pid ${p})`); });
    try { fs.unlinkSync(pidFile(name)); } catch { /* none */ }
  }
  console.log('down');
}

async function status() {
  for (const [name, svc] of Object.entries(SERVICES)) {
    const pid = readPid(name);
    const healthy = await isUp(svc);
    const owners = findPortOwner(svc.port);
    const ownedByUs = pid && owners.includes(pid);
    console.log(
      `${name.padEnd(6)} ${healthy ? 'UP  ' : 'DOWN'}  :${svc.port}` +
      `  pid=${pid ?? '-'}${alive(pid) ? '' : ' (dead)'}` +
      `  listeners=[${owners.join(',') || 'none'}]` +
      `${healthy && !ownedByUs ? '  <- NOT the process we started; run `down` first' : ''}`
    );
  }

  // Which deck is loaded. A server left running from a previous session serves the
  // bank it was started with, and nothing on screen would otherwise say so.
  for (const host of HOSTS) {
    try {
      const res = await fetch(`http://${host}:3001/health`, { signal: AbortSignal.timeout(1500) });
      const q = (await res.json()).questions;
      if (q) console.log(`deck   ${q.source}  (${q.count} questions)`);
      break;
    } catch { /* try the next host form */ }
  }
}

function logs(which, lines) {
  const names = which ? [which] : Object.keys(SERVICES);
  for (const name of names) {
    console.log(`--- ${name} ---`);
    try { console.log(fs.readFileSync(logFile(name), 'utf8').trim().split('\n').slice(-(lines || 40)).join('\n')); }
    catch { console.log('(no log yet)'); }
  }
}

const argv = process.argv.slice(2);
const [cmd, ...rest] = argv;
const positional = rest.filter(a => !a.startsWith('--'));
const deck = questionsFlag(argv);

(async () => {
  switch (cmd) {
    case 'up': return up(deck);
    case 'down': return down();
    case 'restart': down(); await sleep(800); return up(deck);
    case 'status': return status();
    case 'logs': return logs(positional[0], positional[1] && parseInt(positional[1], 10));
    default:
      console.log('usage: node scripts/dev.js up|down|restart|status|logs [server|client] [lines]');
      console.log('       up|restart also take --mock or --questions=<path>');
      process.exit(1);
  }
})();
