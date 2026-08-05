# Working on এক দাম — agent guide

`CLAUDE.md` describes **what the system is**. This file describes **how to work on it**:
the commands, the checks, and the traps that are expensive to rediscover.

Read this first, then `CLAUDE.md` for architecture.

---

## Start here

```bash
npm run dev            # start both servers in the background, returns when ready
npm run dev:status     # what's actually running
npm run verify         # the full gate — run before you commit
npm run dev:stop       # stop them
```

`npm run dev` is **non-blocking** — it starts both servers detached, waits until they
genuinely answer, and returns. (`npm run dev:watch` is the old blocking
`concurrently` behaviour if you want live logs in a terminal.)

If something looks wrong, `npm run dev:status` is the first thing to run. It shows the
PID we started, the PIDs actually listening on each port, and warns when they differ —
see "The stale server trap" below.

---

## The verification gate

```bash
npm run verify              # ~90s: lint + build + reliability + browser
npm run verify -- --fast    # ~60s: skips the browser test
```

It starts the dev servers if they aren't up, and stops them again if it started them.
It fails on the first problem with the last 40 lines of output, and exits non-zero.

What it runs, cheapest first:

| Step | What it protects |
|---|---|
| `questions/lint.js` | The question bank meets the quality rules |
| `vite build` | No import/syntax errors in any view |
| `test-reliability.js` | 15 players, mid-game reconnect keeps score, duplicate names, input validation, colour stability, avatars, settings, the server clock, the finale |
| `scripts/fit-check.js` | Every screen fits the screen it is meant for, and rendered at all |
| `test-game.js` | The real browser path through the real UI |

Individually:

```bash
npm run test:reliability   # socket-level, needs only the backend
npm run test:fit           # every preview at its own viewport, needs the client
npm run test:browser       # Playwright, needs both servers
npm run questions:lint     # pure, needs nothing
```

**A green `verify` is the bar for committing.** It is not a substitute for looking at
the screen — see below.

---

## Looking at the UI without a backend

```
http://localhost:5173/?preview=index
```

A gallery of all 44 screens with mock data. Each entry links to itself and states the
viewport it should be judged at. Defined in `client/src/preview.jsx` as the `PREVIEWS`
map — the gallery and `capture-screens.js` both derive from it, so **adding an entry
there automatically adds it to the gallery and the screenshot run**.

```bash
npm run screens     # capture every preview to .screens/ at the right viewport
```

Use this whenever you touch layout. Screenshots are gitignored.

---

## Rules the tests do not enforce

These are the constraints that make this a party game rather than a web app. Breaking
them produces a green test run and a broken game night.

**The host screen must never scroll — now enforced.** `npm run test:fit` loads every
preview at its declared viewport and fails on a scrolling document, on anything
spilling past the stage, and on a screen that rendered nothing. It runs inside
`verify`. The board is also authored at a fixed 1280×720 and scaled to fit (see
`board/Stage.jsx`), so an overflow hides content rather than adding a scrollbar —
which is exactly why it needs a test rather than an eyeball.

**15 players is the design target, not 5.** Layouts that look fine with the default
5-player fixtures fall apart at 15 — that is how the reveal, the scoreboard and the
game-over screen all shipped broken. Always check the `-15` variant.

**Everyone must be able to find themselves.** No "+N more players" on a shared screen.

**Player screens are glanced at, not read.** A phone, one hand, ~2 seconds of attention
between conversations.

---

## Traps

**The stale server trap (Windows).** Starting a second server while one is running fails
with `EADDRINUSE` and *exits silently* — the original keeps serving, and you debug
against code that is not running. The tell is `/health` reporting `rooms` you did not
create. `npm run dev:status` shows the real listener PIDs and flags when they are not
the ones we started. `npm run dev:stop` kills the whole tree (`taskkill /T`; killing a
bare PID does not kill children).

**socket.io serialises with JSON, so `Infinity` and `NaN` arrive as `null`.** And
`Number(null) === 0`, as do `Number('')` and `Number([])`. Any coercion of client input
must reject non-numbers explicitly rather than leaning on `Number()` — otherwise a
client sending `Infinity` scores as a guess of zero. See `parseAnswer` in
`server/src/index.js`.

**Never key game state by socket id.** Socket ids change on every reconnect. Scores,
strikes, answers and bets are keyed by the durable client-generated `pid`. Payloads
still emit it as `id`, so client code that matches on `id` keeps working.

**Re-announce on every `connect`, not the first.** `socket.once('connect', …)` looks
correct and silently kills every player who reconnects. Same for reading the session
once at module load — a player who joins fresh has no session at mount time.

**The server owns the reveal's choreography.** It sends a `schedule` of beat offsets
and the phase length that contains them; the host plays what it is told and computes
nothing. Change the sequence in `revealSchedule()` (server) and `revealBeats.js`
follows. The previous arrangement — a flat `revealMs` and a client-side stagger that
had to match it by agreement — is how the celebration could land before the winner
resolved.

**`steps(1)` is not "snap on".** It defaults to `jump-end`, whose output holds the
FROM value for the whole duration, so an element animated that way finishes its
animation still invisible. Use `step-start` to snap on, and `jump-none` for anything
whose END state matters (`dim`, `slam`, `shake`) or it freezes one step short.

**`sanitizePlayers()` before any emit of a player array.** Player objects carry a Node
`Timeout` with circular internals; emitting one raw blows the stack inside socket.io's
`hasBinary()`.

**The UI has no component-library dependency any more.** `client/src/board/` is the
design system — plain React, plain CSS, no deps. KUI is untouched upstream and still
used by the studio's other games; this client stopped consuming it in v2.0 because the
DOT MATRIX board shares no visual DNA with it. Details in `CLAUDE.md`.

**Two columns fill top-to-bottom, never row-major.** Use `SplitColumns`. Rows placed
directly into a two-column grid fill left-right and turn a roster into a checkerboard —
the one real defect design review found, and it found it twice.

**A reset must not out-specify its own components.** `board.css` wraps its reset in
`:where()` for exactly this reason: `button { background: none }` beats `.bd-btn` on
specificity and silently strips every button's fill.

**React StrictMode is on.** Effects run twice in dev. Every `socket.on` needs a matching
`socket.off` in cleanup.

---

## Changing the question bank

The bank lives in a published Google Sheet; `questions/questions.json` is the fallback
Render serves if the sheet is unavailable. **Both must pass the lint.**

```bash
node questions/lint.js                         # the local fallback
node questions/lint.js --url "<sheet csv url>"  # the live sheet
node questions/clean.js --url "<url>" --out questions/questions-clean.csv
```

`questions/audit.md` explains every rule and why it exists. The one most often got wrong:
**a time-sensitive question must state its year.** That is what makes it fair — it tells
the player what basis to estimate on. The rule requires an anchor to be *present*; it is
not about avoiding recent dates.

---

## Definition of done

1. `npm run verify` green.
2. If you touched host layout: the three `-15` previews fit 1280×720 with no overflow.
3. If you touched a question rule: both banks lint clean.
4. Commit message says what changed **and why** — the repo's history is the design
   record. No Claude/Anthropic attribution (see the workspace `CLAUDE.md`).
5. Don't push unless asked.
