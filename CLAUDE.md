# Fixed Price (এক দাম) — Agent Context

> **New here? Read [AGENTS.md](AGENTS.md) first** — it covers the commands, the
> verification gate (`npm run verify`), the preview gallery (`?preview=index`), and the
> traps that are expensive to rediscover. This file is the architecture reference.

Multiplayer party game where players estimate numbers and the closest guess wins. Host runs on a shared screen (TV/laptop), players join on their phones via a 4-letter room code.

**Live site:** https://ekdaam.khelahobe.store
**Backend:** https://fixedprice.onrender.com (Render free tier — cold starts ~30s)

---

## Architecture

```
client/          React 19 + Vite — GitHub Pages
server/          Node.js + Express + Socket.io — Render
questions/       questions.json (fallback) or Google Sheet CSV via QUESTIONS_SHEET_URL env var
```

The backend is stateful (in-memory rooms Map). Vercel/serverless won't work — must be a persistent process. Render is what's deployed.

---

## UI / Design System

**The client owns its design system: `client/src/board/`.** Plain React, plain CSS,
no dependencies. Do NOT introduce CSS modules, Tailwind, styled-components, MUI, or a
component library.

The v2.0 redesign ("DOT MATRIX") is a cricket-stadium LED scoreboard: the screen *is*
the board. Two rules hold the whole system together:

1. **Numbers are amber, words are bone.** They never swap. This is the fix for the
   worst bug in the old UI, where the correct answer and the players' guesses were
   both gold and therefore indistinguishable.
2. **Elevation is light output, not height.** No shadows, no borders, `border-radius:
   0` everywhere. A "card" is a region at a different brightness — four steps
   (100 / 55 / 32 / 12 % alpha on bone), which is why nothing needs an outline.

`@khelahobe/kui` was dropped from this client in v2.0. KUI is frozen and shares no
visual DNA with this design — matching it would have meant positional `nth-child`
overrides on a third-party DOM across 23 screens. **KUI is untouched upstream and
still used by the studio's other games.** `framer-motion` and `canvas-confetti` went
with it: nothing in this design eases, and the handoff is explicit that there is no
confetti — the board never breaks frame, brightness is the celebration.

### The board layer

| File | What it is |
|---|---|
| `board/tokens.css` | Every measured colour, band height and type size, plus day mode |
| `board/fonts.css` | Self-hosted @font-face; DotGothic16 / Barlow Condensed / Hind Siliguri |
| `board/board.css` | Primitives, the dot grid, the bezel, the keyframes |
| `board/Stage.jsx` | The 1280×720 host board, scaled to fit any TV; `PhoneScreen` for phones |
| `board/SplitColumns.jsx` | The two-wrapper-div pattern (see Gotchas) |
| `board/AvatarTile.jsx` | Monogram / selfie / sprite tile + the 8-hue player ramp |
| `board/Numeral.jsx` | `Num` and `FlapNum` (the split-flap correct answer) |
| `board/*.jsx` | Band/Brand/Marquee, SegmentBar, Countdown, KeyTile/CodeEntry, Btn, Toasts |

Screens compose from these: `views/host/` (10) and `views/player/` (13), each with
its own stylesheet (`host.css`, `player.css`).

**Fonts are self-hosted** via `@fontsource` with our own `@font-face` block, at
`font-display: block` — every position in this design is a measured value, so a
fallback face reflowing the board is worse than a beat of nothing. The Bengali face is
a **custom subset** (73 KB → 1.6 KB); if you add a Bengali string anywhere, extend the
subset command in `board/fonts.css` and regenerate, or it silently falls back.

**Typography:** `DotGothic16` for every number and machine label, `Barlow Condensed`
700/800 for every word, `Hind Siliguri` 700 for Bengali only. Numerals are Latin
everywhere, including the timer, for legibility at 3 metres.

**Language rule:** English is the interface language. Bengali appears in exactly four
places, all of them jokes or proper names — `এক দাম` in the lockup, `খেলা হবে!` /
`খেলা শেষ!` in the marquees and game over, `এক দাম!` on the winner's band, and `দেশ`
as a category name.

