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
  settings: { questionCount: 10, eliminationMode: false, bettingRounds: true, backgroundMusic: true },
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

export function renderPreview(name) {
  const noop = () => {};
  switch (name) {
    case 'host-lobby':
      return <HostLobby room={room} setRoom={noop} setMe={noop} me={null} setScreen={noop} onStartGame={noop} />;
    case 'host-lobby-empty':
      return <HostLobby room={{ ...room, players: [] }} setRoom={noop} setMe={noop} me={null} setScreen={noop} onStartGame={noop} />;
    case 'player-lobby':
      return <PlayerLobby room={room} me={me} setRoom={noop} setMe={noop} setScreen={noop} />;
    case 'host-question':
      return <HostGame room={room} initialRound={roundData} initialPhase="question" setRoom={noop} setMe={noop} me={null} setScreen={noop} />;
    case 'host-betting':
      return <HostGame room={room} initialRound={{ ...roundData, isBettingRound: true, round: 5 }} initialPhase="betting" initialBetting={bettingData} setRoom={noop} setMe={noop} me={null} setScreen={noop} />;
    case 'host-reveal':
      return <HostGame room={room} initialRound={roundData} initialPhase="reveal" initialReveal={revealData} setRoom={noop} setMe={noop} me={null} setScreen={noop} />;
    case 'host-scoreboard':
      return <HostGame room={room} initialRound={roundData} initialPhase="scoreboard" initialScoreboard={scoreboardData} setRoom={noop} setMe={noop} me={null} setScreen={noop} />;
    case 'player-question':
      return <PlayerGame me={me} initialRound={roundData} initialPhase="question" setRoom={noop} setMe={noop} setScreen={noop} room={room} />;
    case 'player-locked':
      return <PlayerGame me={me} initialRound={roundData} initialPhase="locked" setRoom={noop} setMe={noop} setScreen={noop} room={room} />;
    case 'player-betting':
      return <PlayerGame me={me} initialRound={{ ...roundData, isBettingRound: true }} initialPhase="betting" initialBetting={bettingData} setRoom={noop} setMe={noop} setScreen={noop} room={room} />;
    case 'player-reveal':
      return <PlayerGame me={me} initialRound={roundData} initialPhase="reveal" initialReveal={revealData} setRoom={noop} setMe={noop} setScreen={noop} room={room} />;
    case 'player-scoreboard':
      return <PlayerGame me={me} initialRound={roundData} initialPhase="scoreboard" initialScoreboard={scoreboardData} setRoom={noop} setMe={noop} setScreen={noop} room={room} />;
    case 'game-over':
      return <GameOver final={final} setScreen={noop} />;
    default:
      return <div style={{ padding: 40 }}>Unknown preview: {name}</div>;
  }
}
