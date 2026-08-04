/**
 * Category vocabulary.
 *
 * Two banks feed the game and they don't agree: the published Sheet uses
 * `Price` / `Sports`, the local questions.json fallback uses `Taka` / `Cricket`.
 * This maps every spelling either bank uses onto one key set.
 *
 * Category is the cheapest source of variety across 15-20 rounds, so here it owns a
 * full-bleed band on the host question screen, the phone header and the whole board
 * during the round intro — not the 12px pill it used to tint.
 *
 * The matcher table is mirrored in `server/src/categories.js`, which filters the
 * deck by the same keys. Change both together.
 */

export const CATEGORIES = {
  // দেশ keeps its Bengali name because that is its name. The rest are English.
  desh:    { name: 'দেশ',     band: 'দেশ · BANGLADESH', color: '#006A4E', ink: '#FFF8EC', bengali: true },
  price:   { name: 'DAAM',    band: 'DAAM · PRICES',    color: '#FFB423', ink: '#07090A' },
  cricket: { name: 'CRICKET', band: 'CRICKET',          color: '#2BE08A', ink: '#07090A' },
  sports:  { name: 'SPORTS',  band: 'SPORTS',           color: '#F42A41', ink: '#FFFFFF' },
  global:  { name: 'GLOBAL',  band: 'GLOBAL',           color: '#2E86FF', ink: '#FFFFFF' },
  weird:   { name: 'WEIRD',   band: 'WEIRD',            color: '#C46BFF', ink: '#07090A' },
};

// The betting round is its own colour, and it is the same purple as WEIRD — both
// are the board being strange on purpose.
export const BETTING_CATEGORY = {
  name: 'BETTING ROUND',
  band: 'BETTING ROUND',
  color: '#C46BFF',
  ink: '#07090A',
};

const FALLBACK = { name: 'GLOBAL', band: 'GLOBAL', color: '#2E86FF', ink: '#FFFFFF' };

// Order matters: 'cricket' must be tested before 'sports' so a bank that says
// "Cricket" keeps the bat, while anything else sporty falls through to the ball.
const MATCHERS = [
  ['desh',    /desh|bangladesh|bd\b/i],
  ['cricket', /cricket/i],
  ['sports',  /sport|football|athlet/i],
  ['price',   /price|taka|daam|cost|bazar/i],
  ['weird',   /weird|random|fact/i],
  ['global',  /global|world|inter/i],
];

export function normCategory(raw) {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase().trim();
  if (CATEGORIES[v]) return v;
  return MATCHERS.find(([, re]) => re.test(v))?.[0];
}

/** Everything a band needs to paint itself: name, label, fill and the ink on it. */
export function category(raw) {
  return CATEGORIES[normCategory(raw)] ?? FALLBACK;
}

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Shim for the pre-v2 views, which are still mounted while the phone screens are
// rebuilt. Delete with them.
export function categoryColor(key) {
  return category(key).color;
}
