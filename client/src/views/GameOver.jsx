import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import styles from './GameOver.module.css';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_COLORS = ['#fbbf24', '#9ca3af', '#b45309'];

export default function GameOver({ final, setScreen }) {
  useEffect(() => {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.4 }, colors: ['#006A4E', '#F42A41', '#fbbf24', '#ffffff'] });
  }, []);

  if (!final) return null;

  const podium = final.slice(0, 3);
  const rest = final.slice(3);

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      <div className={styles.content}>
        <motion.div
          className={styles.titleBlock}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className={styles.title}>শেষ!</h1>
          <span className={styles.titleSub}>GAME OVER</span>
        </motion.div>

        {/* Podium */}
        <div className={styles.podium}>
          {podium.map((p, i) => (
            <motion.div
              key={p.id}
              className={styles.podiumCard}
              style={{ borderColor: MEDAL_COLORS[i] }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.2, duration: 0.35 }}
            >
              <span className={styles.medal}>{MEDALS[i]}</span>
              <span className={styles.podiumName}>{p.name}</span>
              <span className={styles.podiumScore} style={{ color: MEDAL_COLORS[i] }}>
                {p.score} pts
              </span>
              {p.strikes > 0 && (
                <span className={styles.strikes}>{'⚡'.repeat(p.strikes)}</span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Rest of players */}
        {rest.length > 0 && (
          <div className={styles.restList}>
            {rest.map((p, i) => (
              <motion.div
                key={p.id}
                className={styles.restRow}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.07 }}
              >
                <span className={styles.restRank}>#{i + 4}</span>
                <span className={styles.restName}>{p.name}</span>
                {p.strikes > 0 && <span className={styles.strikes}>{'⚡'.repeat(p.strikes)}</span>}
                <span className={styles.restScore}>{p.score} pts</span>
              </motion.div>
            ))}
          </div>
        )}

        <motion.button
          className={styles.playAgain}
          onClick={() => setScreen('landing')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          Play Again
        </motion.button>
      </div>
    </div>
  );
}
