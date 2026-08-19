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
questions/       questions.json (fallback), questions.mock.json (testing), or a
                 Google Sheet CSV via QUESTIONS_SHEET_URL — see Questions source
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
length. Do not auto-switch phones with the host. This is a claim about the device, not
the role: `isPhone` in `App.jsx` is `role === 'player' || portraitPhone`, so the host's
phone landing is night too.

**Motion:** nothing eases; everything is `steps()` or linear. `prefers-reduced-motion`
and the MOTION: REDUCED setting kill shake, blink, strobe and the marquee, and keep
the reveal's stagger at 60% duration — it must still read as a sequence.

### Responsiveness

Two devices, two rules, and one breakpoint each.

**The board scales; it does not reflow.** 1280×720 authored in absolute px, `min()`
scaled to fit — a rule the ten host screens are allowed to rely on. What that cannot
survive is a portrait phone: 16:9 in a 9:19.5 window is `width/1280`, so 0.30 and a
5px header. Below **`PORTRAIT_PHONE`** (575px, portrait) the board is therefore not
drawn at all — `Stage` mounts `TurnGuard` instead and asks for the phone to be turned,
and landscape gets the board at 0.54, which is small but real. The mirror of the
player's `RotateGuard`: the phone is played upright, the board is played wide.

That breakpoint lives **only** in `hooks/useMediaQuery.js`. `Stage` decides whether to
mount the guard; `board.css` just styles it. It was a `@media` block as well, which
meant the same 575px in two files kept in step by a comment — and a breakpoint that
drifts gives you either an unreadable board with no guard, or a guard over a board
that was fine. `TurnGuard` takes an optional `onLeaveBoard`, offered only where there
is nothing to abandon (host settings before a room exists); once a room is open, the
way out is to turn the phone, not to walk out on fifteen people.

**The phone is fluid vertically and capped horizontally.** It is never scaled — black
bars down the sides of a device in the hand look broken — so instead every metric that
spends height is a `--phone-*` token, `clamp(floor, Nsvh, 844-value)`, with each
coefficient set just above its own 844 ratio so all of them saturate at 844 and the
reference phone stays pixel-identical. `svh` so the layout does not resize under a
thumb when the URL bar hides. Floors keep every tap target at 44px. Horizontally it is
capped at `--phone-w` (440px) and centred, because a player on a laptop is still
holding a controller.

**`HostLanding` is the one host screen with a phone layout** (`phone` prop, driven by
`PORTRAIT_PHONE`). It is the front door: answering somebody's first tap with a rotation
demand asks them to commit before they have been told what they are committing to. The
rotation contract starts one screen later.

**The host/player guess is live.** `useMediaQuery(BOARD_WIDTH)` rather than a
`window.innerWidth` read in a `useState` initialiser, so a window dragged narrow or a
tablet turned over changes its mind. It stops following the viewport once the player
picks a side — `chose` in `App.jsx`.

**`.hs-dialog` is the exception to "the board scales".** The pause/end overlay is
rendered beside the `Stage`, not inside it, so it is drawn at 1:1 and its pixels are
real ones. It is sized like the phone instead — fluid against the viewport, saturating
at 720 — because unconstrained it lost its header off the top of a sideways phone.
Anything else that ever renders outside the stage needs the same treatment.

---

## Branding

