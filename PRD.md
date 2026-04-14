#### এক দাম (Fixed Price) — Game Requirements Document

## Overview

এক দাম is a browser-based multiplayer party game for 8–20 players designed for in-person group play. One device acts as the shared host screen (TV or laptop), while each player joins and submits answers from their own phone via a room code. The core mechanic is numeric estimation — a question appears, everyone submits a number, and the closest answer wins. No multiple choice. Pure instinct and knowledge.



**

Core Concept

A numeric estimation game for 8-20 players. A question appears on the host screen, everyone submits their best number guess on their phone, and the closest answer wins the round. No multiple choice, no elimination of wrong answers — pure instinct and knowledge.

---

Game Setup

Host picks before starting:

- Number of questions (10, 15, or 20)

- Elimination mode on or off

- Whether to include a Betting Round

---

Standard Round

A question appears on screen — e.g. "How many kilometers of river does Bangladesh have?" or "How much did Avatar 2 gross worldwide in USD?"

Everyone has 30 seconds to submit a number on their phone. All answers reveal simultaneously on the host screen ranked closest to furthest. Closest answer gets full points, second closest gets partial, everyone else gets nothing. Fast, clean, no waiting.

---

Elimination Mode

Same as standard but the player with the furthest answer each round gets a strike. Three strikes and you're out. Game continues until one player remains or questions run out — whoever has fewest strikes at the end wins. Works great for competitive groups who want higher stakes.

---

Betting Round (optional, every 5th question)