**Day mode:** same geometry, `:root[data-lighting="day"]` swaps the palette and kills
every glow. `AUTO` follows local time. **Phones are always night** — a phone is held
close and glanced at, and the dark board is the more legible of the two at arm's
length. Do not auto-switch phones with the host.

**Motion:** nothing eases; everything is `steps()` or linear. `prefers-reduced-motion`
and the MOTION: REDUCED setting kill shake, blink, strobe and the marquee, and keep
the reveal's stagger at 60% duration — it must still read as a sequence.

---

## Branding

**Logo:** `client/public/fixed_price_logo_bitmap.png` — cartoon-pastel mascot +
wordmark. Used as the landing hero (150px), the game-over mascot (186px), the phone's
join and game-over marks (104/118px), a 34px round crop in every host header band, and
`favicon` / `apple-touch-icon` / `og:image` in `index.html`.

The mascot's round crop is the one round thing in the system, because it is a picture
of a logo rather than a UI element.

`EkBrandLine` is gone: every host screen carries the brand lockup inside its 46px
header band (`board/Band.jsx` → `Brand`), and the phone's header is the player's own
colour with their name in it.

---

## Local Development

```bash
npm run dev          # both servers, background, returns when ready
npm run dev:status   # what's running (and whether it's actually ours)
npm run dev:stop
npm run verify       # lint + build + reliability + fit + browser tests
```

The dev servers do **not** hot-reload the backend: `scripts/dev.js` runs plain `node`,
so a change under `server/` needs `npm run dev:restart` or you are testing the old
code against the new client.

`npm run dev:watch` is the old blocking two-terminal `concurrently` setup if you want
live logs. See [AGENTS.md](AGENTS.md) for the full workflow.

`client/vite.config.js` proxies `/socket.io` to `localhost:3001` so no CORS issues locally.

For production, `client/src/socket.js` reads `VITE_SERVER_URL` env var. Set it as a **GitHub secret** named `VITE_SERVER_URL = https://fixedprice.onrender.com` — the CI workflow bakes it into the build. Without this secret, deployed users connect to their own localhost and "Create Room" does nothing.

---

## Deployment

**Frontend:** Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages. Node 20, `npm ci`. Custom domain via `client/public/CNAME` → `ekdaam.khelahobe.store`.

The workflow is `verify → build → deploy`; a failing check blocks the deploy. The gate exists because the game is played occasionally — there's no ambient traffic to reveal a broken deploy, so without it a bad push stays invisible until the next game night. The build also refuses to ship if `VITE_SERVER_URL` is unset or if `localhost:3001` survives into the bundle, which would otherwise deploy a site where Create Room silently does nothing.

**Backend:** Render auto-deploys from `main` when `server/` changes (configured in the Render dashboard, not in the repo). Free tier, so it spins down when idle — measured cold start is ~21s, which the client surfaces as a "waking up the server" toast. All state is in memory: a restart drops every live room, so avoid deploying while a game is running.

---

## Socket Event Reference

All events are bidirectional over a single Socket.io room (keyed by 4-letter code).

