import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import socket from '../socket';
import styles from './HostGame.module.css';

// Returns border color and bg tint based on position in the reversed reveal array.
// index 0 = furthest, index total-1 = winner (closest).
function getRevealColor(index, total) {
  if (total <= 1) return { border: '#4ade80', bg: 'rgba(74,222,128,0.08)' };
  const rank = index; // 0 = furthest
  if (rank === total - 1) return { border: '#4ade80', bg: 'rgba(74,222,128,0.08)' };   // winner
  if (rank === total - 2) return { border: '#a3e635', bg: 'rgba(163,230,53,0.06)' };    // 2nd closest
  if (rank === total - 3) return { border: '#facc15', bg: 'rgba(250,204,21,0.06)' };    // 3rd closest
  if (rank === 0)         return { border: '#ef4444', bg: 'transparent' };              // furthest
  return { border: '#fb923c', bg: 'transparent' };                                      // mid positions
}

export default function HostGame({ room, initialRound }) {
  const [phase, setPhase] = useState('question');
  const [roundData, setRoundData] = useState(initialRound ?? null);
  const [revealData, setRevealData] = useState(null);    // from round:reveal
  const [bettingData, setBettingData] = useState(null);  // from round:betting
  const [scoreboard, setScoreboard] = useState([]);      // from round:scoreboard
  const [answerCount, setAnswerCount] = useState({ count: 0, total: 0 });
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    socket.on('round:start', (data) => {
      setRoundData(data);
      setRevealData(null);
      setBettingData(null);
      setAnswerCount({ count: 0, total: data.players.length });
      setTimeLeft(data.timer);
      setPhase('question');
    });

    socket.on('round:answer_count', ({ count, total }) => {
      setAnswerCount({ count, total });
    });

    socket.on('round:betting', (data) => {
      setBettingData(data);
      setTimeLeft(data.timer);
      setPhase('betting');
    });

    socket.on('round:reveal', (data) => {
      setRevealData(data);
      setPhase('reveal');
    });

    socket.on('round:scoreboard', ({ scoreboard }) => {
      setScoreboard(scoreboard);
      setPhase('scoreboard');
    });

    return () => {
      socket.off('round:start');
      socket.off('round:answer_count');
      socket.off('round:betting');
      socket.off('round:reveal');
      socket.off('round:scoreboard');
    };
  }, []);

  // Local countdown ticker
  useEffect(() => {
    clearInterval(timerRef.current);
    if ((phase === 'question' || phase === 'betting') && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, roundData]);

  // Confetti fires after all reveal cards have animated in
  useEffect(() => {
    if (!revealData) return;
    const delay = (revealData.ranked.length * 0.45 + 0.5) * 1000;
    const t = setTimeout(() => {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 }, colors: ['#fbbf24', '#4ade80', '#006A4E', '#F42A41'] });
    }, delay);
    return () => clearTimeout(t);
  }, [revealData]);

  const maxTime = phase === 'betting' ? 20 : (roundData?.timer ?? 30);
  const timerPct = maxTime > 0 ? timeLeft / maxTime : 0;
  const timerColor = timerPct > 0.5 ? '#4ade80' : timerPct > 0.25 ? '#facc15' : '#ef4444';

  const answerUrgent = answerCount.total > 0 && answerCount.count >= answerCount.total * 0.7;

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      {/* Top bar */}
      {roundData && (
        <div className={styles.topBar}>
          <span className={styles.category}>{roundData.category}</span>
          <span className={styles.roundNum}>Round {roundData.round} / {roundData.total}</span>
          {roundData.isBettingRound && (
            <span className={`${styles.bettingBadge}`}>BETTING ROUND</span>
          )}

          {/* Timer ring */}
          {(phase === 'question' || phase === 'betting') && (
            <div className={styles.timerWrap}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border)" strokeWidth="5" />
                <motion.circle
                  cx="32" cy="32" r="28"
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={2 * Math.PI * 28 * (1 - timerPct)}
                  transform="rotate(-90 32 32)"
                  animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - timerPct) }}
                  transition={{ duration: 0.5 }}
                />
              </svg>
              <motion.span
                className={styles.timerNum}
                style={{ color: timerColor }}
                animate={timeLeft <= 5 ? { scale: [1, 1.2, 1] } : {}}
                transition={{ repeat: Infinity, duration: 0.6 }}
              >{timeLeft}</motion.span>
            </div>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* QUESTION PHASE */}
        {phase === 'question' && roundData && (
          <motion.div key="question" className={styles.questionPhase}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={styles.question}>{roundData.question}</p>
            <p className={styles.unit}>Answer in: <strong>{roundData.unit}</strong></p>
            <div className={styles.answerBar}>
              <div
                className={styles.answerFill}
                style={{ width: answerCount.total > 0 ? `${(answerCount.count / answerCount.total) * 100}%` : '0%' }}
              />
            </div>
            <p
              className={styles.answerCount}
              style={answerUrgent ? { color: 'var(--accent)' } : undefined}
            >
              {answerCount.count} / {answerCount.total} answered
            </p>
          </motion.div>
        )}

        {/* BETTING PHASE */}
        {phase === 'betting' && bettingData && (
          <motion.div key="betting" className={styles.bettingPhase}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={styles.bettingInner}>
              <p className={styles.bettingPrompt}>Who do you trust?</p>
              <p className={styles.bettingSubtitle}>Players are betting on phones</p>
              <div className={styles.bettingGrid}>
                {bettingData.ranked.map(p => (
                  <div key={p.id} className={styles.bettingCard}>
                    <span className={styles.bettingAvatar}>{p.name[0].toUpperCase()}</span>
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* REVEAL PHASE */}
        {phase === 'reveal' && revealData && (
          <motion.div key="reveal" className={styles.revealPhase}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className={styles.correctAnswer}>
              Correct: <strong>{revealData.correctAnswer.toLocaleString()} {revealData.unit}</strong>
            </p>
            {revealData.funFact && (
              <p className={styles.funFact}>{revealData.funFact}</p>
            )}
            <div className={styles.revealList}>
              {[...revealData.ranked].reverse().map((r, i) => {
                const total = revealData.ranked.length;
                const isWinner = i === total - 1;
                const distance = r.distance === Infinity ? '—' : r.distance.toLocaleString();
                const { border, bg } = getRevealColor(i, total);
                return (
                  <motion.div
                    key={r.id}
                    className={`${styles.revealCard} ${isWinner ? styles.winner : ''}`}
                    style={{ borderLeft: `4px solid ${border}`, background: bg }}
                    initial={isWinner
                      ? { opacity: 0, scale: 0.7, y: 40 }
                      : { opacity: 0, y: 60 }
                    }
                    animate={isWinner
                      ? { opacity: 1, scale: 1, y: 0 }
                      : { opacity: 1, y: 0 }
                    }
                    transition={isWinner
                      ? { delay: i * 0.45, type: 'spring', stiffness: 200, damping: 18 }
                      : { delay: i * 0.45, duration: 0.35 }
                    }
                  >
                    <span className={styles.revealRank}>#{total - i}</span>
                    <span className={styles.revealName}>{r.name}</span>
                    <span className={styles.revealGuess}>{r.guess?.toLocaleString() ?? '—'}</span>
                    <span className={styles.revealDist}>off by {distance}</span>
                    {isWinner && <span className={`${styles.crown} ${styles.winnerGlow}`}>👑</span>}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* SCOREBOARD PHASE */}
        {phase === 'scoreboard' && (
          <motion.div key="scoreboard" className={styles.scoreboardPhase}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <h2 className={styles.scoreboardTitle}>Scoreboard</h2>
            <div className={styles.scoreList}>
              {scoreboard.slice(0, 5).map((p, i) => (
                <motion.div
                  key={p.id}
                  className={`${styles.scoreRow} ${p.eliminated ? styles.eliminated : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                >
                  <span className={styles.scoreRank}>{i + 1}</span>
                  <span className={styles.scoreName}>{p.name}</span>
                  {p.strikes > 0 && (
                    <span className={styles.strikes}>{'⚡'.repeat(p.strikes)}</span>
                  )}
                  <span className={styles.scorePoints}>{p.score} pts</span>
                </motion.div>
              ))}
            </div>
            {scoreboard.length > 5 && (
              <p className={styles.moreCount}>+{scoreboard.length - 5} more players</p>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
