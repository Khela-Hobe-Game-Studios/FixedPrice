# এক দাম (Fixed Price)

**A fast-paced multiplayer party game for 2–20 players designed for in-person group play.**

Numeric estimation, real-time multiplayer action, and pure instinct. One shared host screen (TV or laptop), each player joins from their phone via a room code. Answer questions, guess the closest number, win points—no multiple choice, no waiting around.

---

## 🎮 Game Overview

**এক দাম** is a browser-based multiplayer numeric estimation party game. A question appears on the host screen (e.g., "How many rivers flow through Bangladesh?"), all players submit their best guess simultaneously on their phone within 30 seconds, and the closest answer wins the round. Fast, clean, and engaging for groups of 8–20 players.

### Why It Works
- **Everyone plays every round** — no waiting, no sitting out
- **Pure knowledge and instinct** — no multiple choice, no guessing between options
- **Real-time reactions** — live scoreboard creates moments of chaos and celebration
- **Betting rounds** — optional betting system means even bad estimators can win by reading their friends
- **Bangladeshi culture** — questions rooted in local knowledge with global sprinkled in

---

## ✨ Features

### Core Gameplay
- ✅ **Numeric estimation** — submit your best guess (no multiple choice)
- ✅ **Simultaneous play** — everyone answers at the same time
- ✅ **Instant results** — all answers reveal ranked closest to furthest with winner animation
- ✅ **Live scoreboard** — points update in real-time across all devices
- ✅ **Flexible game length** — choose 10, 15, or 20 questions before starting

### Game Modes
- ✅ **Standard Mode** — all players answer all questions, highest score wins
- ✅ **Elimination Mode** — players get strikes for furthest answers; three strikes = out
- ✅ **Betting Rounds** (optional) — every 5th question, bet points on whose answer you trust most

### Player Session Management
- ✅ **Auto-rejoin on disconnect** — if a player refreshes mid-game, they rejoin seamlessly
- ✅ **Host rejoin** — host can refresh and rejoin their game
- ✅ **Real-time player list** — see who's joined before starting

### Technical
- ✅ **Real-time multiplayer** — Socket.io for instant communication
- ✅ **Smooth animations** — Framer Motion for winner reveals and round transitions
- ✅ **Mobile-responsive** — optimized for phones and tablets
- ✅ **Persistent sessions** — localStorage keeps players connected across refreshes

---

## 📖 Game Rules

### Before the Game

1. **Host creates a room** and picks:
   - Number of questions (10, 15, or 20)
   - Elimination mode (on/off)
   - Betting rounds (on/off)

2. **Players join** by entering the 4-letter room code and a display name on their phones

3. **Host starts the game** once all players have joined

Note: Best to screen cast the host screen to a bigger screen like a TV or run from a Laptop, so that all players can view it

### Each Round