**Logo:** `client/public/fixed_price_logo_bitmap.png` — a price-tag icon holding a
glowing amber ৳ glyph, styled as LED signage: hard angular corners, bone (#E8E4D8)
outline, amber (#FFB423) glyph and glow, flat near-black fill. Used as the landing
hero (150px), the game-over mascot (186px), the phone's join and game-over marks
(104/118px), a 34px square crop in every host header band, and `favicon` /
`apple-touch-icon` / `og:image` in `index.html`.

No round crop — the icon follows the same `border-radius: 0` rule as everything else.
The earlier cartoon-pastel mascot was the one thing in the system with a circular
crop, because it was a photograph rather than a UI element; that carve-out went away
with it.

`EkBrandLine` is gone: every host screen carries the brand lockup inside its 46px
header band (`board/Band.jsx` → `Brand`), and the phone's header is the player's own
colour with their name in it.

---

## Local Development

```bash
npm run dev          # both servers, background, returns when ready
npm run dev:mock     # …against questions/questions.mock.json instead of the real bank
npm run dev:status   # what's running (and whether it's actually ours), and which deck
npm run dev:stop
npm run verify       # lint + build + music + reliability + fit + browser tests
npm run check:music  # every track in the manifest is really on R2
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

**The board may never contradict the scoreboard.** `outcome: 'nobody_close'` puts a
red band where the winner's band goes, so it is only claimed when there is no winner
to hide — nobody submitted. A round where everyone guessed and everyone was over 100%
out is `allWild`: still a winner, still named, still paid, with the joke moved onto
their band. It used to be the same outcome, so the TV announced that nobody was close
while the standings handed that player 3 points four seconds later.

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
  preview.jsx       ?preview=<key> — 47 screens, no backend needed
  board/            The design system (see UI / Design System)
  hooks/
    useMediaQuery.js  BOARD_WIDTH / PORTRAIT_PHONE, as state rather than a one-off read
  game/
    useGameSocket.js  One reducer owning every socket event; screens are pure
    clock.js          Server-time offset, phase remaining, second-aligned countdown
    revealBeats.js    The reveal's beat clock and per-row stagger
    cues.js           The twelve cues, synthesised; channels, scheduling, the bed
    useCues.js        Cues ↔ phase events and the reveal schedule; host only
    haptics.js        The phone's half of the cue system — vibration, not sound
    tracks.js         The music manifest: three playlists, filenames only, no imports
    music.js          The music engine — playlist switching, crossfades, failure
    avatar.js         Selfie → a 6-step ramp of the player's colour, on the phone
    useCamera.js      The viewfinder: acquire, attach, readiness, and the suspends
    settings.js       Board settings (lighting/sound/motion), localStorage
  components/JoinQR.jsx   Real QR, deep-linked with the code prefilled
  views/host/       Landing, Settings, Lobby, Intro, Finale, Question, Betting,
                    Reveal, Scoreboard, GameOver, Pause
  views/player/     Join, Avatar, Lobby, Question, Locked, Betting, Reveal,
                    Scoreboard, Status (between / spectating / reconnecting /
                    no-room / game-over), parts.jsx

scripts/
  dev.js            Background dev servers, health checks, stale-listener rescue
  verify.js         The gate: lint → build → music → reliability → fit → browser
  check-music.js    HEADs every track in tracks.js against the bucket
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

**Anything rendered outside the stage inherits nothing from it.** `.bd-word` and the
rest of the type primitives carry no colour of their own — they inherit `--bone` from
`.bd-stagewrap`. The pause/end dialog is drawn *beside* that wrapper (see
`.hs-dialog`), so it inherited the document default and rendered black on the
near-black panel. Set `color` and `font-family` explicitly on any such root.

**A CSS reset must not out-specify its own components.** `board.css` wraps its reset in `:where()`: `button { background: none }` beats `.bd-btn` on specificity and silently strips every button's fill.

**Background music only plays on the host device**, and it is armed by the host's *first* click anywhere, not by Start Game — browsers need a gesture to unlock autoplay, and the startup playlist has to be up on the landing screen. Uses Howler.js, not `new Audio()`, to avoid the Windows SMTC / OS media-session popup. Each playlist change picks a fresh track and avoids the one that pool played last, so a rematch never opens on the track it just finished.

**`ctx.state === 'running'` is the wrong gate for playing a cue.** `resume()` is
asynchronous, so for tens of milliseconds after the click that unlocks audio the state
still reads `suspended` — and every cue fired in that window is silently dropped. The
same gap reopens after every `visibilitychange` resume. `cues.js` gates on `armed`
instead: has a gesture ever happened. A resuming context honours what is scheduled
against it; one that never had a gesture only accumulates nodes that never sound.

**Every platform suspends the AudioContext and none of them resume it** — iOS on any
interruption, Android Chrome when the tab backgrounds, desktop when the lid closes. A
host that closed the laptop between rounds would come back to a silent board for the
rest of the night. `cues.js` registers its own `visibilitychange` resume at context
creation, where a caller cannot forget it.

**A past-due filter must be `at < elapsed`, not `at <= elapsed + tolerance`.** The
reveal's blackout sits at offset 0, so any tolerance at all swallows the beat the whole
sequence opens on. Entries level with `elapsed` are scheduled and clamped to the
current time by `voiceAt`.

**Session persistence:** `localStorage` stores `{ role, code, name?, settings?, hostToken? }` under `ek_daam_session`. On connect the client emits `host:rejoin` or `player:rejoin`. Cleared on `Room not found` / `Player not found in room` / `Not the host of this room` — the server restarted and lost its in-memory rooms.

**Host control is a token, not the room code.** `createRoom` mints a `hostToken` and sends it only to the socket that created the room; `host:rejoin` requires it back. Codes are 48 dictionary words, so without this anyone who guessed one took over the game — and demoted the real host, whose socket id no longer matched. It is the host's equivalent of the player's `pid`: a secret the client holds, never broadcast.

**A `<video>` cannot be mounted by the same state that carries its stream.** Rendering
it only once `getUserMedia` resolves means the ref is still null when you assign
`srcObject`, the assignment is a silent no-op, and the element then mounts with no
source — a granted permission and a dead black square. `hooks`-style acquire and
attach are two effects in `game/useCamera.js` for this reason, the element is mounted
unconditionally and hidden with opacity (iOS will not decode a frame into a
`display: none` element), and "ready" means `loadedmetadata` plus a non-zero
`videoWidth`, never merely "we have a stream".

**Avatars are lobby-only and broadcast as a delta.** `player:set_avatar` is refused once the game starts, and the room gets `player:avatar` with one player on it. It used to re-emit the whole roster — twenty 12KB avatars to twenty sockets for one player changing their mind, and it could fire mid-reveal.

**A mid-game drop keeps its seat.** 90 seconds of `reconnecting` with `seatHoldUntil`, then `dropped` — but the player stays in the roster with their score, so a phone that dies at round 6 is still on the final standings. Only a lobby no-show is removed.

**Room codes** are 4-letter Bangla-transliterated words (AMMU, CHAI, DAAL…) from a 48-word bank in `roomManager.js`, not random strings.

**Questions source:** `QUESTIONS_FILE` (a local JSON bank, path relative to the repo root) beats `QUESTIONS_SHEET_URL` (a Google Sheet "Publish to web → CSV") beats `questions/questions.json`. Column order: `question | answer | unit | category | funFact`. Every source goes through the same validation — a non-finite answer is dropped with the row named, and a bank under 20 usable questions is refused rather than starting a server that cannot run a round. Cached in memory after first load; the finale tops the deck up a round at a time from the same pool. `/health` reports which deck is loaded.

**Test against the mock bank, not the real one.** `npm run dev:mock` points the server at `questions/questions.mock.json` — 61 invented questions across all six category bands, answers spread 1 → 12.5M. Playing a test round against the real bank spends it; you cannot un-know an answer. `npm run dev:restart` puts the real one back. It restarts rather than starts because the deck is read once at boot.

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

**Music — three playlists, one per stretch of the night.** All on Cloudflare R2
(`pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev`), one folder each:

| Playlist | Folder | When | Level |
|---|---|---|---|
| `startup` | `startup-music/` | landing, settings, and the lobby filling up | 0.32 |
| `game` | `bg-music/` | under the rounds | 0.35 |
| `celebration` | `celebration-music/` | game over, for as long as the room argues about a rematch | 0.40 |

`game/tracks.js` is the manifest — filenames and levels, **no imports**, so
`scripts/check-music.js` can pull it straight into Node. `game/music.js` is the
engine: a module singleton, not React state, handed a playlist name by `App` and
owning the random pick, the crossfade, and every way a track can fail to arrive.
Screens only say which stretch they are.

Adding a track: upload it to the folder, add the filename to `tracks.js`, run
`npm run check:music`.

The whole pre-game is deliberately **one** track — cutting the music between Create
Room and the lobby would be the board changing its mind in front of everybody — and
celebration waits out the 1.2s `fanfare` cue, which is written to land on silence.

Three failure modes it is built around, because the music is the one asset nothing
else in the pipeline touches:

- **Autoplay refused.** A track can only start inside a gesture and the landing
  screen has not had one. `armMusic()` is on pointerdown/keydown for the whole
  session, not once: a `playerror` mid-game disarms, and the next click is the fix.
  Those listeners are **ungated** — gating them on `musicOn` lost the click on
  RUNNING THE BOARD INSTEAD, which is the gesture that makes `musicOn` true. The cue
  engine keeps its gate, because `unlockAudio()` builds an AudioContext and no cue is
  due for many clicks after the switch.
- **Refused after loading.** Howler defers `node.play()` to the load event when the
  sound is not loaded, so in html5 mode the first play always lands outside the
  gesture — allowed by Chrome, refused by Safari. `playerror` therefore *keeps* the
  loaded Howl and sets `blocked`; the next gesture calls `play()` on it
  synchronously. Unloading and rebuilding, which is what it used to do, reproduced
  the same miss on every click. Symptom to recognise: cues play, music never does —
  cues are synthesised and never touch a media element.
- **A track that isn't there.** A 404 strikes that URL off for the session and the
  next candidate starts; a pool with nothing playable left falls through `FALLBACK`
  to `bg-music` rather than standing in silence.
- **Phases arriving faster than audio loads.** Every load carries a generation
  stamp, so a track that finishes loading after the board moved on unloads instead
  of playing over its successor.

`game/music.js` publishes `window.__music()` in dev builds. That is not a
convenience: in html5 mode Howler keeps its `<audio>` elements in an internal pool
and never puts them in the document, and the network is not the answer either
because a second track from the same folder is served from cache with no request to
observe. `test-game.js` asserts against it.

**The twelve cues are synthesised, not sampled** — `game/cues.js`, plain Web Audio,
no files and no dependency. Every voice is a filtered noise burst or a square wave
with a 1-3ms attack, because that is what the board looks like: relays, split-flaps
and LED signage. A sampled library would have been someone else's idea of a
scoreboard bolted onto ours, and it could not be retuned by changing a number.

| Cue | Fires on |
|---|---|
| `stab` | `round:intro`, and under the winner beat |
| `clunk` | every phase change; the reveal's blackout and dim frames |
| `thunk` | each player locking in (full weight on the last), the points beat |
| `keypad` | a bet placed |
| `humRise` | the last 8s of a timed phase |
| `beep` | each of the last five seconds |
| `klaxon` | the clock beating the room; a sudden-death knockout |
| `flick` | one per character of the target, at `schedule.digitStep` |
| `tick` | one per reveal row, at its own `rowDelays()` offset |
| `crowd` | the winner beat |
| `deflate` | the winner beat when the outcome is `nobody_close` |
| `fanfare` | game over |

Plus a persistent low **bed** — the board switched on and left on. It drops for the
reveal, because the blackout is a hole in the sound as well as in the light, and for
game over, so the fanfare lands on silence.

**Cues read the same clock the pixels do.** `useCues` turns the server's reveal
`schedule` and each phase's `endsAt` into AudioContext-time offsets and hands the
whole sequence to Web Audio in one pass. Nothing counts down, ticks, or fires off a
render. Two consequences, both the same rules the visuals already obey: a host that
rejoins mid-reveal seeds from `elapsedMs` and only schedules the beats still ahead of
it, and every phase can be cut short (`killAll()` on transition, `kill('clock')` for
the narrower case of a resume rescheduling its countdown).

**Host device only.** Fifteen phones must not fight the TV, and the one on a slow
link is the one everybody hears. The phone confirms with the motor instead —
`game/haptics.js`, feature-detected, silently absent on iOS.

Gated on the same SOUND toggle as the music, and deliberately **not** on MOTION:
REDUCED — someone who kills the strobe still wants to hear the klaxon.

Audition and tune every voice at `?preview=board-cues`, including the reveal
sequence at nine players, which is the only one whose character lives in the spacing
rather than in any single sound.

---

## Testing

```bash
npm run verify              # lint -> build -> music -> reliability -> fit -> responsive -> browser
npm run verify -- --fast    # skips the three browser steps
```

| Suite | What it covers |
|---|---|
| `test-reliability.js` | Socket-level: 15 players, a mid-game drop that keeps score and colour, duplicate names, input validation, avatars, settings propagation, the clock, and the finale converging on one winner |
| `scripts/fit-check.js` | All 47 previews, at every size they have to survive — 81 checks, since a `phone` preview runs at 390×844, 375×667 and 360×640. No scrolling, nothing spilling past the stage, nothing bursting out of its parent in a vertical stack (column flex **or** grid), nothing rendering blank |
| `scripts/responsive-check.js` | What fit-check structurally cannot see: the viewport *changing*. Drag a window narrow and the role guess follows; choose a side and it stops following; turn a phone and the board appears or asks to be turned. Plus the 44px floor under every control at 320×568 |
| `test-game.js` | The real browser path: host + two phones through intro, question, betting, reveal and standings — plus the music, which nothing else can see: silent until the first gesture, one track across the whole pre-game, the switch at Start Game, ducked under every reveal and back up after, silence through the fanfare, celebration at game over, and a rematch that does not reopen on the track it just finished |
| `scripts/check-music.js` | Every filename in `game/tracks.js` HEADs 200 on R2. A typo here is the one bug with no console output and no visible symptom until game night. A 404 fails; an unreachable bucket only warns |

Browser tests select on **`data-testid`**, not text. The board is all-uppercase with
heavy letter-spacing and its copy is deliberately mutable; the previous suite also
picked a settings toggle by index among `button[aria-pressed]`, which passes while
toggling the wrong thing.

**Preview gallery** — `http://localhost:5173/?preview=index`, no backend needed. The
`PREVIEWS` map in `client/src/preview.jsx` is the single source of truth: the gallery,
`capture-screens.js` and `fit-check.js` all derive from it, so adding an entry adds it
everywhere. Keep the literal's shape (`group` and `viewport` as the first two keys) —
the other two parse it as text.

`viewport` names a *set* of sizes, not one size: `phone` means all three phone
heights. Do not add a preview whose only difference is the size it is judged at — the
gate already runs every phone screen at every phone height.

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
- **The crowd is the one cue synthesis cannot fake.** It is a filtered noise swell
  standing in for four hundred people, and it is the weakest voice in the set. A real
  recording is a one-line change: `loadCrowd(url)` in `cues.js` decodes it and every
  later winner beat uses it instead. Everything else is mechanical and belongs in an
  oscillator.
- **iOS respects the ringer switch for Web Audio.** A host on an iPad with the switch
  flipped gets a silent board and no indication why. Not worth the silent-audio-element
  hack while the host is a TV or a laptop; revisit if iPad hosting becomes real.
- Selfie capture needs a secure context. Fine on GitHub Pages; over plain http on a LAN
  the picker falls through to the upload path.
- All state is in memory — a server restart drops every live room (Render spins down
  when idle).
- No persistent accounts or history.
- Questions load once at startup; adding questions needs a restart unless
  `QUESTIONS_SHEET_URL` is set.
- Max 20 players (untested beyond that; 15 is the design target).
