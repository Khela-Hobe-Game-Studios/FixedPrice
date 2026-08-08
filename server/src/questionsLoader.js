/**
 * Where the deck comes from, in precedence order:
 *
 *   QUESTIONS_FILE       a local JSON file — a path relative to the repo root, or
 *                        absolute. This is the testing hatch: point it at
 *                        questions/questions.mock.json and play a whole game
 *                        without learning a single real answer.
 *   QUESTIONS_SHEET_URL  the published Google Sheet, "Publish to web" → CSV.
 *   (neither)            questions/questions.json
 *
 * Sheet column order (row 1 = headers, ignored):
 *   question | answer | unit | category | funFact
 *
 * Every source goes through the same validation on the way in. It used to be only
 * the CSV: a JSON file was `require`d and handed straight to the game, so one bad
 * answer in it became a NaN distance, which is a round with no winner, no points
 * and an empty winner band — at the point where fifteen people are looking at it.
 */

const fs = require('fs');
const path = require('path');

let cachedQuestions = null;
let source = null;

// Below this a game cannot fill even the largest question count setting.
const MIN_QUESTIONS = 20;

const ROOT = path.join(__dirname, '..', '..');

/** Drop what cannot be played, and say which row and why. */
function validate(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} is not a JSON array`);

  let skipped = 0;
  const ok = rows.map((r, i) => {
    const answer = typeof r?.answer === 'string' ? parseFloat(r.answer) : r?.answer;
    if (!r?.question || !Number.isFinite(answer)) {
      if (r?.question) console.warn(`[questions] ${label} #${i + 1} skipped — bad answer "${r.answer}": ${String(r.question).slice(0, 60)}`);
      skipped++;
      return null;
    }
    return {
      question: String(r.question).trim(),
      answer,
      unit: String(r.unit ?? '').trim(),
      category: String(r.category ?? 'Global').trim(),
      funFact: (r.funFact ? String(r.funFact).trim() : '') || null,
    };
  }).filter(Boolean);

  if (skipped) console.warn(`[questions] ${label}: skipped ${skipped} malformed entr(ies)`);
  return ok;
}

function readJsonBank(file, label) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(abs)) throw new Error(`${label} not found: ${abs}`);
  return validate(JSON.parse(fs.readFileSync(abs, 'utf8')), path.basename(abs));
}

/** What the deck was actually loaded from — surfaced on /health. */
function questionSource() {
  return source;
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const rows = lines.slice(1); // skip header row

  let skipped = 0;
  const parsed = rows.map((line, i) => {
    const cols = splitCSVRow(line);
    const answer = parseFloat(cols[1]);
    // A non-finite answer would poison the ranking maths, so drop the row and
    // say which one rather than failing silently mid-game.
    if (!cols[0] || !Number.isFinite(answer)) {
      if (cols[0]) console.warn(`[questions] row ${i + 2} skipped — bad answer "${cols[1]}": ${cols[0].slice(0, 60)}`);
      skipped++;
      return null;
    }
    return {
      question: cols[0].trim(),
      answer,
      unit:     (cols[2] || '').trim(),
      category: (cols[3] || 'Global').trim(),
      funFact:  (cols[4] || '').trim() || null,
    };
  }).filter(Boolean);

  if (skipped) console.warn(`[questions] skipped ${skipped} malformed row(s)`);
  return parsed;
}

// Handles quoted fields containing commas or newlines.
function splitCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

const DEFAULT_BANK = 'questions/questions.json';

function useDefaultBank(why) {
  console.log(`[questions] ${why} — using ${DEFAULT_BANK}`);
  cachedQuestions = readJsonBank(DEFAULT_BANK, 'default bank');
  source = DEFAULT_BANK;
  return cachedQuestions;
}

async function loadQuestions() {
  if (cachedQuestions) return cachedQuestions;

  // The override wins over the sheet on purpose: the point of setting it is to keep
  // the real bank out of this process, and a sheet URL left in the environment
  // would quietly defeat that.
  const file = process.env.QUESTIONS_FILE;
  if (file) {
    const loaded = readJsonBank(file, 'QUESTIONS_FILE');
    if (loaded.length < MIN_QUESTIONS) {
      throw new Error(`QUESTIONS_FILE "${file}" has only ${loaded.length} usable questions (need ${MIN_QUESTIONS})`);
    }
    cachedQuestions = loaded;
    source = file;
    console.log(`[questions] Loaded ${loaded.length} questions from ${file}`);
    return cachedQuestions;
  }

  const url = process.env.QUESTIONS_SHEET_URL;
  if (!url) return useDefaultBank('No QUESTIONS_FILE or QUESTIONS_SHEET_URL set');

  console.log('[questions] Fetching from Google Sheet...');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();
  const parsed = parseCSV(csv);

  // A sheet that fetched but yielded nothing (wrong tab, unpublished, HTML error
  // page) would otherwise start a server that cannot run a single round.
  if (parsed.length < MIN_QUESTIONS) {
    return useDefaultBank(`Sheet returned only ${parsed.length} usable questions`);
  }

  cachedQuestions = parsed;
  source = 'google-sheet';
  console.log(`[questions] Loaded ${cachedQuestions.length} questions from sheet`);
  return cachedQuestions;
}

module.exports = { loadQuestions, questionSource };
