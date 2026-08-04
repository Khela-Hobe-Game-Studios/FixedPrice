/**
 * Category vocabulary, server side.
 *
 * Two banks feed the game and they don't agree: the published Sheet uses
 * `Price` / `Sports`, the local questions.json fallback uses `Taka` / `Cricket`.
 * A host who unticks "Daam" has to have that mean the same thing whichever bank is
 * loaded, so the filter matches on the same normalised key set the client paints
 * bands from.
 *
 * The matcher table is deliberately mirrored in `client/src/categories.js` — the
 * client is ESM and this is CommonJS, and one shared module is not worth a build
 * step for eight regexes. Change both together.
 */

const CATEGORY_KEYS = ['desh', 'price', 'cricket', 'sports', 'global', 'weird'];

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

function normCategory(raw) {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase().trim();
  if (CATEGORY_KEYS.includes(v)) return v;
  return MATCHERS.find(([, re]) => re.test(v))?.[0];
}

function matchesCategory(questionCategory, key) {
  return normCategory(questionCategory) === normCategory(key);
}

module.exports = { CATEGORY_KEYS, normCategory, matchesCategory };
