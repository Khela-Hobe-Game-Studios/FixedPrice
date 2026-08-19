/**
 * Is this question a Bangladeshi one?
 *
 * The bank has no such column, and the flavour dial needs one: with a room full of
 * Bangladeshis, ticking DAAM was a coin flip, because 174 of the 319 price questions
 * are denominated in US dollars — Big Mac, Netflix, a 4-pack of Energizer AAs. The
 * category filter cannot reach that, since locality cuts *across* the six bands
 * rather than along them.
 *
 * Three signals, cheapest first, and an explicit override that beats all of them:
 *
 *   1. A `local` column on the row (Sheet or JSON) — TRUE/FALSE. The bank is the
 *      right place to settle an argument about a specific question, and a Sheet
 *      edit does not need a deploy.
 *   2. Category `Desh` — always local, by definition.
 *   3. The unit: `BDT`, `lakh BDT`, `thousand BDT`, `Taka`. This is the one that
 *      does the real work in the price band, and it is exact rather than fuzzy.
 *   4. A place/name match on the question and its fun fact, for the rows that are
 *      about Bangladesh without carrying a taka figure.
 *
 * A false negative costs a slightly less local deck. A false positive puts one
 * global question in a deshi game. Neither is worth hand-tagging a thousand rows
 * for, which is what the `local` column is there to fix a row at a time.
 */

const { normCategory } = require('./categories');

const LOCAL_UNIT = /\b(bdt|taka|tk)\b/i;

/* Regex literals, not strings, and not as a matter of taste: in a plain JS string
 * `\b` is the backspace character rather than a word boundary, so the first version
 * of this list compiled `'\bdhaka\b'` into two backspaces around the word and a
 * question about Dhaka was tagged global. Nothing warns you — the RegExp builds
 * fine and simply never matches. A literal's `.source` cannot go wrong that way.
 *
 * The boundaries are load-bearing wherever a short name is a substring of an
 * unrelated word: without them "embrace" and "bracket" match BRAC, "Bengaluru"
 * matches Bengal, and "Takahashi" is a taka price. */
const LOCAL_TEXT = new RegExp([
  /bangladesh/, /\bbangla\b/, /bengali/, /\bbengal\b/, /\bdhaka\b/,
  /chittagong/, /chattogram/, /sylhet/, /khulna/, /rajshahi/, /barisal/, /barishal/,
  /rangpur/, /mymensingh/, /comilla/, /cumilla/, /bogra/, /jessore/, /narayanganj/,
  /cox'?s bazar/, /teknaf/, /sundarban/, /saint martin/, /kuakata/, /sajek/,
  /padma/, /jamuna/, /meghna/, /buriganga/, /karnaphuli/,
  /bangabandhu/, /mujib/, /sheikh hasina/, /ziaur rahman/, /ershad/, /shaheed minar/,
  /lalbagh/, /ahsan manzil/, /sonargaon/, /paharpur/, /bagerhat/, /shahbag/,
  /gulshan/, /banani/, /uttara/, /mirpur/, /motijheel/, /metro rail/,
  /ekushey/, /pohela boishakh/, /baishakh/, /liberation war/, /\b1971\b/,
  /shakib al hasan/, /tamim iqbal/, /mushfiqur/, /mashrafe/, /mustafizur/,
  /litton das/, /\bbpl\b/, /grameen/, /muhammad yunus/, /\bbrac\b/,
  /ilish/, /hilsa/, /rickshaw/, /\btaka\b/,
].map((re) => re.source).join('|'), 'i');

/** Parse the optional `local` column. Anything unrecognised means "not stated". */
function explicitLocal(raw) {
  if (typeof raw === 'boolean') return raw;
  const v = String(raw ?? '').trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'local', 'bd'].includes(v)) return true;
  if (['false', 'no', 'n', '0', 'global'].includes(v)) return false;
  return undefined;
}

function isLocal({ question, unit, category, funFact, local }) {
  const stated = explicitLocal(local);
  if (stated !== undefined) return stated;
  if (normCategory(category) === 'desh') return true;
  if (LOCAL_UNIT.test(String(unit ?? ''))) return true;
  return LOCAL_TEXT.test(`${question ?? ''} ${funFact ?? ''}`);
}

module.exports = { isLocal };
