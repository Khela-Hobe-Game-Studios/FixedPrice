#!/usr/bin/env node
/**
 * questions/lint.js — quality gate for the question bank.
 *
 * The bank is the game. A bad question doesn't crash anything, it just makes a
 * round unfair or boring, which is why these need to be caught mechanically.
 *
 *   node questions/lint.js                      # lint the local questions.json
 *   node questions/lint.js path/to/bank.csv     # lint a CSV export
 *   node questions/lint.js --url "<sheet csv>"  # lint the published Sheet
 *   node questions/lint.js --json               # machine-readable output
 *
 * Exits 1 if any ERROR-level rule fires. WARN-level rules are advisory.
 */

const fs = require('fs');
const path = require('path');

// ─── rules ───────────────────────────────────────────────────────────────────

// The Sheet uses Price/Sports; the local questions.json fallback uses Taka/Cricket.
// Both are legitimate sources, so the badge layer maps all of these — but anything
// outside this set renders with no badge at all.
const VALID_CATEGORIES = [
  'Desh', 'Price', 'Taka', 'Sports', 'Cricket', 'Global', 'Weird Facts', 'Weird',
];

const MAX_QUESTION_LEN = 95;
const TIE_PRONE_MAX = 5;

// Above this share of the bank naming the same year, the deck ages as one block.
const ANCHOR_PILEUP_SHARE = 0.25;

// A question whose answer moves over time is only fair if it says *when*.
// Without an anchor a 2024-sourced answer is scored against 2026 knowledge.
// Word boundaries matter: an unanchored "fee" matches "feet", which flagged
// "Length of the Hardinge Bridge in feet" as a time-sensitive price question.
const TIME_SENSITIVE = /\b(price|prices|cost|costs|salary|salaries|fare|fares|fee|fees|worth|revenue|population|rank|ranking|current|currently|today|subscribers|subscription|inflation)\b|\bas of\b|\bper (year|month)\b|\bmarket cap\b|\bGDP\b|\bexchange rate\b|\bnumber of (users|subscribers|employees|factories|universities|hospitals|branches)\b/i;
const YEAR_ANCHOR = /\b(1[89]\d{2}|20[0-3]\d)\b/;

// A record is a fact with an expiry date nobody wrote down. TIME_SENSITIVE catches
// the things that drift — prices, populations — but not the things that BREAK:
// "Most wickets taken in ODI cricket career" was true when it was written and is
// simply wrong the season after someone passes it, with nothing to warn you.
// A year turns it from a wrong answer into a trivia question that stays right.
const BREAKABLE_RECORD = /\b(most|fewest|highest|lowest|fastest|best[- ]selling|top[- ]selling|world record|record for|all[- ]time)\b|\b(career|total) (goals|runs|wickets|centuries|titles|awards|trophies|wins)\b|\bnumber of (goals|titles|awards|trophies|ballon|grand slams?|world cups?)\b/i;

// …except where the superlative is about the physical world, which is not going to
// be beaten by anyone this decade. "Highest peak in Bangladesh" needs no year.
const SETTLED_SUPERLATIVE = /\b(mountain|peak|ocean|sea|river|desert|planet|moon|star|volcano|island|lake|waterfall|tree|animal|insect|species|element|bone|muscle|organ|continent|glacier)\b/i;

// Units that silently rescale the answer. Mixing "lakh BDT" with "BDT" turns a
// round into a reading-comprehension test — a misread is a 100,000x miss.
const SCALE_UNIT = /\b(lakhs?|crores?|thousands?|millions?|billions?|trillions?)\b/i;

const STOPWORDS = new Set(['the','a','of','in','to','and','for','is','was','were','number','year',
  'years','how','many','what','on','at','by','as','it','its','with','from','an','be','has','have',
  'ever','first','most','total','single','average','approx','approximately']);

// ─── loading ─────────────────────────────────────────────────────────────────

function splitCSVRow(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; }
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
      rawAnswer: (c[1] || '').trim(),
      unit: (c[2] || '').trim(),
      category: (c[3] || '').trim(),
      funFact: (c[4] || '').trim(),
    };
  });
}

