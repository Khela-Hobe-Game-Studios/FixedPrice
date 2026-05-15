# Fixed Price (এক দাম) — Agent Context

Multiplayer party game where players estimate numbers and the closest guess wins. Host runs on a shared screen (TV/laptop), players join on their phones via a 4-letter room code.

**Live site:** https://ekdaam.khelahobe.store  
**Backend:** https://fixedprice.onrender.com (Render free tier — cold starts ~30s)

---

## Architecture

```
client/          React 18 + Vite — GitHub Pages
server/          Node.js + Express + Socket.io — Render
questions/       questions.json (fallback) or Google Sheet CSV via QUESTIONS_SHEET_URL env var
```

The backend is stateful (in-memory rooms Map). Vercel/serverless won't work — must be a persistent process. Render is what's deployed.

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

**Frontend:** Push to `main` → GitHub Actions (`deploy.yml`) builds Vite and deploys to GitHub Pages automatically.

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

client/src/
  App.jsx           Screen router, session persistence, background music (Howler.js)
  socket.js         Socket.io client singleton (autoConnect: false)
  views/
    Landing.jsx       Home screen + host settings + join form
    HostLobby.jsx     Host waiting room, player list, Start Game button
    PlayerLobby.jsx   Player waiting room
    HostGame.jsx      Host game screen (question, reveal, betting, scoreboard phases)
    PlayerGame.jsx    Player phone screen (answer input, betting, result)
    GameOver.jsx      Final scoreboard

questions/
  questions.json    Local fallback question bank
```

---

## Critical Gotchas

**`sanitizePlayers()` is mandatory before any Socket.io emit of player arrays.** Player objects have `_disconnectTimer` (a Node.js Timeout with circular linked list internals). Emitting raw player objects causes `RangeError: Maximum call stack size exceeded` in `hasBinary()`. Both `index.js` and `gameManager.js` have their own copy.

**Background music only plays on the host device.** `primeMusic()` in `App.jsx` is called on the Start Game click (user gesture required for browser autoplay unlock). Uses Howler.js (Web Audio API) — not `new Audio()` — to avoid triggering the Windows SMTC / OS media session popup. Music stops on leaving `host-game` screen and the Howl is unloaded so a new random track plays next game.

**Session persistence:** `localStorage` stores `{ role, code, name?, settings? }` under key `ek_daam_session`. On socket connect, the client emits `host:rejoin` or `player:rejoin`. Cleared on `game:over` or on receiving `Room not found` / `Player not found in room` errors (server restarted, lost in-memory state).

**Room codes** are 4-letter Bangla-transliterated words (AMMU, CHAI, DAAL, etc.) from a 48-word bank in `roomManager.js`, not random strings.

**Betting round trigger:** `(currentRound + 1) % 5 === 0` — rounds 5, 10, 15, 20. `currentRound` is 0-indexed.

**Questions source:** Set `QUESTIONS_SHEET_URL` env var on Render to a Google Sheet "Publish to web → CSV" URL. Column order: `question | answer | unit | category | funFact`. Falls back to `questions/questions.json` if not set. Questions are cached in memory after first load.

---

## Settings (Host Configures Before Game)

| Setting | Default | Effect |
|---|---|---|
| `questionCount` | 10 | 10, 15, or 20 questions |
| `eliminationMode` | false | Furthest answer each round gets a strike; 3 = eliminated |
| `bettingRounds` | true | Betting phase every 5th question |
| `backgroundMusic` | true | Background music on host device (Howler.js) |

`backgroundMusic` is client-only — not sent to server. Other settings go to server via `host:create_room`.

---

## Audio

3 tracks on Cloudflare R2 (`pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev/bg-music/`):
- `the_scoring_bell.mp3`
- `the_dhaka_lobby.mp3`
- `square_wave_bazaar.mp3`

Track is randomly selected in `primeMusic()` each game. Adding new tracks: upload to R2, add URL to `soundUrls` array in `App.jsx`.

---

## Testing

`test-game.js` at the project root is a Playwright script that runs a full game end-to-end with separate browser contexts (host, Alice, Bob). Run with `node test-game.js` while both dev servers are running. It plays 3 rounds and validates all phases.

---

## Known Limitations / Future Work

- All state is in-memory — server restart loses all rooms (Render spins down after inactivity)
- No persistent user accounts or history
- Questions loaded once at startup; adding questions requires server restart (or QUESTIONS_SHEET_URL set)
- Timer duration is not configurable (hardcoded: 30s question, 20s betting, 5s reveal, 5s scoreboard)
- No category filter in-game
- Max ~20 players (untested beyond that)
- Elimination mode: if last player gets eliminated on the final round, `endGame` is called early
