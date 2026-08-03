import HostLobby from './views/HostLobby';
import PlayerLobby from './views/PlayerLobby';
import HostGame from './views/HostGame';
import PlayerGame from './views/PlayerGame';
import GameOver from './views/GameOver';

const players = [
  { id: 'p1', name: 'Karim', score: 8 },
  { id: 'p2', name: 'Ayesha', score: 7 },
  { id: 'p3', name: 'Rafi', score: 5 },
  { id: 'p4', name: 'Sumi', score: 4 },
  { id: 'p5', name: 'Tariq', score: 2 },
];

const room = {
  code: 'AMMU',
  players,
  settings: { questionCount: 10, eliminationMode: false, bettingRounds: false, backgroundMusic: true },
};

const roundData = {
  round: 3,
  total: 10,
  question: 'How tall is the National Martyrs’ Monument in Savar?',
  category: 'desh',
  unit: 'meters',
  isBettingRound: false,
  players,
  timer: 22,
};

const bettingData = {
  ranked: players.map((p, i) => ({ ...p, rank: i + 1 })),
  timer: 18,
};

const revealData = {
  correctAnswer: 150,
  unit: 'meters',
  funFact: 'It was designed by architect Syed Mainul Hossain and inaugurated in 1982.',
  ranked: [
    { id: 'p2', name: 'Ayesha', guess: 148, distance: 2 },
    { id: 'p1', name: 'Karim', guess: 145, distance: 5 },
    { id: 'p3', name: 'Rafi', guess: 160, distance: 10 },
    { id: 'p4', name: 'Sumi', guess: 200, distance: 50 },
    { id: 'p5', name: 'Tariq', guess: 80, distance: 70 },
  ],
  bets: {},
  scores: {},
  strikes: {},
};

const scoreboardData = {
  scoreboard: [
    { id: 'p2', name: 'Ayesha', score: 10, strikes: 0, eliminated: false },
    { id: 'p1', name: 'Karim', score: 8, strikes: 0, eliminated: false },
    { id: 'p3', name: 'Rafi', score: 5, strikes: 1, eliminated: false },
    { id: 'p4', name: 'Sumi', score: 3, strikes: 2, eliminated: false },
    { id: 'p5', name: 'Tariq', score: 1, strikes: 3, eliminated: true },
  ],
};

const final = [
  { id: 'p2', name: 'Ayesha', score: 24, strikes: 0 },
  { id: 'p1', name: 'Karim', score: 19, strikes: 1 },
  { id: 'p3', name: 'Rafi', score: 15, strikes: 1 },
  { id: 'p4', name: 'Sumi', score: 11, strikes: 2 },
  { id: 'p5', name: 'Tariq', score: 7, strikes: 3 },
];

const me = { id: 'p1', name: 'Karim' };

// ─── 15-player fixtures ──────────────────────────────────────────────────────
// The target party size. Reveal and scoreboard layouts both used to overflow a
// TV here, so these exist to make the crowded case checkable without a backend.
const BIG_NAMES = ['Karim', 'Ayesha', 'Rafi', 'Sumi', 'Tariq', 'Nadia', 'Sabbir',
  'Mim', 'Imran', 'Tania', 'Hasan', 'Nusrat', 'Arif', 'Priya', 'Jamal'];

const bigPlayers = BIG_NAMES.map((name, i) => ({
  id: `b${i + 1}`, name, score: 30 - i * 2,
}));

const bigRoom = { ...room, code: 'JHOL', players: bigPlayers };

const bigRound = { ...roundData, players: bigPlayers, total: 20, round: 12 };

const bigReveal = {
  ...revealData,
  revealMs: 9750,
  ranked: bigPlayers.map((p, i) => ({
    id: p.id, name: p.name, submitted: true,
    guess: 150 + (i % 2 ? i * 7 : -i * 5),
    distance: i === 0 ? 1 : i * 6,
  })),
};

const bigScoreboard = {
  scoreboard: bigPlayers.map((p, i) => ({
    id: p.id, name: p.name, score: 30 - i * 2,
    strikes: i > 12 ? 2 : 0, eliminated: false,
  })),
};

// A question whose answer is in "lakh BDT" — exercises the magnitude warning.
const scaleRound = {
  ...roundData,
  question: 'Average price of a used Toyota Corolla 2013 model in Bangladesh in 2026',
  category: 'Price',
  unit: 'lakh BDT',
};

const noop = () => {};

