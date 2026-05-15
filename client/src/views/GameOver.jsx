import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Button,
  Leaderboard,
  Podium,
  TitleBlock,
  WinnerDisplay,
} from '@khelahobe/kui';

const BD_COLORS = ['#006A4E', '#F42A41', '#fbbf24', '#fcd34d', '#ffffff'];

function fireworks() {
  confetti({ particleCount: 110, spread: 70, origin: { x: 0.3, y: 0.5 }, colors: BD_COLORS });
  confetti({ particleCount: 110, spread: 70, origin: { x: 0.7, y: 0.5 }, colors: BD_COLORS });
}

function computeTiers(players) {
  const tiers = [];
  let rank = 1;
  for (let i = 0; i < players.length; ) {
    const score = players[i].score;
    const tied = [];
    while (i < players.length && players[i].score === score) tied.push(players[i++]);
    tiers.push({ rank, score, players: tied });
    rank += tied.length;
  }
  return tiers;
}

export default function GameOver({ final, setScreen }) {
  useEffect(() => {
    fireworks();
    const t = setTimeout(fireworks, 900);
    return () => clearTimeout(t);
  }, []);

  if (!final) return null;

  const tiers = computeTiers(final);
  const [tier1, tier2, tier3] = tiers;
  const champions = tier1?.players ?? [];

  // Build podium (KUI expects exactly 3, but we pad with placeholders only when ranks exist)
  const podiumWinners = [];
  if (tier1) podiumWinners.push({ rank: 1, name: tier1.players.map(p => p.name).join(' & '), initial: tier1.players[0].name[0], score: tier1.score });
  if (tier2) podiumWinners.push({ rank: 2, name: tier2.players.map(p => p.name).join(' & '), initial: tier2.players[0].name[0], score: tier2.score });
  if (tier3) podiumWinners.push({ rank: 3, name: tier3.players.map(p => p.name).join(' & '), initial: tier3.players[0].name[0], score: tier3.score });

  const rest = tiers.slice(3).flatMap(t => t.players.map(p => ({ ...p, rank: t.rank })));
  const restEntries = rest.map(p => ({
    id: p.id, rank: p.rank, name: p.name, initial: p.name[0], score: p.score,
  }));

  return (
    <div className="ek-page" style={{ gap: 24, paddingTop: 24 }}>
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <TitleBlock title="শেষ!" subtitle="GAME OVER" />
      </motion.div>

      {champions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ width: '100%', maxWidth: 600 }}
        >
          <WinnerDisplay
            winners={champions.map(p => ({
              name: p.name,
              initial: p.name[0],
              score: p.score,
            }))}
            animated
          />
        </motion.div>
      )}

      {podiumWinners.length === 3 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          style={{ width: '100%', maxWidth: 600 }}
        >
          <Podium winners={podiumWinners} />
        </motion.div>
      )}

      {restEntries.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{ width: '100%', maxWidth: 520 }}
        >
          <Leaderboard players={restEntries} />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.95 }}
      >
        <Button
          variant="primary"
          size="lg"
          onClick={() => setScreen('landing')}
          className="ek-bengali"
        >
          আবার খেলো · Play Again
        </Button>
      </motion.div>
    </div>
  );
}
