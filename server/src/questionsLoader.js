/**
 * Loads questions from a published Google Sheet CSV.
 * Set QUESTIONS_SHEET_URL env var to the sheet's "Publish to web" CSV link.
 * Falls back to local questions.json if the env var is not set.
 *
 * Sheet column order (row 1 = headers, ignored):
 *   question | answer | unit | category | funFact
 */

let cachedQuestions = null;

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const rows = lines.slice(1); // skip header row

  return rows.map(line => {
    const cols = splitCSVRow(line);
    const answer = parseFloat(cols[1]);
    if (!cols[0] || isNaN(answer)) return null;
    return {
      question: cols[0].trim(),
      answer,
      unit:     (cols[2] || '').trim(),
      category: (cols[3] || 'Global').trim(),
      funFact:  (cols[4] || '').trim() || null,
    };
  }).filter(Boolean);
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

async function loadQuestions() {
  if (cachedQuestions) return cachedQuestions;

  const url = process.env.QUESTIONS_SHEET_URL;
  if (!url) {
    console.log('[questions] No QUESTIONS_SHEET_URL set — using local questions.json');
    cachedQuestions = require('../../questions/questions.json');
    return cachedQuestions;
  }

  console.log('[questions] Fetching from Google Sheet...');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();
  cachedQuestions = parseCSV(csv);
  console.log(`[questions] Loaded ${cachedQuestions.length} questions from sheet`);
  return cachedQuestions;
}

module.exports = { loadQuestions };
