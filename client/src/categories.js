/**
 * Category vocabulary.
 *
 * Two banks feed the game and they don't agree: the published Sheet uses
 * `Price` / `Sports`, the local questions.json fallback uses `Taka` / `Cricket`.
 * KUI's CategoryBadge only knows desh|cricket|taka|global|weird, so Price (314)
 * and Sports (63) — 36% of the live bank — rendered with no badge and a generic
 * accent colour. This maps every spelling either bank uses onto one key set.
 */

export const CATEGORIES = {
  desh:    { label: '🇧🇩 দেশ',     color: '#15a374' },
  price:   { label: '💰 Daam',     color: '#fbbf24' },
  cricket: { label: '🏏 Cricket',  color: '#fb923c' },
  sports:  { label: '⚽ Sports',   color: '#f97316' },
  global:  { label: '🌍 Global',   color: '#818cf8' },
  weird:   { label: '🌀 Weird',    color: '#e879f9' },
};

export const DEFAULT_CATEGORY_COLOR = 'var(--kui-accent)';

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

export function categoryColor(key) {
  return (key && CATEGORIES[key]?.color) || DEFAULT_CATEGORY_COLOR;
}
