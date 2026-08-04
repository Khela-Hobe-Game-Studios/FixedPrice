import PlayerJoin from './views/player/PlayerJoin';
import PlayerAvatar from './views/player/PlayerAvatar';
import PlayerLobby from './views/player/PlayerLobby';
import PlayerQuestion from './views/player/PlayerQuestion';
import PlayerLocked from './views/player/PlayerLocked';
import PlayerBetting from './views/player/PlayerBetting';
import PlayerReveal from './views/player/PlayerReveal';
import PlayerScoreboard from './views/player/PlayerScoreboard';
import {
  PlayerBetween, PlayerReconnecting, PlayerRoomError, PlayerGameOver,
} from './views/player/PlayerStatus';
import { BoardSpecimens, PhoneSpecimens } from './board/Specimens';
import HostLanding from './views/host/HostLanding';
import HostLobby from './views/host/HostLobby';
import HostIntro from './views/host/HostIntro';
import HostQuestion from './views/host/HostQuestion';
import HostBetting from './views/host/HostBetting';
import HostReveal from './views/host/HostReveal';
import HostScoreboard from './views/host/HostScoreboard';
import HostGameOver from './views/host/HostGameOver';
import * as fx from './previewData';
import './board/board.css';
import './views/host/host.css';
import './views/player/player.css';

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
  // ── Design system: the primitives on their own, before any screen uses them. ──
  'board-primitives': {
    group: 'Board', viewport: 'tv', note: 'Type, ramp, tiles, clock, split columns',
    render: () => <BoardSpecimens />,
  },
  'board-phone': {
    group: 'Board', viewport: 'phone', note: 'Phone primitives + tile size scale',
    render: () => <PhoneSpecimens />,
  },

  // ── The board. 1280x720, never scrolls, judged at 15 players. ──
  'tv-landing': {
    group: 'Tv', viewport: 'tv', note: 'Before anyone joins',
    render: () => <HostLanding onStart={noop} />,
  },
  'tv-lobby-one': {
    group: 'Tv', viewport: 'tv', note: 'One player — the QR is all that matters',
    render: () => <HostLobby room={{ ...fx.room5, players: fx.players5.slice(0, 1) }} onStart={noop} onSettings={noop} />,
  },
  'tv-lobby': {
    group: 'Tv', viewport: 'tv', note: '5 players, code + QR + roster',
    render: () => <HostLobby room={fx.room5} onStart={noop} onSettings={noop} />,
  },
  'tv-lobby-15': {
    group: 'Tv', viewport: 'tv', note: '15 players — two wrapper columns, no checkerboard',
    render: () => <HostLobby room={fx.room15} onStart={noop} onSettings={noop} />,
  },
  'tv-intro': {
    group: 'Tv', viewport: 'tv', note: 'The one screen a category fills',
    render: () => <HostIntro intro={fx.intro} timing={fx.intro} />,
  },
  'tv-question': {
    group: 'Tv', viewport: 'tv', note: '5 players, 2 locked in',
    render: () => <HostQuestion round={fx.round5} timing={fx.round5} answerCount={fx.answerCount5} />,
  },
  'tv-question-15': {
    group: 'Tv', viewport: 'tv', note: '15 players, 7 locked in — all three progress channels',
    render: () => <HostQuestion round={fx.round15} timing={fx.round15} answerCount={fx.answerCount15} />,
  },
  'tv-question-zero': {
    group: 'Tv', viewport: 'tv', note: 'Nobody answered yet — every seat dashed',
    render: () => <HostQuestion round={fx.round15} timing={fx.round15} answerCount={fx.answerCountZero} />,
  },
  'tv-betting': {
    group: 'Tv', viewport: 'tv', note: 'Guesses visible, order random, odds priced off the pack',
    render: () => <HostBetting betting={fx.betting} round={fx.round15} timing={fx.betting} betCount={fx.betCount} />,
  },
  'tv-reveal': {
    group: 'Tv', viewport: 'tv', note: '5 players, sequence finished',
    render: () => <HostReveal reveal={fx.reveal5} round={fx.round5} />,
  },
  'tv-reveal-15': {
    group: 'Tv', viewport: 'tv', note: 'THE hard case — 15 rows, two wrapper columns, must not overflow',
    render: () => <HostReveal reveal={fx.reveal15} round={fx.round15} />,
  },
  'tv-reveal-live': {
    group: 'Tv', viewport: 'tv', note: 'Plays the whole sequence from beat 0',
    render: () => <HostReveal reveal={fx.makeReveal(fx.players15, { elapsed: 0 })} round={fx.round15} />,
  },
  'tv-reveal-chase': {
    group: 'Tv', viewport: 'tv', note: 'Mid-sequence: wild misses lit, the chase running',
    render: () => <HostReveal reveal={fx.makeReveal(fx.players15, { elapsed: 2400 })} round={fx.round15} />,
  },
  'tv-reveal-tie': {
    group: 'Tv', viewport: 'tv', note: 'Tie — the band splits, both at full output',
    render: () => <HostReveal reveal={fx.makeReveal(fx.players15, { outcome: 'tie' })} round={fx.round15} />,
  },
  'tv-reveal-nobody': {
    group: 'Tv', viewport: 'tv', note: 'Nobody close — red band, price stays amber',
    render: () => <HostReveal reveal={fx.makeReveal(fx.players15, { outcome: 'nobody_close' })} round={fx.round15} />,
  },
  'tv-reveal-two': {
    group: 'Tv', viewport: 'tv', note: '2 players — same grid, rows grow, no fork',
    render: () => <HostReveal reveal={fx.makeReveal(fx.makePlayers(2))} round={fx.round5} />,
  },
  'tv-scoreboard': {
    group: 'Tv', viewport: 'tv', note: '5 players between rounds',
    render: () => <HostScoreboard scoreboard={fx.scoreboard5} />,
  },
  'tv-scoreboard-15': {
    group: 'Tv', viewport: 'tv', note: 'All 15 visible with find-yourself bars',
    render: () => <HostScoreboard scoreboard={fx.scoreboard15} />,
  },
  'tv-game-over': {
    group: 'Tv', viewport: 'tv', note: 'Winner, podium, mascot',
    render: () => <HostGameOver final={fx.final5} onPlayAgain={noop} onStandings={noop} />,
  },
  'tv-game-over-15': {
    group: 'Tv', viewport: 'tv', note: 'Podium must not collapse — align-items:stretch',
    render: () => <HostGameOver final={fx.final15} onPlayAgain={noop} onStandings={noop} />,
  },

  // ── Phone: a controller, not a small TV. Judged at 390x844 and 375x667. ──
  'ph-join': {
    group: 'Phone', viewport: 'phone', note: 'Code + name, QR deep-link fills the code',
    render: () => <PlayerJoin code="JHOL" setCode={noop} name="Nadia" setName={noop} onJoin={noop} />,
  },
  'ph-join-empty': {
    group: 'Phone', viewport: 'phone', note: 'Cold start — caret on the first tile',
    render: () => <PlayerJoin code="" setCode={noop} name="" setName={noop} onJoin={noop} />,
  },
  'ph-avatar': {
    group: 'Phone', viewport: 'phone', note: 'Letter is the default; sprites are locked until drawn',
    render: () => <PlayerAvatar me={fx.me} onSet={noop} onDone={noop} />,
  },
  'ph-lobby': {
    group: 'Phone', viewport: 'phone', note: 'Header is the player own colour',
    render: () => <PlayerLobby me={fx.me} room={fx.room15} onEditAvatar={noop} />,
  },
  'ph-question': {
    group: 'Phone', viewport: 'phone', note: 'Number pad — no invalid key exists',
    render: () => <PlayerQuestion round={fx.round15} timing={fx.round15} answerCount={fx.answerCount15} onSubmit={noop} />,
  },
  'ph-question-short': {
    group: 'Phone', viewport: 'short', note: 'iPhone SE — the CTA must never move',
    render: () => <PlayerQuestion round={fx.round15} timing={fx.round15} answerCount={fx.answerCount15} onSubmit={noop} />,
  },
  'ph-locked': {
    group: 'Phone', viewport: 'phone', note: 'Get their eyes off the phone',
    render: () => <PlayerLocked round={fx.round15} guess={760} answerCount={fx.answerCount15} onChange={noop} />,
  },
  'ph-betting': {
    group: 'Phone', viewport: 'phone', note: 'One of six, with the numbers to argue about',
    render: () => <PlayerBetting betting={fx.betting} timing={fx.betting} me={fx.me} myBet="p3" onBet={noop} onPlace={noop} />,
  },
  'ph-reveal': {
    group: 'Phone', viewport: 'phone', note: 'Only your outcome — the board is on the TV',
    render: () => <PlayerReveal reveal={fx.reveal15} round={fx.round15} me={fx.me} />,
  },
  'ph-reveal-miss': {
    group: 'Phone', viewport: 'phone', note: 'A wild miss, and who took it',
    render: () => <PlayerReveal reveal={fx.reveal15} round={fx.round15} me={{ id: 'p6', name: 'Popy', colorIndex: 5 }} />,
  },
  'ph-scoreboard': {
    group: 'Phone', viewport: 'phone', note: 'Your block at full output, the field under it',
    render: () => <PlayerScoreboard scoreboard={fx.scoreboard15} me={fx.me} timing={fx.scoreboard15} />,
  },
  'ph-between': {
    group: 'Phone', viewport: 'phone', note: 'The look-up state',
    render: () => <PlayerBetween me={fx.me} scoreboard={fx.scoreboard15} intro={fx.intro} timing={fx.intro} />,
  },
  'ph-reconnecting': {
    group: 'Phone', viewport: 'phone', note: 'Seat and score held for 90s',
    render: () => <PlayerReconnecting me={fx.me} score={13} seatHoldUntil={Date.now() + 52000} onLeave={noop} />,
  },
  'ph-no-room': {
    group: 'Phone', viewport: 'phone', note: 'Wrong code, or the host ended it',
    render: () => <PlayerRoomError code="XKCD" onRetry={noop} onScan={noop} />,
  },
  'ph-game-over': {
    group: 'Phone', viewport: 'phone', note: 'How it ended, for you',
    render: () => <PlayerGameOver me={fx.me} final={fx.final15} onPlayAgain={noop} onLeave={noop} />,
  },
};

const VIEWPORT_SIZES = { tv: '1280x720', phone: '390x844', short: '375x667' };

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