function fromJSON(json) {
  return json.map((q, i) => ({
    row: i + 1,
    question: (q.question || '').trim(),
    answer: typeof q.answer === 'number' ? q.answer : parseFloat(q.answer),
    rawAnswer: String(q.answer ?? ''),
    unit: (q.unit || '').trim(),
    category: (q.category || '').trim(),
    funFact: (q.funFact || '').trim(),
  }));
}

// ─── checks ──────────────────────────────────────────────────────────────────

function tokens(s) {
  return new Set(
    String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function lint(rows) {
  const findings = [];
  const add = (level, rule, q, detail) =>
    findings.push({ level, rule, row: q.row, question: q.question, detail });

  const valid = [];

  for (const q of rows) {
    if (!q.question) { add('ERROR', 'empty-question', q, 'no question text'); continue; }
    if (!Number.isFinite(q.answer)) {
      add('ERROR', 'bad-answer', q, `answer "${q.rawAnswer}" is not a number`);
      continue;
    }
    valid.push(q);

    if (!q.unit) add('ERROR', 'missing-unit', q, 'unit is required — it labels the input');
    if (!q.funFact) add('WARN', 'missing-funfact', q, 'reveal screen will have no payoff');

    if (!VALID_CATEGORIES.includes(q.category)) {
      add('ERROR', 'unknown-category', q,
        `"${q.category}" is not one of ${VALID_CATEGORIES.join(', ')} — renders with no badge`);
    }

    if (q.answer === 0) {
      add('ERROR', 'zero-answer', q, 'unguessable — you either know it or you are wildly off');
    } else if (Math.abs(q.answer) <= TIE_PRONE_MAX) {
      add('WARN', 'tie-prone', q,
        `answer ${q.answer} is too small for estimation spread — expect mass ties`);
    }

    if (TIME_SENSITIVE.test(q.question) && !YEAR_ANCHOR.test(q.question)) {
      add('ERROR', 'missing-year-anchor', q,
        'time-sensitive but states no year — players cannot know what basis to estimate on');
    } else if (BREAKABLE_RECORD.test(q.question)
               && !SETTLED_SUPERLATIVE.test(q.question)
               && !YEAR_ANCHOR.test(q.question)) {
      // WARN, not ERROR: unlike a price, the answer is still right until the day it
      // isn't, and there is no way to tell from here which day that is.
      add('WARN', 'breakable-record', q,
        'a record with no year on it — correct until someone breaks it, then silently wrong');
    }

    if (SCALE_UNIT.test(q.unit)) {
      const questionStatesScale = SCALE_UNIT.test(q.question);
      add(questionStatesScale ? 'WARN' : 'ERROR', 'scale-ambiguous', q,
        `unit "${q.unit}" rescales the answer${questionStatesScale ? '' : ' and the question never says so'}`);
    }

    if (q.question.length > MAX_QUESTION_LEN) {
      add('WARN', 'too-long', q, `${q.question.length} chars — truncates on phones`);
    }

    // "Number of days ... = 15 years" — the text and the unit disagree.
    const asksDays = /\bdays?\b/i.test(q.question);
    const asksYears = /\byears?\b/i.test(q.question);
    if (asksDays && /^years?$/i.test(q.unit) && !asksYears) {
      add('ERROR', 'unit-contradiction', q,
        `question asks for days but unit is "${q.unit}"`);
    }
  }

  /* Bank shape, not row quality: how concentrated the anchor years are.
   *
   * Anchoring a question to a year is what stops it going wrong, so the fix for
   * staleness pushes every new row towards naming one. The failure mode that
   * creates is a bank written in one sitting and stamped with one year — 349 of
   * these 1042 rows say 2024 — which does not go WRONG, it goes uniformly old.
   * Every third question opening "in 2024…" reads as a history quiz rather than
   * a guessing game, and because they all age together there is no gradual
   * signal, just a night where the whole deck suddenly feels dated.
   *
   * The cure is spread rather than removal: a bank anchored across 1995-2026 is
   * permanently correct AND permanently current-feeling, and past-anchored prices
   * ("a Nokia 1100 in 2005") are the better question anyway — everyone can
   * estimate one, where nobody can estimate this month's streaming tier. */
  const anchors = {};
  for (const q of valid) {
    const m = q.question.match(YEAR_ANCHOR);
    if (m) anchors[m[0]] = (anchors[m[0]] || 0) + 1;
  }
  const [topYear, topCount] = Object.entries(anchors).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (topCount && topCount / valid.length > ANCHOR_PILEUP_SHARE) {
    findings.push({
      level: 'WARN',
      rule: 'anchor-year-pileup',
      row: '—',
      question: `${topCount} questions are anchored to ${topYear}`,
      detail: `${((topCount / valid.length) * 100).toFixed(0)}% of the bank names one year, so it ages as a block — spread new rows across other years`,
    });
  }

  // Near-duplicates: same answer plus heavy token overlap.
  const withTokens = valid.map(q => ({ q, t: tokens(q.question) }));
  const byAnswer = new Map();
  for (const item of withTokens) {
    const k = item.q.answer;
    if (!byAnswer.has(k)) byAnswer.set(k, []);
    byAnswer.get(k).push(item);
  }
  for (const group of byAnswer.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        // Short questions overlap by chance ("FIFA World Cups won by Germany"
        // vs "FIFA Women's World Cups won by the USA" both answer 4), so require
        // enough distinct content on both sides before calling it a duplicate.
        if (group[i].t.size < 4 || group[j].t.size < 4) continue;
        const sim = jaccard(group[i].t, group[j].t);
        if (sim >= 0.6) {
          findings.push({
            level: sim >= 0.9 ? 'ERROR' : 'WARN',
            rule: 'near-duplicate',
            row: group[j].q.row,
            question: group[j].q.question,
            detail: `${(sim * 100).toFixed(0)}% overlap with row ${group[i].q.row}: "${group[i].q.question}"`,
          });
        }
      }
    }
  }

  return { findings, valid };
}