**Phase 1: Question** (30 seconds)
- Question appears on host screen and all player phones simultaneously
- All players type a number and submit (can't change once submitted)
- Timer counts down

**Phase 2: Reveal** (automatic after timer or when all answers received)
- All answers appear on host screen ranked closest to furthest from the correct answer
- Winner animation plays with instant point award

**Phase 3: Scoreboard** (5 seconds)
- Live scoreboard shown
- Next question auto-starts

### Betting Rounds (if enabled)

Every 5th question is a Betting Round:

1. Question appears and everyone submits their estimate (same as normal)
2. A second screen appears: "Who do you trust?" — each player bets 1–3 points on whose answer they think is closest (can't bet on yourself)
3. **Scoring:**
   - Closest estimator: 3 base points + 1 bonus point per person who bet on them
   - Each player who bet on the winner: +1 bonus point
   - No penalty for betting on losers

### Scoring System

| Achievement | Points |
|---|---|
| Closest answer | 3 points |
| Second closest | 1 point |
| Everyone else | 0 points |
| Betting round bonus (per bettor) | +1 point |

### Elimination Mode

- After each question, the player furthest from the correct answer gets a strike
- Three strikes = eliminated
- Eliminated players can still watch on the host screen
- Game ends when one player remains OR all questions are done
- Winner = player with fewest strikes (or highest score if all questions are done)

### Game End

After all questions are answered:
- Final scoreboard is displayed
- Winner is crowned
- Show final scores for all players

---

## 🚀 Installation

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)

### Step 1: Clone & Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd "Fixed Price"

# Install all dependencies (root, server, and client)
npm run install:all
```

This installs:
- Root dev dependencies (`concurrently`, `playwright`)
- Server dependencies (`express`, `socket.io`, `cors`)
- Client dependencies (`react`, `framer-motion`, `socket.io-client`, `vite`)

### Step 2: Start Development Servers

**Option A: Run both server and client together**
```bash
npm run dev
```

**Option B: Run separately (in different terminals)**
```bash
# Terminal 1: Start server
npm run dev:server
```

```bash
# Terminal 2: Start client
npm run dev:client
```

### Step 3: Open in Browser

- **Host screen:** Open http://localhost:5173 (or the URL shown in terminal)
- **Player phones:** Open the same URL and join via room code

---

## 🎯 Quick Start Guide

### For Hosts

1. Click **"Host a Game"**
2. Pick your settings:
   - Number of questions (10, 15, or 20)
   - Enable/disable Elimination Mode
   - Enable/disable Betting Rounds
3. Click **"Create Game"**
4. Share the 4-letter room code with players
5. Once players have joined, click **"Start Game"**
6. Watch the action unfold on your shared screen

### For Players

1. Click **"Join a Game"**
2. Enter the 4-letter room code (given by host)
3. Enter your display name
4. Click **"Join"**
5. Wait for the host to start the game
6. When a question appears:
   - Read the question
   - Type your best guess (a number)
   - Hit **"Submit"** before the timer runs out
7. Watch the results reveal and points update

---

## 🏗️ Project Structure

```
Fixed Price/
├── client/                          # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx                 # Main app router
│   │   ├── socket.js               # Socket.io client setup
│   │   ├── main.jsx                # Entry point
│   │   ├── index.css               # Global styles
│   │   └── views/
│   │       ├── Landing.jsx         # Host/Player selection screen
│   │       ├── HostLobby.jsx       # Host waiting for players
│   │       ├── HostGame.jsx        # Host game screen
│   │       ├── PlayerLobby.jsx     # Player waiting to start
│   │       ├── PlayerGame.jsx      # Player answer submission
│   │       ├── GameOver.jsx        # Final scoreboard
│   │       └── *.module.css        # Component styles
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                          # Node.js / Express backend
│   └── src/
│       ├── index.js                # Express server, Socket.io setup
│       ├── gameManager.js          # Game logic (rounds, scoring, elimination)
│       └── roomManager.js          # Room (player list, state management)
│   └── package.json
│
├── questions/
│   └── questions.json              # Question database with answers & categories
│
├── package.json                     # Root scripts (yarn dev, install:all)
├── PRD.md                           # Product requirements document
└── README.md                        # This file
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite |
| **Real-time** | Socket.io (client & server) |
| **Backend** | Node.js + Express |
| **Animations** | Framer Motion |
| **Styling** | CSS Modules |
| **State** | React hooks + Socket.io events |
| **Dev Tools** | Nodemon (server), Concurrently (dev scripts) |

---

## 🎨 UI/UX Features

- **Responsive design** — works on desktop, tablet, and mobile
- **Smooth animations** — round transitions, winner reveals, score updates
- **Real-time feedback** — answer counts, timer countdowns, live scoreboard
- **Confetti celebrations** — visual rewards for winners
- **Bengali & English** — bilingual UI (эк দাম + FIXED PRICE)

---

## 🔧 Available Commands

From the root directory:

```bash
# Install all dependencies
npm run install:all

# Start both server and client in development mode
npm run dev

# Start only the server
npm run dev:server

# Start only the client
npm run dev:client

# (Server) Start in production
cd server && npm start

# (Client) Build for production
cd client && npm run build
```

---

## 🌍 Environment Variables

None required for local development. Defaults:
- **Server:** `http://localhost:3000` (or `process.env.PORT`)
- **Client:** `http://localhost:5173` (Vite default)

For production deployment, update the server URL in [client/src/socket.js](client/src/socket.js).

---

## 📊 Question Categories

The game includes questions across multiple categories:

- **Desh** — Bangladesh facts, geography, history, culture
- **Cricket** — Bengali players, ODI/Test records, World Cup stats
- **Taka** — Pricing, GDP, economic metrics
- **Biশ্ব (World)** — Global pop culture, science, geography
- **Weird Facts** — Surprising numbers nobody knows

Each question includes:
- The question text
- Correct answer
- Unit (meters, millions, wickets, etc.)
- Category
- Fun fact for post-round learning

**See [questions.json](questions/questions.json) for the full list.**

---

## 🎮 Example Game Flow

**4 players join. Host starts a 10-question game with elimination mode ON.**

```
Round 1: "How many rivers flow through Bangladesh?"
├─ Player A answers: 650 (distance: 50)  ✅ WINS 3 points, gets 1 strike
├─ Player B answers: 705 (distance: 5)   ✅ WINS 1 point
├─ Player C answers: 800 (distance: 100) ❌ Gets 1 strike
└─ Player D answers: 400 (distance: 300) ❌ FURTHEST — Gets 1 strike

Scoreboard:
  Player B: 1 pt (0 strikes)
  Player A: 3 pts (1 strike)
  Player C: 0 pts (1 strike)
  Player D: 0 pts (1 strike)
```

**After 10 questions, the player with the fewest strikes wins!**

---

## 🐛 Troubleshooting

### Players can't connect
- Ensure the server is running (`npm run dev:server`)
- Check that the room code matches (4-letter, uppercase)
- Verify both host and players are on the same network (or use public URL if deployed)

### Answers not submitting
- Ensure the timer hasn't run out
- Check browser console for Socket.io errors
- Refresh and rejoin

### Host can't see players
- Wait a few seconds after players join for the room state to sync
- Refresh the host screen if needed

### Animations not playing
- Ensure Framer Motion is installed (`npm install framer-motion`)
- Check browser console for errors


---

## 📝 License

© 2026 Khela Hobe Game Studios. All rights reserved.

---

## 🤝 Contributing

Contributions welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit changes (`git commit -am 'Add my feature'`)
4. Push to branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📧 Support

For issues or questions:
- Check [Troubleshooting](#-troubleshooting) above
- Review the [PRD.md](PRD.md) for detailed game specs
- Open an issue in the repository

---

**Happy gaming! 🎉**