Before the question is revealed, players are told "this is a betting round." The question appears, everyone submits their estimate as normal. But then a second screen appears — everyone bets 1, 2, or 3 points on whose answer they trust most (can't bet on yourself). The closest estimator gets their own points plus all the points bet on them. Players who bet on the winner also collect. Players who bet on losers lose nothing — it's not punitive, just additive. Keeps non-knowers engaged because reading your friends is a separate skill from knowing the answer.

---

Scoring

- Closest answer → 3 points

- Second closest → 1 point

- Everyone else → 0

- Betting round winner → 3 points + 1 point per person who bet on them

- Correct bettor → 1 bonus point

---

Question Categories

Mostly Bangladeshi with global sprinkled in:

- Desh — Bangladesh stats, geography, history, culture ("How many UNESCO heritage sites does Bangladesh have?")

- Cricket — Shakib's wickets, highest ODI score, World Cup stats

- Taka — prices, GDP, economic stats ("What's the price of 1kg of hilsa at Karwan Bazar today?")

- Biশ্ব (World) — global pop culture, science, geography ("How many Oscars has Spielberg won?")

- Weird Facts — surprising numbers nobody actually knows ("How many rickshaws are registered in Dhaka?")

---

What makes it work for 12+ players

Every single player answers every single question simultaneously — no waiting, no turns, no one sitting out. The host screen shows everyone's answer at once which creates a natural moment of chaos and reaction in the room. The betting round means even players who are consistently bad at estimating have a path to winning by being good at reading people.

**

---

## Tech Stack

- Frontend: React
- Realtime: Socket.io or Supabase Realtime
- Backend: Node.js / Express or Next.js API routes
- Animations: Framer Motion
- Hosting: Vercel or Railway
- Questions: JSON flat file or Supabase table

---

## Player Flow

1. Host opens the app on a shared screen and creates a room — gets a 4-letter room code
2. Players open the app on their phones, enter the room code and a display name
3. Host sees all joined players on screen and starts the game when ready
4. Each round: question appears on host screen + player phones simultaneously, players type a number and submit within the timer
5. After timer: all answers reveal on host screen with winner animation
6. Scoreboard updates live, next round begins automatically after a short pause

---

## Game Modes

### Standard Mode

Host picks a fixed number of questions before starting (10, 15, or 20). All players answer every question. No elimination. Final scoreboard at the end.

### Elimination Mode

Same as standard but after each question the player with the furthest answer gets a strike. Three strikes and you're out. Eliminated players can still watch on the host screen. Game ends when one player remains or questions run out — fewest strikes wins.

Both modes are independently selectable. Host chooses before starting.

---

## Round Structure

Each round follows this exact sequence:

1. **Question phase** — question appears on host screen and player phones. 30-second countdown timer. Players type and submit a numeric answer. Once submitted they can't change it.
2. **Reveal phase** — all answers appear simultaneously on host screen ranked closest to furthest. Winner animation plays (see Animations section). Points awarded automatically.
3. **Scoreboard phase** — live scoreboard shown for 5 seconds before next question auto-starts.

---

## Betting Round (Optional Round Type)

Every 5th question is optionally a Betting Round — host can toggle this on or off before the game.

Flow:

1. Question appears as normal — everyone submits their estimate
2. After submission, a second screen appears: "Who do you trust?" — each player bets 1, 2, or 3 points on whose answer they think is closest (cannot bet on themselves)
3. Closest estimator wins their base points + 1 bonus point per player who bet on them
4. Players who bet on the winner each earn 1 bonus point
5. No penalty for betting on the wrong player — betting is purely additive

Betting phase has a 20-second timer.

---

## Scoring

- Closest answer → 3 points
- Second closest → 1 point
- All others → 0 points
- Betting round winner → 3 points + 1 per player who bet on them
- Correct bettor → 1 bonus point
- Tie (exact same distance) → both players get full points

---

## Question Categories

Questions are mostly Bangladeshi with global mixed in. Each question must have:

- The question text
- The correct numeric answer
- A unit label (km, taka, years, goals, etc.)
- A category tag
- An optional fun fact revealed after the answer

Categories:

- **Desh** — Bangladesh geography, history, population, culture
- **Cricket** — Bangladeshi and international cricket stats
- **Taka** — prices, GDP, economic stats, cost of everyday items
- **Bishwo (বিশ্ব)** — global pop culture, science, geography
- **Weird Facts** — surprising numbers nobody actually knows

Minimum 50 questions in the initial question bank. Questions should vary in difficulty — some obvious, some genuinely hard, some where instinct beats knowledge.

Example questions:

- "How many rivers flow through Bangladesh?" (answer: ~700)
- "How many ODI wickets has Shakib Al Hasan taken?" (answer: ~300+)
- "What is the length of the Padma Bridge in meters?" (answer: 6150)
- "How much did Avatar 2 gross worldwide in USD millions?" (answer: ~2320)
- "How many rickshaws are registered in Dhaka?" (answer: ~80,000+)

---

## Host Screen UI

The host screen is the shared display everyone watches. It must be visually exciting and readable from across a room.

### Layout

- Top bar: round number, category tag, timer countdown (large, animated)
- Center: question text (large font, readable at distance)
- Bottom half: answer reveal cards and scoreboard

### Timer

- Countdown displayed as a large number + shrinking circular progress ring
- Color shifts from green → yellow → red as time runs low
- Pulse animation in final 5 seconds

### Answer Reveal Animation (critical — this is the most important moment)

When the timer ends, answers reveal one by one from furthest to closest, building suspense:

1. Cards fly in from the bottom, furthest answer first — each card shows player name + their answer
2. Cards are color coded: red (far), orange, yellow, green (close)
3. Last card (winner) flies in with a distinct entrance — larger, gold border, confetti burst
4. Winner's name displays in large text with a celebratory animation (confetti, screen flash, or particle effect)
5. Correct answer is revealed with a "ding" visual cue after winner is shown
6. Fun fact (if available) fades in below the correct answer

### Scoreboard

- Persistent live scoreboard on the right side during question phase showing current rankings
- After each round, scoreboard animates rank changes — players moving up get a green arrow, moving down get a red arrow
- Leader gets a small crown icon next to their name
- Full-screen scoreboard shown for 5 seconds between rounds

### Betting Round UI

- Distinct visual treatment — different background color or banner to signal it's a special round
- After estimate submission, a grid of player name cards appears — players tap on their phone to bet, selected player highlights on host screen in real time as bets come in
- Show bet count per player live ("3 bets") so the room can react

---

## Player Phone UI

Keep it minimal — players need to focus on the host screen, not their phone.

- Join screen: room code input + name input, big friendly button
- Waiting room: shows their name, list of who else has joined, ready indicator
- Question screen: question text (smaller), large number input, submit button — nothing else
- Post-submit: "Answer locked in ✓" confirmation, then answer reveal happens on host screen
- Betting screen: grid of other player names as tappable cards, confirm bet button
- Between rounds: mini scoreboard showing their own rank and points

---

## Animations Summary

All animations via Framer Motion:

- Answer cards fly in sequentially (staggered, 0.4s apart)
- Winner card entrance: scale up + glow + confetti burst
- Scoreboard rank changes: smooth vertical reordering with color-coded arrows
- Timer ring: smooth SVG stroke animation
- Timer urgency: pulse + color shift in final 5 seconds
- Betting selection: tap to highlight with ripple effect
- Round transition: brief full-screen flash before next question

---

## Game Configuration (Host Sets Before Starting)

- Number of questions: 10 / 15 / 20
- Elimination mode: on / off
- Betting rounds: on / off
- Timer duration: 20s / 30s / 45s
- Question category filter: all / specific categories only

---

## Edge Cases to Handle

- Player disconnects mid-game → their submitted answer still counts that round, they rejoin by re-entering room code
- Player submits after timer → answer rejected, they get 0 for that round
- All players tie → all get full points
- Player joins late → can join up to round 3, starts with 0 points
- Host disconnects → game pauses, host can rejoin and resume

---

## Out of Scope (V1)

- User accounts or persistent profiles
- Custom question creation in-app
- Audio / sound effects
- Mobile app (web only)
- More than 20 players

<!-- What this version will NOT include -->