// ─── report ──────────────────────────────────────────────────────────────────

function report(findings, valid, asJSON) {
  if (asJSON) {
    console.log(JSON.stringify({ total: valid.length, findings }, null, 2));
    return findings.some(f => f.level === 'ERROR') ? 1 : 0;
  }

  const byRule = {};
  for (const f of findings) (byRule[f.rule] ??= []).push(f);

  console.log(`\nLinted ${valid.length} questions — ${findings.length} findings\n`);

  const order = Object.entries(byRule).sort((a, b) => b[1].length - a[1].length);
  for (const [rule, items] of order) {
    const level = items[0].level;
    console.log(`${level === 'ERROR' ? '✗' : '!'} ${rule} — ${items.length}`);
    for (const f of items.slice(0, 5)) {
      console.log(`    row ${f.row}: ${f.question.slice(0, 70)}`);
      console.log(`      ↳ ${f.detail}`);
    }
    if (items.length > 5) console.log(`    … and ${items.length - 5} more`);
    console.log('');
  }

  const errors = findings.filter(f => f.level === 'ERROR').length;
  const warns = findings.length - errors;
  console.log(`${errors} error(s), ${warns} warning(s)\n`);
  return errors > 0 ? 1 : 0;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const asJSON = args.includes('--json');
  const urlIdx = args.indexOf('--url');
  const urlValue = urlIdx >= 0 ? args[urlIdx + 1] : null;
  const skipIdx = urlIdx >= 0 ? urlIdx + 1 : -1;
  const fileArg = args.find((a, i) => !a.startsWith('--') && i !== skipIdx);

  let rows;
  if (urlValue) {
    const res = await fetch(urlValue, { redirect: 'follow' });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    rows = parseCSV(await res.text());
  } else if (fileArg) {
    const p = path.resolve(fileArg);
    rows = p.endsWith('.json')
      ? fromJSON(JSON.parse(fs.readFileSync(p, 'utf8')))
      : parseCSV(fs.readFileSync(p, 'utf8'));
  } else {
    rows = fromJSON(require('./questions.json'));
  }

  const { findings, valid } = lint(rows);
  process.exitCode = report(findings, valid, asJSON);
}

main().catch(err => { console.error(err.message); process.exit(1); });
