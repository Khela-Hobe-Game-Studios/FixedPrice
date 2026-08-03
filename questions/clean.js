#!/usr/bin/env node
/**
 * questions/clean.js — produce a corrected question bank from the live Sheet.
 *
 *   node questions/clean.js --url "<sheet csv url>"   > questions-clean.csv
 *   node questions/clean.js sheet.csv --out questions/questions-clean.csv
 *
 * What it does, and why:
 *   - drops exact/near duplicates, keeping the better-worded of each pair
 *   - drops answer=0 questions (unguessable — you know it or you are wildly off)
 *   - fixes the one question whose text and unit contradict each other
 *   - backfills the year on time-sensitive questions that omit it (see NOTE)
 *   - normalises categories onto the badge vocabulary
 *   - appends the drafted questions in additions.json
 *
 * NOTE on year backfill: the unanchored Dhaka price questions are interleaved
 * with 2024-anchored ones inside the same contiguous block of the sheet (rows
 * 23-51), and 163 of the 178 dated Price questions say 2024. They are one
 * authoring batch, so they inherit (2024). Every row changed this way is listed
 * in the report so it can be spot-checked.
 */

const fs = require('fs');
const path = require('path');

// Word boundaries matter here: an unanchored "fee" matches "feet", which tagged
// "Length of the Hardinge Bridge in feet" as a time-sensitive price question.
const TIME_SENSITIVE = /\b(price|prices|cost|costs|salary|salaries|fare|fares|fee|fees|worth|revenue|population|rank|ranking|current|currently|today|subscribers|subscription|inflation)\b|\bas of\b|\bper (year|month)\b|\bmarket cap\b|\bGDP\b|\bexchange rate\b/i;
const YEAR_ANCHOR = /\b(1[89]\d{2}|20[0-3]\d)\b/;
const ASSUMED_YEAR = 2024;

const CATEGORY_MAP = {
  desh: 'Desh', price: 'Price', taka: 'Price', sports: 'Sports',
  cricket: 'Cricket', global: 'Global', 'weird facts': 'Weird Facts', weird: 'Weird Facts',
};

const STOPWORDS = new Set(['the','a','of','in','to','and','for','is','was','were','number','year',
  'years','how','many','what','on','at','by','as','it','its','with','from','an','be','has','have',
  'ever','first','most','total','single','average','approx','approximately']);

function splitCSVRow(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  return lines.slice(1).map((line, i) => {
    const c = splitCSVRow(line);
    return {
      row: i + 2,
      question: (c[0] || '').trim(),
      answer: parseFloat(c[1]),
      unit: (c[2] || '').trim(),
      category: (c[3] || '').trim(),
      funFact: (c[4] || '').trim(),
    };
  }).filter(q => q.question && Number.isFinite(q.answer));
}

const tokens = s => new Set(
  String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOPWORDS.has(w))
);