**Every phase event carries the server's clock:** `{ phase, serverNow, startedAt,
endsAt, durationMs }`. Clients measure their offset once per connect (`time:ping`) and
derive the remaining time from `endsAt` — nobody counts down from a number they were
handed once. See `client/src/game/clock.js`.

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `time:ping` | `clientSent` (ack) | Clock sync; ack returns `{ clientSent, serverNow }` |
| `host:create_room` | `settings` | Create a room (see Settings) |
| `host:update_settings` | `settings` | Change settings; lobby only |
| `host:rejoin` | `{ code, hostToken }` | Host reconnect; the token is required |
| `host:start_game` | — | Start (requires ≥2 players) |
| `host:skip` / `host:end_game` / `host:play_again` | — | Host controls |
| `player:join` | `{ code, name, pid }` | Join a room in LOBBY |
| `player:rejoin` | `{ code, pid, name }` | Player reconnect |
| `player:set_avatar` | `{ kind, image?, spriteId? }` | Monogram / selfie / sprite |
| `player:submit_answer` | `{ answer }` | Numeric guess |
| `player:submit_bet` | `{ targetId }` | Back a guess |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `room:created` | `{ code, settings, hostToken }` | Room opened; the token goes to this socket only |
| `player:joined` | `{ room, you }` | Join ack; `you` carries `colorIndex` + `avatar` |
| `room:updated` | `{ players }` | Roster changed |
| `player:avatar` | `{ id, avatar }` | One player's face changed (lobby only) |
| `room:settings` | `{ settings }` | Host changed the settings |
| `room:reset` | `{ players, settings }` | Rematch — same code and roster |
| `round:intro` | `{ round, total, category, isBettingRound, finale? }` | 3s category flash |
| `round:start` | `{ round, total, question, category, unit, isBettingRound, finale?, players }` | Question |
| `round:answer_count` | `{ count, total, answered[] }` | Who has locked in |
| `round:betting` | `{ options[] }` | `{id, name, guess, odds}`, randomised order |
| `round:bet_count` | `{ count, total }` | Bets placed |
| `round:reveal` | `{ ranked[], correctAnswer, unit, funFact, outcome, winnerIds, knockedOut, finale?, schedule, revealMs, scores, roundPoints }` | The reveal, with its beat schedule |
| `round:scoreboard` | `{ scoreboard[], round, total, nextCategory }` | Standings; rows carry `delta` |
| `round:finale_intro` | `{ finalists[], total }` | Sudden death begins |
| `game:over` | `{ final[], rounds, finale? }` | Final table |
| `game:paused` / `game:resumed` | `{ reason }` / timing | Host dropped / returned |
| `error` | `{ message }` | Room not found, game started, bad input… |

A `ranked` entry is `{ id, name, colorIndex, avatar, submitted, guess, distance, rank,
points, isWinner, nearMiss, wildMiss, knockedOut }` — **the server decides all of it**,
so the TV and fifteen phones cannot disagree about who was close.

Sanitised player shape (`server/src/sanitize.js`): `{ id, name, score, colorIndex,
avatar, connectionState, seatHoldUntil, eliminated }`.

---

## Game State Machine

```
LOBBY
  └─ INTRO (3s) → QUESTION (0/20/30/45s) → [BETTING (20s)] → REVEAL (~4.6s) → SCOREBOARD (5s)
       ↑                                                                            │
       └────────────────────── advanceRound() ──────────────────────────────────────┘
                                     │ (rounds exhausted)
                            FINALE_INTRO (4s)
                                     └─ sudden-death rounds until one is left → GAME_OVER
