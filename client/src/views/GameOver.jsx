import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import styles from './GameOver.module.css';

const BD_COLORS = ['#006A4E', '#F42A41', '#fbbf24', '#ffffff'];

function fireworks() {
  confetti({ particleCount: 100, spread: 70, origin: { x: 0.3, y: 0.5 }, colors: BD_COLORS });
  confetti({ particleCount: 100, spread: 70, origin: { x: 0.7, y: 0.5 }, colors: BD_COLORS });
}

// Group players into rank tiers accounting for ties
function computeTiers(players) {
  const tiers = [];
  let rank = 1;
  for (let i = 0; i < players.length; ) {
    const score = players[i].score;
    const tied = [];
    while (i < players.length && players[i].score === score) {
      tied.push(players[i++]);
    }
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
  const rest = tiers.slice(3).flatMap(t => t.players.map(p => ({ ...p, rank: t.rank })));

  const medals  = ['', '🥇', '🥈', '🥉'];
  const colors  = ['', '#fbbf24', '#9ca3af', '#cd7f32'];
  const heights = [0, 120, 80, 55];

  // Podium order: 2nd | 1st | 3rd
  const podiumOrder = [
    tier2 && { tier: tier2, rank: 2, height: heights[2], delay: 0.45 },
    tier1 && { tier: tier1, rank: 1, height: heights[1], delay: 0.2  },
    tier3 && { tier: tier3, rank: 3, height: heights[3], delay: 0.65 },
  ].filter(Boolean);

  const champions = tier1?.players ?? [];
  const isTied = champions.length > 1;

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      <div className={styles.content}>

        {/* ── TITLE ── */}
        <motion.div
          className={styles.titleBlock}
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className={styles.title}>শেষ!</h1>
          <span className={styles.titleSub}>GAME OVER</span>
        </motion.div>

        {/* ── WINNER HERO ── */}
        {champions.length > 0 && (
          <motion.div
            className={styles.winner}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.4, ease: 'backOut' }}
          >
            <span className={styles.winnerLabel}>
              {isTied ? 'Co-Champions 🏆' : "Today's Champion 🏆"}
            </span>
            <div className={styles.winnerAvatars}>
              {champions.map(p => (
                <div key={p.id} className={styles.winnerAvatar}>{p.name[0].toUpperCase()}</div>
              ))}
            </div>
            <span className={styles.winnerName}>
              {champions.map(p => p.name).join(' & ')}
            </span>
            <span className={styles.winnerScore}>{champions[0].score} pts</span>
          </motion.div>
        )}

        {/* ── PODIUM ── */}
        <div className={styles.podiumRow}>
          {podiumOrder.map(({ tier, rank, height, delay }) => (
            <div key={rank} className={styles.podiumCol}>
              <motion.div
                className={styles.podiumInfo}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay, duration: 0.3 }}
              >
                <span className={styles.podiumMedal}>{medals[rank]}</span>
                <span className={styles.podiumName}>
                  {tier.players.map(p => p.name).join(' & ')}
                </span>
                <span className={styles.podiumPts} style={{ color: colors[rank] }}>
                  {tier.score}
                </span>
              </motion.div>
              <motion.div
                className={styles.podiumBlock}
                style={{ height, background: `${colors[rank]}22`, borderColor: colors[rank] }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: delay + 0.1, duration: 0.4, ease: 'backOut' }}
              >
                <span className={styles.podiumRank} style={{ color: colors[rank] }}>
                  #{rank}
                </span>
              </motion.div>
            </div>
          ))}
        </div>

        {/* ── REST ── */}
        {rest.length > 0 && (
          <div className={styles.restList}>
            {rest.map((p, i) => (
              <motion.div
                key={p.id}
                className={styles.restRow}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.07 }}
              >
                <span className={styles.restRank}>#{p.rank}</span>
                <span className={styles.restName}>{p.name}</span>
                <span className={styles.restScore}>{p.score} pts</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── PLAY AGAIN ── */}
        <motion.button
          className={styles.playAgain}
          onClick={() => setScreen('landing')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
        >
          Play Again
        </motion.button>

      </div>
    </div>
  );
}