function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function clean(rows, additions) {
  const report = { dropped: [], anchored: [], recategorised: [], fixed: [] };

  // 1. category normalisation — Price/Sports/Taka/Cricket all need to reach a badge
  for (const q of rows) {
    const mapped = CATEGORY_MAP[q.category.toLowerCase()];
    if (mapped && mapped !== q.category) {
      report.recategorised.push(`row ${q.row}: "${q.category}" -> "${mapped}"`);
      q.category = mapped;
    }
  }

  // 2. the text/unit contradiction: "Number of days ... = 15 years"
  // The question ASKS for one unit while the answer is in another, e.g.
  // "Number of days Sheikh Hasina ruled ... (rounded years)" answered 15 years.
  // Match the asking phrase, not merely the presence of the word.
  for (const q of rows) {
    if (/^Number of days\b/i.test(q.question) && /^years?$/i.test(q.unit)) {
      const before = q.question;
      q.question = q.question
        .replace(/^Number of days\b/i, 'Number of years')
        .replace(/\s*\(rounded years\)\s*$/i, '');
      report.fixed.push(`row ${q.row}: "${before}" -> "${q.question}"`);
    }
  }

  // 3. drop unguessable zero answers
  let kept = rows.filter(q => {
    if (q.answer === 0) { report.dropped.push(`row ${q.row} [zero-answer]: ${q.question}`); return false; }
    return true;
  });

  // 4. drop near-duplicates, keeping the more specific (longer) wording
  const withTokens = kept.map(q => ({ q, t: tokens(q.question) }));
  const byAnswer = new Map();
  for (const item of withTokens) {
    if (!byAnswer.has(item.q.answer)) byAnswer.set(item.q.answer, []);
    byAnswer.get(item.q.answer).push(item);
  }
  const drop = new Set();
  for (const group of byAnswer.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (drop.has(group[i].q) || drop.has(group[j].q)) continue;
        if (group[i].t.size < 4 || group[j].t.size < 4) continue;
        if (jaccard(group[i].t, group[j].t) < 0.6) continue;
        // keep the longer, more specific wording
        const [keep, lose] = group[i].q.question.length >= group[j].q.question.length
          ? [group[i].q, group[j].q] : [group[j].q, group[i].q];
        drop.add(lose);
        report.dropped.push(`row ${lose.row} [near-duplicate of row ${keep.row}]: ${lose.question}`);
      }
    }
  }
  kept = kept.filter(q => !drop.has(q));

  // 5. backfill the year on time-sensitive questions that omit it
  for (const q of kept) {
    if (!TIME_SENSITIVE.test(q.question) || YEAR_ANCHOR.test(q.question)) continue;
    q.question = `${q.question} (${ASSUMED_YEAR})`;
    report.anchored.push(`row ${q.row}: ${q.question}`);
  }

  // 6. if the unit rescales the answer but the question never says so, say so.
  // Otherwise one player answers 7 and another 7,000,000 for the same belief.
  const SCALE_UNIT = /\b(lakhs?|crores?|thousands?|millions?|billions?|trillions?)\b/i;
  for (const q of kept) {
    if (!SCALE_UNIT.test(q.unit) || SCALE_UNIT.test(q.question)) continue;
    const scale = q.unit.match(SCALE_UNIT)[0].toLowerCase().replace(/s$/, '');
    const before = q.question;
    q.question = q.question.replace(/\s*(\(\d{4}\))\s*$/, '') + ` (in ${scale}s)`;
    const yearSuffix = before.match(/\s*(\(\d{4}\))\s*$/);
    if (yearSuffix) q.question += ` ${yearSuffix[1]}`;
    report.fixed.push(`row ${q.row}: "${before}" -> "${q.question}"`);
  }

  // 7. append the drafted additions, skipping any that collide with what's there
  const existing = kept.map(q => ({ q, t: tokens(q.question) }));
  let added = 0;
  for (const a of additions) {
    const t = tokens(a.question);
    const clash = existing.find(e => e.q.answer === a.answer && t.size >= 4 && e.t.size >= 4 && jaccard(e.t, t) >= 0.6);
    if (clash) {
      report.dropped.push(`addition skipped [duplicates row ${clash.q.row}]: ${a.question}`);
      continue;
    }
    kept.push({ ...a, row: `new+${++added}` });
    existing.push({ q: a, t });
  }

  return { kept, report, added };
}

async function main() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf('--url');
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const skip = new Set([urlIdx + 1, outIdx + 1].filter(i => i > 0));
  const fileArg = args.find((a, i) => !a.startsWith('--') && !skip.has(i));

  let text;
  if (urlIdx >= 0) {
    const res = await fetch(args[urlIdx + 1], { redirect: 'follow' });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    text = await res.text();
  } else if (fileArg) {
    text = fs.readFileSync(path.resolve(fileArg), 'utf8');
  } else {
    throw new Error('give a CSV path or --url <sheet csv url>');
  }

  const rows = parseCSV(text);
  const additions = JSON.parse(fs.readFileSync(path.join(__dirname, 'additions.json'), 'utf8'));
  const { kept, report, added } = clean(rows, additions);

  const csv = ['question,answer,unit,category,funFact']
    .concat(kept.map(q => [q.question, q.answer, q.unit, q.category, q.funFact].map(csvCell).join(',')))
    .join('\n');

  if (outPath) fs.writeFileSync(path.resolve(outPath), csv + '\n');
  else process.stdout.write(csv + '\n');

  const log = outPath ? console.log : console.error;
  log(`\nin:  ${rows.length} questions`);
  log(`out: ${kept.length} questions  (${report.dropped.length} dropped, ${added} added)`);
  log(`  recategorised:  ${report.recategorised.length}`);
  log(`  year-anchored:  ${report.anchored.length}`);
  log(`  text fixes:     ${report.fixed.length}`);
  if (outPath) {
    fs.writeFileSync(path.join(__dirname, 'clean-report.txt'),
      Object.entries(report).map(([k, v]) => `## ${k} (${v.length})\n${v.join('\n')}`).join('\n\n') + '\n');
    log(`\nwrote ${outPath} and questions/clean-report.txt`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
