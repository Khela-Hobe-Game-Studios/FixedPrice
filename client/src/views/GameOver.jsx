import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import styles from './GameOver.module.css';

const BD_COLORS = ['#006A4E', '#F42A41', '#fbbf24', '#ffffff'];

function fireworks() {
  confetti({ particleCount: 100, spread: 70, origin: { x: 0.3, y: 0.5 }, colors: BD_COLORS });
  confetti({ particleCount: 100, spread: 70, origin: { x: 0.7, y: 0.5 }, colors: BD_COLORS });
}

export default function GameOver({ final, setScreen }) {
  useEffect(() => {
    fireworks();
    const t = setTimeout(fireworks, 900);
    return () => clearTimeout(t);
  }, []);

  if (!final) return null;

  const [first, second, third] = final;
  const rest = final.slice(3);

  // Podium order: 2nd | 1st | 3rd
  const podiumOrder = [
    { player: second, rank: 2, height: 80,  delay: 0.45 },
    { player: first,  rank: 1, height: 120, delay: 0.2  },
    { player: third,  rank: 3, height: 55,  delay: 0.65 },
  ];

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
        {first && (
          <motion.div
            className={styles.winner}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.4, ease: 'backOut' }}
          >
            <span className={styles.winnerLabel}>Today's Champion 🏆</span>
            <div className={styles.winnerAvatar}>{first.name[0].toUpperCase()}</div>
            <span className={styles.winnerName}>{first.name}</span>
            <span className={styles.winnerScore}>{first.score} pts</span>
          </motion.div>
        )}

        {/* ── PODIUM ── */}
        <div className={styles.podiumRow}>
          {podiumOrder.map(({ player, rank, height, delay }) => {
            if (!player) return null;
            const medals = ['', '🥇', '🥈', '🥉'];
            const colors = ['', '#fbbf24', '#9ca3af', '#cd7f32'];
            return (
              <div key={rank} className={styles.podiumCol}>
                <motion.div
                  className={styles.podiumInfo}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay, duration: 0.3 }}
                >
                  <span className={styles.podiumMedal}>{medals[rank]}</span>
                  <span className={styles.podiumName}>{player.name}</span>
                  <span className={styles.podiumPts} style={{ color: colors[rank] }}>
                    {player.score}
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
            );
          })}
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
                <span className={styles.restRank}>#{i + 4}</span>
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
