# Fixed Price (এক দাম) — Agent Context

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

**The client uses `@khelahobe/kui` — the studio's shared component library.** Do NOT introduce CSS modules, Tailwind, styled-components, MUI, etc. If you need a primitive that KUI doesn't have, add it upstream to KUI rather than building it inline.

- KUI package: `@khelahobe/kui` (^0.3.0 at time of writing — registry: https://www.npmjs.com/package/@khelahobe/kui)
- KUI repo: https://github.com/Khela-Hobe-Game-Studios/KUI (locally cloned at `../kui` sibling to this repo)
- KUI docs site: deployed via the KUI repo's `Deploy Docs` workflow; run `pnpm docs` in the kui repo for a local copy
- Spec: `../kui/SPEC.md` (authoritative prop signatures for every KUI component)

**Theme:** `<KuiProvider theme="fixedprice" colorMode="light">` wired in `client/src/main.jsx`. The `fixedprice` theme lives in KUI's `tokens.scss` — BD-flag green (`#006A4E`) primary, BD-flag red (`#F42A41`) secondary, gold (`#FBBF24`) accent, warm cream (`#FFF8EC`) background. Dark mode is defined but not used (light reads better against the BD-flag gradient).

**Page background:** `.ek-page` (in `client/src/index.css`) provides a radial-gradient backdrop with BD-flag colors. Every view's root uses `<div className="ek-page">`. `.ek-page--center` modifier vertically centers content.

**Game-specific components from KUI's `fixedprice` subpath:** `CategoryBadge`, `QuestionCard`, `AnswerInput`, `BettingPanel`, `RevealCard`, `FunFact`, `MiniLeaderboard`. Imported as `from '@khelahobe/kui/fixedprice'`.

**Base components from KUI:** `Button`, `Card` (compound), `Input`, `Badge`, `Avatar`, `RoomCode`, `PlayerCard`, `ProgressBar`, `Timer`, `Leaderboard`, `Podium`, `WinnerDisplay`, `LoadingDot`, `SettingsPanel`, `TitleBlock`, `PageBackground`, `ConfettiBurst`, `CountdownSplash`, `ToastStack`, `PulseRing`, `StudioCredit`, `KuiProvider`.

**Vite dedupes React** in `client/vite.config.js` — required because the file-path KUI dep we used during pre-publish dev would otherwise pull a second React copy from `../kui/packages/lib/node_modules`. With `^0.3.0` from npm this is less critical but the dedupe stays as a safety net.

---

## Branding

**Logo:** `client/public/fixed_price_logo_bitmap.png` — cartoon-pastel game logo with mascot + wordmark. Used as:
- The hero on the Landing home screen (~280px wide, scales to 70vw on mobile)
- `favicon`, `apple-touch-icon`, `og:image` in `index.html`

**`EkBrandLine` (`client/src/components/EkBrandLine.jsx`):** Small vertically-stacked "এক দাম / FIXED PRICE" wordmark pinned `position: fixed` to the top-right of the viewport. Rendered ONCE globally in `App.jsx` (outside the screen router) so it shows on every screen without per-view boilerplate. `pointer-events: none` so it never blocks clicks.

**`StudioCredit` (from KUI):** Refined "A game by Khela Hobe Game Studios" credit with an ornamental rule. Rendered in `Landing.jsx` with `fixed` prop, so it sits at the viewport bottom across all three Landing sub-screens (home / host settings / join).

---

## Local Development

```bash
# Terminal 1 — backend
cd server && npm run dev   # nodemon, port 3001

# Terminal 2 — frontend
cd client && npm run dev   # Vite, port 5173, proxies /socket.io to :3001
```

`client/vite.config.js` proxies `/socket.io` to `localhost:3001` so no CORS issues locally.

For production, `client/src/socket.js` reads `VITE_SERVER_URL` env var. Set it as a **GitHub secret** named `VITE_SERVER_URL = https://fixedprice.onrender.com` — the CI workflow bakes it into the build. Without this secret, deployed users connect to their own localhost and "Create Room" does nothing.

---

## Deployment

**Frontend:** Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds Vite and deploys to GitHub Pages automatically. Uses Node 20 + npm. Custom domain via `client/public/CNAME` → `ekdaam.khelahobe.store`.

**Backend:** Render auto-deploys from `main` when `server/` changes (configured in Render dashboard, not in the repo).

---

## Socket Event Reference

All events are bidirectional over a single Socket.io room (keyed by 4-letter code).

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `host:create_room` | `{ questionCount, eliminationMode, bettingRounds }` | Create a new room |
| `host:rejoin` | `{ code }` | Host reconnect after refresh |
| `host:start_game` | — | Start the game (requires ≥2 players) |
| `player:join` | `{ code, name }` | Join a room in LOBBY state |
| `player:rejoin` | `{ code, name }` | Player reconnect after refresh |
| `player:submit_answer` | `{ answer }` | Submit numeric guess |
| `player:submit_bet` | `{ targetId }` | Bet on another player (betting rounds) |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `room:created` | `{ code }` | Room successfully created |
| `player:joined` | `{ room }` | Ack for joining, includes sanitized room |
| `room:updated` | `{ players }` | Player list changed (join/leave/reconnect) |
| `round:start` | `{ round, total, question, category, unit, isBettingRound, players, timer }` | New round begins |
| `round:answer_count` | `{ count, total }` | Live count of submitted answers |
| `round:betting` | `{ ranked: [{id, name}], timer }` | Betting phase (player names only, no guesses yet) |
| `round:reveal` | `{ ranked, correctAnswer, unit, funFact, bets, scores, strikes }` | Reveal all answers |
| `round:scoreboard` | `{ scoreboard: [{id, name, score, strikes, eliminated}] }` | Between-round scoreboard |
| `game:over` | `{ final: [{id, name, score, strikes}] }` | Game ended |
| `error` | `{ message }` | Error (Room not found, Game already started, etc.) |

---

## Game State Machine

```
LOBBY → IN_GAME (startGame called)
  └─ QUESTION (30s timer)
       └─ [BETTING (20s, every 5th round if enabled)]
            └─ REVEAL (5s)
                 └─ SCOREBOARD (5s)
                      └─ QUESTION (next round) or GAME_OVER
```

Server-side state lives in `room.state`. All timers are `setTimeout`s stored on the room object (`room._questionTimer`, `room._bettingTimer`, etc.) and cleared when players advance a phase early.

**`syncPlayerState(socket, room)`** in `gameManager.js` re-emits the correct event for the current phase to a reconnecting socket, with a time-corrected timer value.

---

## Scoring Rules

- Closest answer (solo) → **3 pts**
- Tied closest → **2 pts each**
- Second closest (only when one player is sole winner) → **1 pt**
- Betting round bonus: winner gets +1 pt per player who bet on them; each correct bettor gets +1 pt
- Elimination mode: furthest answer each round gets a strike; 3 strikes = eliminated

`distance: null` means the player didn't submit — they lose nothing but win nothing. Never use `Infinity` for distance; `JSON.stringify` converts it to `null` silently and breaks downstream `.toLocaleString()` calls.

---

## Key Files

```
server/src/
  index.js          Socket.io handlers, disconnect/reconnect logic, sanitizePlayers()
  gameManager.js    Full game state machine, all timers, scoring, syncPlayerState()
  roomManager.js    In-memory rooms Map, player CRUD, Bangla word bank for room codes
  questionsLoader.js  Loads from Google Sheet CSV or falls back to questions.json

client/
  index.html        Favicon + apple-touch-icon + og:image wiring for the logo
  vite.config.js    React dedupe (file:-dep era safety net), /socket.io proxy
  public/
    fixed_price_logo_bitmap.png  Game logo (mascot + wordmark)
    CNAME                         ekdaam.khelahobe.store custom-domain pin
  src/
    main.jsx          Mounts <KuiProvider theme="fixedprice" colorMode="light">
    App.jsx           Screen router, session persistence, primeMusic(), global EkBrandLine
    socket.js         Socket.io client singleton (autoConnect: false)
    index.css         Page background gradient, .ek-page / .ek-page--center / .ek-bengali
    preview.jsx       ?preview=<name> URL switch with mock fixtures for screenshot validation
    components/
      EkBrandLine.jsx  Global top-right 'এক দাম / FIXED PRICE' wordmark
    views/
      Landing.jsx       Home (logo hero) + host settings + join form, KUI StudioCredit fixed at bottom
      HostLobby.jsx     Host waiting room with KUI RoomCode + SettingsPanel + PlayerCard grid
      PlayerLobby.jsx   Player waiting room (mobile)
      HostGame.jsx      Host game (KUI Timer, QuestionCard, RevealCard list, Leaderboard)
      PlayerGame.jsx    Player phone screen (AnswerInput, BettingPanel, MiniLeaderboard)
      GameOver.jsx      WinnerDisplay + Podium + Leaderboard + Play Again

questions/
  questions.json    Local fallback question bank

test-game.js        End-to-end Playwright test (run from project root)
```

---

## Critical Gotchas

**`sanitizePlayers()` is mandatory before any Socket.io emit of player arrays.** Player objects have `_disconnectTimer` (a Node.js Timeout with circular linked list internals). Emitting raw player objects causes `RangeError: Maximum call stack size exceeded` in `hasBinary()`. Both `index.js` and `gameManager.js` have their own copy.

**Background music only plays on the host device.** `primeMusic()` in `App.jsx` is called on the Start Game click (user gesture required for browser autoplay unlock). Uses Howler.js (Web Audio API) — not `new Audio()` — to avoid triggering the Windows SMTC / OS media session popup. Music stops on leaving `host-game` screen and the Howl is unloaded so a new random track plays next game.

**Session persistence:** `localStorage` stores `{ role, code, name?, settings? }` under key `ek_daam_session`. On socket connect, the client emits `host:rejoin` or `player:rejoin`. Cleared on `game:over` or on receiving `Room not found` / `Player not found in room` errors (server restarted, lost in-memory state).

**Room codes** are 4-letter Bangla-transliterated words (AMMU, CHAI, DAAL, etc.) from a 48-word bank in `roomManager.js`, not random strings.

**Betting round trigger:** `(currentRound + 1) % 5 === 0` — rounds 5, 10, 15, 20. `currentRound` is 0-indexed.

**Questions source:** Set `QUESTIONS_SHEET_URL` env var on Render to a Google Sheet "Publish to web → CSV" URL. Column order: `question | answer | unit | category | funFact`. Falls back to `questions/questions.json` if not set. Questions are cached in memory after first load.

**Round 1 mount race (fixed).** The first `round:start` event fires while the host is still on `host-lobby`. App.jsx handles it and flips the screen to `host-game`, passing `initialRound` as a prop. HostGame's own `socket.on('round:start')` handler doesn't catch round 1 because it isn't mounted yet. `timeLeft` and `answerCount.total` are seeded from `initialRound` in HostGame's `useState` initializers so round 1 paints correctly. If you add similar live-updated state, seed it from the initial prop.

**Round counter is 1-indexed in payloads but 0-indexed in server state.** `round` in `round:start` payload is 1-indexed (display-ready). `currentRound` in server state is 0-indexed (controls betting trigger).

---

## Settings (Host Configures Before Game)

| Setting | Default | Effect |
|---|---|---|
| `questionCount` | 10 | 10, 15, or 20 questions |
| `eliminationMode` | false | Furthest answer each round gets a strike; 3 = eliminated |
| `bettingRounds` | false | Betting phase every 5th question |
| `backgroundMusic` | true | Background music on host device (Howler.js) |

`backgroundMusic` is client-only — not sent to server. Other settings go to server via `host:create_room`. All four are displayed in the host lobby's SettingsPanel during the wait.

---

## Audio

3 tracks on Cloudflare R2 (`pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/`):
- `the_scoring_bell.mp3`
- `the_dhaka_lobby.mp3`
- `square_wave_bazaar.mp3`

Track is randomly selected in `primeMusic()` each game. Adding new tracks: upload to R2, add URL to `soundUrls` array in `App.jsx`.

---

## Testing

`test-game.js` at the project root is a Playwright script that drives 3 isolated browser contexts (host + Alice + Bob) through a full game. Selectors are stable text/role/`kui-*` class based (e.g. `.kui-qcard`, `.kui-answer__input`, text "Correct Answer") — DO NOT switch to ephemeral hashed-class selectors when editing.

```bash
node test-game.js                              # default: 3 rounds, betting toggle on
ROUNDS=5 BETTING=true  node test-game.js       # 5 rounds, exercises the round-5 betting phase
ROUNDS=2 BETTING=false node test-game.js       # no-betting smoke (toggles off via Landing)
```

Both dev servers must be running. The host's Betting Rounds toggle in Landing is selected via `button[aria-pressed]:nth(1)` since the pill switches don't carry visible ON/OFF text.

**Preview mode** for screenshot validation without the backend: navigate to `http://localhost:5173/?preview=<key>`. Keys defined in `client/src/preview.jsx` — covers every screen/phase combination (`host-lobby`, `host-question`, `host-betting`, `host-reveal`, `host-scoreboard`, `player-question`, `player-locked`, `player-betting`, `player-reveal`, `player-scoreboard`, `game-over`). Gated on the query param; harmless in production.

---

## Working with KUI (when changes are needed)

If a view needs a primitive KUI doesn't provide, **add it to KUI rather than inlining it in this repo**. Steps:

1. Edit/add the component in `../kui/packages/lib/src/components/base/` (or `fixedprice/` if game-specific)
2. Export from the appropriate barrel (`src/index.ts` or `src/fixedprice.ts`)
3. Add a Booth showcase in `../kui/packages/docs/src/sections/`
4. Bump `../kui/packages/lib/package.json` version
5. Commit + push to KUI's `main` — the publish workflow runs automatically when files under `packages/lib/**` change
6. Wait for publish to land on npm (check `npm view @khelahobe/kui versions --json`)
7. In this repo: bump `client/package.json` `@khelahobe/kui` to the new version, `npm install`, commit + push

**KUI publish pitfalls (from earlier incidents — locked-in by docs in `../kui/CLAUDE.md`):**
- Workflow is pinned to **pnpm v10** (NOT `latest`). pnpm v11's strict-builds gate (`ERR_PNPM_IGNORED_BUILDS`) breaks `pnpm install --frozen-lockfile` because the lockfile doesn't carry build approvals for `@parcel/watcher` / `esbuild`.
- Workflow has `workflow_dispatch` enabled — manually trigger with `gh workflow run "Publish @khelahobe/kui" --repo Khela-Hobe-Game-Studios/KUI`.
- Two CI workflows in KUI: **Deploy Docs** (GitHub Pages showcase) and **Publish @khelahobe/kui** (npm). They are independent. A green Deploy Docs run does NOT mean the npm publish succeeded.

---

## Known Limitations / Future Work

- All state is in-memory — server restart loses all rooms (Render spins down after inactivity)
- No persistent user accounts or history
- Questions loaded once at startup; adding questions requires server restart (or QUESTIONS_SHEET_URL set)
- Timer duration is not configurable (hardcoded: 30s question, 20s betting, 5s reveal, 5s scoreboard)
- No category filter in-game
- Max ~20 players (untested beyond that)
- Elimination mode: if last player gets eliminated on the final round, `endGame` is called early