/**
 * Every preview, keyed by its ?preview= value.
 *
 * A map rather than a switch so the gallery at `?preview=index` can enumerate
 * them — an index that derives itself cannot drift out of date. `viewport` is
 * advisory: it records the size the screen is meant to be judged at, and
 * capture-screens.js shoots at the same sizes.
 */
export const PREVIEWS = {
  // ── Host: shared screen. Judge at 1280x720. Must never need scrolling. ──
  'host-lobby-empty': {
    group: 'Host', viewport: 'tv', note: 'Waiting for anyone to join',
    render: () => <HostLobby room={{ ...room, players: [] }} setRoom={noop} setMe={noop} me={null} setScreen={noop} onStartGame={noop} />,
  },
  'host-lobby': {
    group: 'Host', viewport: 'tv', note: '5 players, QR + room code',
    render: () => <HostLobby room={room} setRoom={noop} setMe={noop} me={null} setScreen={noop} onStartGame={noop} />,
  },
  'host-lobby-15': {
    group: 'Host', viewport: 'tv', note: '15 players — full roster grid',
    render: () => <HostLobby room={bigRoom} setRoom={noop} setMe={noop} me={null} setScreen={noop} onStartGame={noop} />,
  },
  'host-question': {
    group: 'Host', viewport: 'tv', note: 'Countdown + answered progress',
    render: () => <HostGame room={room} initialRound={roundData} initialPhase="question" setRoom={noop} setMe={noop} me={null} setScreen={noop} />,
  },
  'host-question-15': {
    group: 'Host', viewport: 'tv', note: 'Progress bar at 15 players',
    render: () => <HostGame room={bigRoom} initialRound={bigRound} initialPhase="question" setRoom={noop} setMe={noop} me={null} setScreen={noop} />,
  },
  'host-betting': {
    group: 'Host', viewport: 'tv', note: 'Every 5th round when enabled',
    render: () => <HostGame room={room} initialRound={{ ...roundData, isBettingRound: true, round: 5 }} initialPhase="betting" initialBetting={bettingData} setRoom={noop} setMe={noop} me={null} setScreen={noop} />,
  },
  'host-reveal': {
    group: 'Host', viewport: 'tv', note: 'Cards land worst-first',
    render: () => <HostGame room={room} initialRound={roundData} initialPhase="reveal" initialReveal={revealData} setRoom={noop} setMe={noop} me={null} setScreen={noop} />,
  },
  'host-reveal-15': {
    group: 'Host', viewport: 'tv', note: 'THE hard case — 3 columns, must not overflow',
    render: () => <HostGame room={bigRoom} initialRound={bigRound} initialPhase="reveal" initialReveal={bigReveal} setRoom={noop} setMe={noop} me={null} setScreen={noop} />,
  },
  'host-scoreboard': {
    group: 'Host', viewport: 'tv', note: 'Between rounds',
    render: () => <HostGame room={room} initialRound={roundData} initialPhase="scoreboard" initialScoreboard={scoreboardData} setRoom={noop} setMe={noop} me={null} setScreen={noop} />,
  },
  'host-scoreboard-15': {
    group: 'Host', viewport: 'tv', note: 'All 15 visible — no "+N more"',
    render: () => <HostGame room={bigRoom} initialRound={bigRound} initialPhase="scoreboard" initialScoreboard={bigScoreboard} setRoom={noop} setMe={noop} me={null} setScreen={noop} />,
  },
  'game-over': {
    group: 'Host', viewport: 'tv', note: 'Podium + rematch',
    render: () => <GameOver final={final} setScreen={noop} room={room} me={null} />,
  },
  'game-over-15': {
    group: 'Host', viewport: 'tv', note: 'Buttons must stay above the fold',
    render: () => <GameOver final={bigPlayers.map(p => ({ ...p, strikes: 0 }))} setScreen={noop} room={bigRoom} me={null} />,
  },

  // ── Player: phone. Judge at 390x844, one-handed, glanceable. ──
  'player-lobby': {
    group: 'Player', viewport: 'phone', note: 'Waiting for host',
    render: () => <PlayerLobby room={room} me={me} setRoom={noop} setMe={noop} setScreen={noop} />,
  },
  'player-question': {
    group: 'Player', viewport: 'phone', note: 'Number input + countdown',
    render: () => <PlayerGame me={me} initialRound={roundData} initialPhase="question" setRoom={noop} setMe={noop} setScreen={noop} room={room} />,
  },
  'player-scale-warning': {
    group: 'Player', viewport: 'phone', note: 'lakh/thousand/million magnitude guard',
    render: () => <PlayerGame me={me} initialRound={scaleRound} initialPhase="question" setRoom={noop} setMe={noop} setScreen={noop} room={room} />,
  },
  'player-locked': {
    group: 'Player', viewport: 'phone', note: 'Submitted, guess not echoed',
    render: () => <PlayerGame me={me} initialRound={roundData} initialPhase="locked" setRoom={noop} setMe={noop} setScreen={noop} room={room} />,
  },
  'player-locked-guess': {
    group: 'Player', viewport: 'phone', note: 'Submitted, guess echoed back (reconnect path)',
    render: () => <PlayerGame me={me} initialRound={{ ...roundData, alreadySubmitted: true, mySubmission: 148 }} initialPhase="locked" setRoom={noop} setMe={noop} setScreen={noop} room={room} />,
  },
  'player-betting': {
    group: 'Player', viewport: 'phone', note: 'Pick who you trust',
    render: () => <PlayerGame me={me} initialRound={{ ...roundData, isBettingRound: true }} initialPhase="betting" initialBetting={bettingData} setRoom={noop} setMe={noop} setScreen={noop} room={room} />,
  },
  'player-reveal': {
    group: 'Player', viewport: 'phone', note: 'Your result vs the answer',
    render: () => <PlayerGame me={me} initialRound={roundData} initialPhase="reveal" initialReveal={revealData} setRoom={noop} setMe={noop} setScreen={noop} room={room} />,
  },
  'player-scoreboard': {
    group: 'Player', viewport: 'phone', note: 'Self pinned if outside top 5',
    render: () => <PlayerGame me={me} initialRound={roundData} initialPhase="scoreboard" initialScoreboard={scoreboardData} setRoom={noop} setMe={noop} setScreen={noop} room={room} />,
  },
};

