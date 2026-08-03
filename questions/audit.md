# Question Bank Audit

Audit of the published Google Sheet (gid `354306659`) as fetched on 2026-08-02.

**Headline:** the bank is in good structural shape — 1,036 usable rows, zero exact
duplicates, every row has a unit and a fun fact. The problems are editorial, and they
cluster in ways that specifically hurt a 15-player game.

Reproduce any number here with:

```bash
node questions/lint.js --url "<sheet csv url>"
```

---

## What was wrong

| Issue | Count | Why it matters |
|---|---:|---|
| Categories the UI can't render | 377 | `Price` (314) and `Sports` (63) matched no badge — 36% of questions showed no category at all |
| Time-sensitive with no year stated | 105 | A 2024-sourced answer guessed against 2026 knowledge is an unfair loss |
| Near-duplicate pairs | 25 | Two near-identical questions can land in the same 20-question game |
| Answer = 0 | 12 | Unguessable — you either know it or you're wildly off. ~40% were also duplicates of each other |
| Scale-ambiguous units | 108 | `lakh BDT` / `thousand USD` / `millions` — a misread is a 100,000× miss |
| Question/answer contradiction | 1 | "**Number of days** Sheikh Hasina ruled…" answered **15 years** |
| Answer ≤ 5 | 113 | No room to estimate; with 15 players everyone converges and the round is a mass tie |
| Over 95 characters | 17 | Truncates on a phone |
| Stray repeated header row | 1 | Parsed as a question |

### The category bug was the most damaging

The Sheet uses `Price` / `Sports`; the local `questions.json` fallback uses `Taka` /
`Cricket`. KUI's `CategoryBadge` knows only `desh|cricket|taka|global|weird`, so **more
than a third of all questions rendered with no badge and a generic accent colour**, and
the player's "Lock In" button lost its category tint. Fixed in code — `client/src/categories.js`
now maps every spelling either bank uses, and a local `EkCategoryBadge` covers all six
categories (a new 💰 Daam badge carries the Price set).

---

## On year anchoring

**Stating the year is a feature, not staleness.** It tells the player what basis to
estimate on. 286 of the 415 time-sensitive questions already did this and were left
alone. The defect is the other 105 that omitted it — and 73 of those are Dhaka price
questions, exactly where Bangladesh's inflation makes the omission most unfair:

> Cost of a standard Rickshaw fare from Dhanmondi 32 to Science Lab — 40 BDT
> Price of 1kg of local 'Goru' (Beef) with bones at Karwan Bazar — 780 BDT

The rule now enforced by `lint.js`:

> Every time-sensitive question (price, salary, fare, population, ranking, subscriber
> counts, "current"/"as of") must carry an explicit year in the question text.

### Why the backfill assumes 2024 — and how to check it

`clean.js` appends `(2024)` to the unanchored time-sensitive rows. That is evidenced,
not guessed:

- 163 of the 178 dated `Price` questions say **2024**.
- The unanchored Dhaka price rows are **interleaved with 2024-anchored ones inside the
  same contiguous block** of the sheet (rows 23–51: rows 23, 25, 29, 34, 39 say 2024;
  the rows between them say nothing). One authoring batch, one source, one year.

Every row changed this way is listed in `clean-report.txt` under `## anchored` so the
assumption can be spot-checked. If any of those prices actually came from a different
year, correct the year in the sheet rather than removing it.

---

## What `clean.js` produced

```
in:  1036 questions
out: 1042 questions  (44 dropped, 42 added)
  year-anchored:  105
  text fixes:       3
```

`questions-clean.csv` lints **0 errors** (down from 143). Remaining warnings are advisory:
tie-prone answers, questions that already state their own scale, and long text.

Dropped: 12 zero-answer questions, 25 near-duplicates (keeping the more specific wording
of each pair), the stray header row, and 8 of the drafted additions that turned out to
duplicate existing rows.

Added: 42 new questions in `additions.json`, weighted toward Bangladesh and toward
non-cricket sport, all year-anchored where time-sensitive and all under 95 characters.

To apply: paste `questions-clean.csv` into the Sheet as a new tab and point
`QUESTIONS_SHEET_URL` at it.

---

## Handled in code rather than by editing the bank

**Scale ambiguity (108 questions).** Deleting these would cost good content. Instead the
player's answer screen now shows the expected magnitude — *"Type the short number — e.g.
25, not 2,500,000"* — whenever the unit contains lakh/crore/thousand/million/billion. For
the two questions whose unit rescaled the answer while the text never said so, `clean.js`
appends the scale to the question.

**Tie-prone answers (113 questions).** "Number of hearts an octopus has = 3" is a good fun
fact and a bad estimation question: with 15 players everyone lands on 2–4, ties pay 2
points each, and the scoreboard flattens. Rather than cutting them, `gameManager.js` now
caps them at ~20% of any single game. Measured over 3,000 simulated 10-question games:
average 0.97 per game, never more than 2. It is a ceiling, not a quota — when the natural
draw is lower it stays lower.

**Sheet layout.** The tab has its five columns pasted five times across (25 columns). The
loader reads `cols[0..4]` so it is harmless, but `questions-clean.csv` is a clean 5-column
file.

---

## Editorial calls left to you

These are judgement, not defects, so nothing was removed:

- **Live BD politics.** Several questions cover the July 2024 uprising, Sheikh Hasina's
  ouster, and her flight to India. For a party game played by mixed Bangladeshi friend
  and family groups these are live flashpoints.
- **Adult / culture-war items.** A Kim Kardashian tape question, the Bud Light–Dylan
  Mulvaney controversy, Elon Musk smoking on a podcast. Fine for some rooms, awkward in
  others — and the host cannot preview what's coming.
- **Category balance.** After cleaning: Price 30.6%, Desh 24.0%, Global 19.6%,
  Weird Facts 19.1%, Sports 6.7%. Sports is thin and still cricket-heavy; the additions
  push against this but more would help.
- **Phrasing monotony.** 74% of questions open with one of three stems (`Number of`,
  `Year`, `Price/Cost`). Not a bug, but a room notices by round 10.
- **Geographic weighting.** Only ~31% of questions reference Bangladesh. The strongest
  material in the whole bank is the Dhaka price set — Karwan Bazar ginger, Beauty Lassi in
  Old Dhaka, the Dhanmondi 32 rickshaw fare. That is the voice worth expanding; the US
  price questions (NYC subway fares, California gasoline) are the weakest culturally.

---

## Files

| File | Purpose |
|---|---|
| `lint.js` | Re-runnable quality gate. Exits non-zero on errors. |
| `clean.js` | Produces the corrected bank + `clean-report.txt` |
| `additions.json` | The 50 drafted questions (42 survived dedupe) |
| `questions-clean.csv` | The corrected bank, ready to paste into the Sheet |
| `clean-report.txt` | Every row dropped, anchored, or rewritten |
