import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../socket';
import styles from './HostGame.module.css';

export default function HostGame({ room }) {
  const [phase, setPhase] = useState('question'); // question | reveal | betting | scoreboard
  const [roundData, setRoundData] = useState(null);      // from round:start
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

  const maxTime = phase === 'betting' ? 20 : (roundData?.timer ?? 30);
  const timerPct = maxTime > 0 ? timeLeft / maxTime : 0;
  const timerColor = timerPct > 0.5 ? '#4ade80' : timerPct > 0.25 ? '#facc15' : '#ef4444';

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      {/* Top bar */}
      {roundData && (
        <div className={styles.topBar}>
          <span className={styles.category}>{roundData.category}</span>
          <span className={styles.roundNum}>Round {roundData.round} / {roundData.total}</span>
          {roundData.isBettingRound && <span className={styles.bettingBadge}>BETTING ROUND</span>}

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
            <p className={styles.answerCount}>{answerCount.count} / {answerCount.total} answered</p>
          </motion.div>
        )}

        {/* BETTING PHASE */}
        {phase === 'betting' && bettingData && (
          <motion.div key="betting" className={styles.bettingPhase}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
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
                const isWinner = i === revealData.ranked.length - 1;
                const distance = r.distance === Infinity ? '—' : r.distance.toLocaleString();
                return (
                  <motion.div
                    key={r.id}
                    className={`${styles.revealCard} ${isWinner ? styles.winner : ''}`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.35, duration: 0.3 }}
                  >
                    <span className={styles.revealRank}>#{revealData.ranked.length - i}</span>
                    <span className={styles.revealName}>{r.name}</span>
                    <span className={styles.revealGuess}>{r.guess?.toLocaleString() ?? '—'}</span>
                    <span className={styles.revealDist}>off by {distance}</span>
                    {isWinner && <span className={styles.crown}>👑</span>}
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
              {scoreboard.map((p, i) => (
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
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