```

`advanceRound()` in `gameManager.js` is **the one place** a round ends and the next
begins. It used to be written out three times — the scoreboard timer, the host's skip,
and the resume-after-pause path — which is how a new phase ends up missing from one of
them.

All timers are `setTimeout`s stored on the room (`room._timers`) and cleared when a
phase is cut short. `beginPhase()` stamps the clock; `syncPlayerState()` re-emits the
current phase to a reconnecting socket **with real elapsed time**, including the
reveal, which used to restart its whole animation for a phone that rejoined 8s in.

---

## Scoring Rules

- Closest answer (solo) → **3 pts**
- Tied closest → **2 pts each**
- Second closest (only when one player is the sole winner) → **1 pt**
- Betting round: the winner gets +1 per player who backed them, and each correct
  bettor gets +1. Every player tied for closest pays out — not just the first one the
  sort returned, which is what used to happen.

`distance: null` means the player didn't submit — they lose nothing and win nothing.
Never use `Infinity` for distance; `JSON.stringify` turns it into `null` silently and
breaks downstream `.toLocaleString()` calls.

**The finale** (sudden death) decides placings among finalists rather than points:
see Settings. Three-strikes elimination was removed in v2.0 — knocking somebody out at
round 6 of a fifteen-round party game left them watching for ten minutes.

---

## Key Files

```
server/src/
  index.js          Socket handlers, disconnect/seat-hold, validation, rate limits
  gameManager.js    State machine, timers, scoring, reveal schedule, the finale
  roomManager.js    Rooms Map, player CRUD, colour assignment, settings, code bank
  sanitize.js       The one sanitizePlayers() — it used to be two copies
  categories.js     Category matching for the deck filter (mirrors the client's)
  questionsLoader.js  Google Sheet CSV or questions.json fallback

client/src/
  main.jsx          Mounts App (or a preview) and imports the three stylesheets
  App.jsx           The router: host branch, player branch, device heuristic
  socket.js         Socket.io singleton (autoConnect: false)
  session.js        Durable pid, session persistence, ?join= deep link
  categories.js     Category bands: name, label, fill, ink
  previewData.js    Fixtures for the gallery, in the server's exact payload shapes
  preview.jsx       ?preview=<key> — 44 screens, no backend needed
  board/            The design system (see UI / Design System)
  game/
    useGameSocket.js  One reducer owning every socket event; screens are pure
    clock.js          Server-time offset, phase remaining, second-aligned countdown
    revealBeats.js    The reveal's beat clock and per-row stagger
    avatar.js         Selfie → 2-tone posterised PNG, on the phone
    settings.js       Board settings (lighting/sound/motion), localStorage
  components/JoinQR.jsx   Real QR, deep-linked with the code prefilled
  views/host/       Landing, Settings, Lobby, Intro, Finale, Question, Betting,
                    Reveal, Scoreboard, GameOver, Pause
  views/player/     Join, Avatar, Lobby, Question, Locked, Betting, Reveal,
                    Scoreboard, Status (between / spectating / reconnecting /
                    no-room / game-over), parts.jsx

scripts/
  dev.js            Background dev servers, health checks, stale-listener rescue
  verify.js         The gate: lint → build → reliability → fit → browser
  fit-check.js      Every screen fits its viewport and rendered at all

test-game.js        Browser: host + 2 phones through every phase (data-testid)
test-reliability.js Socket: 15 players, reconnect, colours, avatars, clock, finale
capture-screens.js  Every preview to .screens/, plus the live host+phone path
```

---

## Critical Gotchas

**Player identity is a durable client-generated `pid`, never the socket id.** `client/src/session.js` mints it into `localStorage`; the client sends it on `player:join` / `player:rejoin`. The server keys `scores`, `answers` and `bets` off it and tracks the transport separately as `player.socketId`. Payloads still emit it as `id`. Socket ids change on every reconnect — keying game state off them silently reset a reconnecting player's score to 0.

**Colour is assigned by the server from a counter, never from the roster index.** `room._nextColorIndex` hands out a colour at join that is unique in the room and stable for the session. The old client derived it from the array index in `room.players`, which is filtered on removal, so one player's grace expiring re-painted everyone after them. Colour is the identity token the whole board leans on: at 3 metres a 20px face is mush and a 20px colour block is instant.

**The client must re-announce itself on every `connect`, not just the first.** `useGameSocket` uses `socket.on('connect')` reading a live session ref. It previously used `socket.once`, so socket.io's automatic reconnect (after a phone locks or switches apps) never re-emitted `player:rejoin` — the new socket wasn't in the room and the player silently stopped receiving the game.

**`sanitizePlayers()` is mandatory before any Socket.io emit of player arrays.** Player objects carry `_disconnectTimer` (a Node.js Timeout with circular linked-list internals). Emitting them raw causes `RangeError: Maximum call stack size exceeded` inside `hasBinary()`. It lives in `server/src/sanitize.js` — one copy, because two copies is how a field added for the UI lands on some payloads and not others.

**Every countdown derives from the server's clock.** Phase events carry `endsAt`; the client measures its offset once per connect and computes the rest. Never hand a client a number of seconds and let it count down — a slow socket, a backgrounded tab and a mid-phase rejoin each drift differently. `useCountdown` also ticks on the second boundary rather than every 1000ms from mount: an interval started mid-second holds the last number too long, which on a 170px numeral is very visible.

**The server owns the reveal's beats.** `round:reveal` carries a `schedule` of offsets and a phase long enough to contain them. The host plays what it is given and computes nothing, and a phone that rejoins mid-reveal seeds from `startedAt` and lands on the right beat. The client used to time its own celebration at `min(animEnd, phaseEnd)`, which at 15 players could land the payoff before the winner resolved.

**`steps(1)` is not "snap on".** It defaults to `jump-end`, whose output holds the FROM value for the whole duration — an element animated that way finishes its animation still invisible. Use `step-start` to snap on, and `jump-none` for anything whose END state matters (`dim`, `slam`, `shake`), or it freezes one step short and the board stays shifted after the winner flash.

**Two columns fill top-to-bottom, never row-major.** Always `SplitColumns`. Rows placed directly into a two-column grid fill left-right, so a roster reads as a checkerboard and the reveal gives you every other rank down each column. Design review found this twice, which is why the pattern lives in one component.

**A CSS reset must not out-specify its own components.** `board.css` wraps its reset in `:where()`: `button { background: none }` beats `.bd-btn` on specificity and silently strips every button's fill.

**Background music only plays on the host device.** Primed on the host's Start Game click (browsers need a user gesture to unlock autoplay). Uses Howler.js (Web Audio API), not `new Audio()`, to avoid the Windows SMTC / OS media-session popup. Unloaded when the game ends so the next one opens on a different track.

**Session persistence:** `localStorage` stores `{ role, code, name?, settings?, hostToken? }` under `ek_daam_session`. On connect the client emits `host:rejoin` or `player:rejoin`. Cleared on `Room not found` / `Player not found in room` / `Not the host of this room` — the server restarted and lost its in-memory rooms.

**Host control is a token, not the room code.** `createRoom` mints a `hostToken` and sends it only to the socket that created the room; `host:rejoin` requires it back. Codes are 48 dictionary words, so without this anyone who guessed one took over the game — and demoted the real host, whose socket id no longer matched. It is the host's equivalent of the player's `pid`: a secret the client holds, never broadcast.

**Avatars are lobby-only and broadcast as a delta.** `player:set_avatar` is refused once the game starts, and the room gets `player:avatar` with one player on it. It used to re-emit the whole roster — twenty 12KB avatars to twenty sockets for one player changing their mind, and it could fire mid-reveal.

**A mid-game drop keeps its seat.** 90 seconds of `reconnecting` with `seatHoldUntil`, then `dropped` — but the player stays in the roster with their score, so a phone that dies at round 6 is still on the final standings. Only a lobby no-show is removed.

**Room codes** are 4-letter Bangla-transliterated words (AMMU, CHAI, DAAL…) from a 48-word bank in `roomManager.js`, not random strings.

**Questions source:** set `QUESTIONS_SHEET_URL` on Render to a Google Sheet "Publish to web → CSV" URL. Column order: `question | answer | unit | category | funFact`. Falls back to `questions/questions.json`. Cached in memory after first load; the finale tops the deck up a round at a time from the same pool.

**Round counter is 1-indexed in payloads but 0-indexed in server state.** `round` in `round:start` is display-ready; `currentRound` is the index.

---

## Settings

Set on the host's Settings screen (`views/host/HostSettings.jsx`), editable until the
game starts. Server-side settings are normalised in `roomManager.normalizeSettings()`,
which still accepts the pre-v2 `questionCount` / `bettingRounds` shape.

| Setting | Default | Effect |
|---|---|---|
| `rounds` | 10 | 10 / 15 / 20 questions |
| `secondsPerQuestion` | 30 | 20 / 30 / 45, or OFF — no clock, the host advances |
| `bettingFrequency` | `never` | `every3` / `every` / `never` |
| `categories` | `[]` (all) | Which categories are in the deck; empty means all |
| `finale` | `auto` | Sudden death: `off` / `auto` (8+ players) / `on` |

**The finale.** After the last normal round the top few qualify — 3 under 10 players,
5 at 10+, plus everyone level with the last qualifying score. They then play
sudden-death rounds: everyone answers, the furthest guess is knocked out, repeat until
one is left. Non-submitters forfeit first; a tie for furthest takes everyone tied
unless that would empty the board, in which case nobody goes out and the round replays
(capped at 3 such rounds). Points decide who qualified and where everyone else
finishes; the finale decides the order among finalists, in reverse knockout order.

Three more live on the host device only, in `localStorage`, because they are
properties of the room the board is standing in rather than of the game:

| Setting | Default | Effect |
|---|---|---|
| `lighting` | `auto` | AUTO (by local time) / NIGHT / DAY |
| `sound` | on | Background music on the host device |
| `motion` | `full` | REDUCED kills shake, blink, strobe and the marquee |

---

## Audio

3 tracks on Cloudflare R2 (`pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/`):
- `the_scoring_bell.mp3`
- `the_dhaka_lobby.mp3`
- `square_wave_bazaar.mp3`

Track is randomly selected in `primeMusic()` each game. Adding new tracks: upload to R2, add URL to `soundUrls` array in `App.jsx`.

---

## Testing

```bash
npm run verify              # the gate: lint -> build -> reliability -> fit -> browser
npm run verify -- --fast    # skips the two browser steps
```

| Suite | What it covers |
|---|---|
| `test-reliability.js` | Socket-level: 15 players, a mid-game drop that keeps score and colour, duplicate names, input validation, avatars, settings propagation, the clock, and the finale converging on one winner |
| `scripts/fit-check.js` | All 44 previews at their declared viewport: no scrolling, nothing spilling past the stage, nothing rendering blank |
| `test-game.js` | The real browser path: host + two phones through intro, question, betting, reveal and standings |

Browser tests select on **`data-testid`**, not text. The board is all-uppercase with
heavy letter-spacing and its copy is deliberately mutable; the previous suite also
picked a settings toggle by index among `button[aria-pressed]`, which passes while
toggling the wrong thing.

**Preview gallery** — `http://localhost:5173/?preview=index`, no backend needed. The
`PREVIEWS` map in `client/src/preview.jsx` is the single source of truth: the gallery,
`capture-screens.js` and `fit-check.js` all derive from it, so adding an entry adds it
everywhere. Keep the literal's shape (`group` and `viewport` as the first two keys) —
the other two parse it as text.

```bash
npm run screens     # every preview to .screens/, plus the live host + phone path
```

---

## KUI

This client no longer consumes `@khelahobe/kui`. The v2.0 board is a local design
system (`client/src/board/`), because the DOT MATRIX design shares no visual DNA with
KUI — no radius, no cards, no shadows, different fonts — and KUI is frozen, so every
screen would have been positional `nth-child` overrides on a third-party DOM.

**KUI itself is untouched and still used by the studio's other games.** Its repo is at
`../kui` and its own `CLAUDE.md` covers the publish pitfalls (the workflow is pinned to
pnpm v10; Deploy Docs and Publish are independent, and a green docs run does not mean
the npm publish succeeded).

If this client ever needs a new primitive it goes in `client/src/board/` — plain React,
plain CSS, tokens from `tokens.css`.

---

## Known Limitations / Future Work

- **The twelve sprite avatars do not exist.** 16x16 pixel art, 2-3 colours,
  transparent, drawn to read against both `#07090A` and a saturated fill; the subjects
  are listed in `PlayerAvatar.jsx`. The picker's SPRITE tab is visibly locked until
  they land, and they drop into the same 40px slots with no layout change. Do not
  substitute emoji or an icon font — both break the pixel grid.
- **The twelve sound cues are specified but not built** (relay clunk, mechanical flick,
  low hum, rising hum, klaxon, crowd, tick, keypad tick, lock-in thunk, countdown beep,
  category stab, fanfare). The host is the only audio source — fifteen phones must not
  fight the TV.
- Selfie capture needs a secure context. Fine on GitHub Pages; over plain http on a LAN
  the picker falls through to the upload path.
- All state is in memory — a server restart drops every live room (Render spins down
  when idle).
- No persistent accounts or history.
- Questions load once at startup; adding questions needs a restart unless
  `QUESTIONS_SHEET_URL` is set.
- Max 20 players (untested beyond that; 15 is the design target).
