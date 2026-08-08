#!/usr/bin/env node
/**
 * scripts/check-music.js — every track in the manifest is actually on R2.
 *
 *   npm run check:music
 *
 * The music is the one asset the app does not build, bundle or test: it is three
 * lists of filenames pointed at a bucket, and a typo in one of them is a silent
 * board on game night with nothing in the console to explain it. This HEADs the
 * lot.
 *
 * A 404 fails. A network problem does not — the bucket being unreachable from a
 * CI runner is not the same claim as a track being missing, and this runs inside
 * the deploy gate.
 */

const path = require('path');
const { pathToFileURL } = require('url');

const MANIFEST = path.join(__dirname, '..', 'client', 'src', 'game', 'tracks.js');
const TIMEOUT_MS = 15000;

async function head(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctl.signal });
    return { status: res.status, type: res.headers.get('content-type') || '' };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'timed out' : err.message };
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  const { PLAYLISTS, allTracks } = await import(pathToFileURL(MANIFEST).href);

  const empty = Object.entries(PLAYLISTS).filter(([, l]) => !l.tracks.length);
  const tracks = allTracks();

  if (!tracks.length) {
    console.error('no tracks configured at all — the board would be silent');
    process.exit(1);
  }

  const results = await Promise.all(tracks.map(async (t) => ({ ...t, ...(await head(t.url)) })));

  let missing = 0;
  let unreachable = 0;

  for (const key of Object.keys(PLAYLISTS)) {
    const rows = results.filter((r) => r.key === key);
    console.log(`\n${key}  (${PLAYLISTS[key].folder}/)`);
    if (!rows.length) { console.log('  — none configured'); continue; }

    for (const r of rows) {
      if (r.error) {
        unreachable += 1;
        console.log(`  ??  ${r.file}  — ${r.error}`);
      } else if (r.status === 200) {
        console.log(`  ok  ${r.file}`);
      } else {
        missing += 1;
        console.log(`  !!  ${r.file}  — HTTP ${r.status}`);
      }
    }
  }

  console.log('');
  for (const [key, list] of empty) {
    console.log(`warning: ${key} has no tracks — the board will fall back to ${list.folder === 'bg-music' ? 'silence' : 'bg-music'}. Add filenames to client/src/game/tracks.js.`);
  }

  if (unreachable) {
    console.log(`warning: ${unreachable} track(s) could not be reached — network, not necessarily missing.`);
  }

  if (missing) {
    console.error(`\n${missing} track(s) listed in the manifest are not on the bucket.`);
    process.exit(1);
  }

  console.log(`${tracks.length - unreachable}/${tracks.length} tracks verified.\n`);
})();