const VIEWPORT_SIZES = { tv: '1280x720', phone: '390x844' };

function PreviewIndex() {
  const groups = [...new Set(Object.values(PREVIEWS).map(p => p.group))];
  return (
    <div className="ek-page" style={{ paddingTop: 32 }}>
      <div style={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--kui-font-display)', fontWeight: 800, fontSize: 'var(--kui-text-2xl)' }}>
            Preview gallery
          </h1>
          <p style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)', marginTop: 4, lineHeight: 1.5 }}>
            {Object.keys(PREVIEWS).length} screens with mock data — no backend needed.
            Run <code>npm run screens</code> to capture them all to <code>.screens/</code>.
          </p>
        </div>

        {groups.map(g => (
          <div key={g}>
            <h2 style={{
              fontFamily: 'var(--kui-font-display)', fontWeight: 800, fontSize: 'var(--kui-text-md)',
              textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--kui-text-muted)', marginBottom: 8,
            }}>{g}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(PREVIEWS).filter(([, p]) => p.group === g).map(([key, p]) => (
                <a
                  key={key}
                  href={`?preview=${key}`}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                    padding: '9px 13px', background: 'var(--kui-surface)',
                    border: '2.5px solid var(--kui-border)', borderRadius: 'var(--kui-radius-md, 12px)',
                    boxShadow: '3px 3px 0 var(--kui-shadow-color)',
                    textDecoration: 'none', color: 'var(--kui-text)',
                  }}
                >
                  <strong style={{ fontFamily: 'var(--kui-font-display)', fontWeight: 800 }}>{key}</strong>
                  <span style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)' }}>{p.note}</span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 'var(--kui-text-xs)',
                    color: 'var(--kui-text-muted)', fontWeight: 700,
                  }}>
                    {VIEWPORT_SIZES[p.viewport]}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function renderPreview(name) {
  if (name === 'index' || name === '1' || name === 'true') return <PreviewIndex />;

  const entry = PREVIEWS[name];
  if (entry) return entry.render();

  return (
    <div className="ek-page" style={{ paddingTop: 40 }}>
      <div style={{ maxWidth: 600 }}>
        <h1 style={{ fontFamily: 'var(--kui-font-display)', fontWeight: 800 }}>
          Unknown preview: {name}
        </h1>
        <p style={{ marginTop: 10 }}>
          <a href="?preview=index">See all {Object.keys(PREVIEWS).length} previews →</a>
        </p>
      </div>
    </div>
  );
}
