import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import socket from '../socket';
import styles from './PlayerGame.module.css';

const CAT_COLORS = {
  'Desh':        '#4ade80',
  'Cricket':     '#fb923c',
  'Taka':        '#fbbf24',
  'Global':      '#818cf8',
  'Weird Facts': '#e879f9',
};

const WAITING_PHRASES = [
  "Others are still thinking…",
  "Will anyone beat you?",
  "Fingers crossed 🤞",
];

export default function PlayerGame({ me, initialRound, initialPhase = 'question', initialBetting = null, initialReveal = null, initialScoreboard = null }) {
  const [phase, setPhase] = useState(initialPhase);
  const [roundData, setRoundData] = useState(initialRound ?? null);
  const [revealData, setRevealData] = useState(initialReveal ?? null);
  const [bettingData, setBettingData] = useState(initialBetting ?? null);
  const [myScore, setMyScore] = useState(() => {
    const entry = initialScoreboard?.scoreboard?.find(p => p.name === me?.name);
    return entry?.score ?? 0;
  });
  const [myRank, setMyRank] = useState(() => {
    if (!initialScoreboard?.scoreboard) return null;
    const idx = initialScoreboard.scoreboard.findIndex(p => p.name === me?.name);
    return idx >= 0 ? idx + 1 : null;
  });
  const [scoreboardData, setScoreboardData] = useState(initialScoreboard?.scoreboard ?? []);
  const [answer, setAnswer] = useState('');
  const [betTarget, setBetTarget] = useState(null);
  const [inputFocused, setInputFocused] = useState(false);

  // Pick a waiting phrase once per component mount
  const waitingPhrase = useMemo(
    () => WAITING_PHRASES[Math.floor(Math.random() * WAITING_PHRASES.length)],
    []
  );

  // Count-up animation for scoreboard score
  const count = useMotionValue(0);
  const rounded = useTransform(count, v => Math.round(v));

  useEffect(() => {
    if (phase === 'scoreboard') {
      const controls = animate(count, myScore, { duration: 0.8, ease: 'easeOut' });
      return controls.stop;
    }
  }, [phase, myScore]);

  useEffect(() => {
    const onStart = (data) => {
      setRoundData(data);
      setAnswer('');
      setBetTarget(null);
      setRevealData(null);
      setBettingData(null);
      setScoreboardData([]);
      setPhase('question');
    };
    const onBetting = (data) => {
      setBettingData(data);
      setBetTarget(null);
      setPhase('betting');
    };
    const onReveal = (data) => {
      setRevealData(data);
      setPhase('reveal');
    };
    const onScoreboard = ({ scoreboard }) => {
      const entry = scoreboard.find(p => p.id === me?.id || p.name === me?.name);
      if (entry) {
        setMyScore(entry.score);
        setMyRank(scoreboard.indexOf(entry) + 1);
      }
      setScoreboardData(scoreboard);
      setPhase('scoreboard');
    };

    socket.on('round:start', onStart);
    socket.on('round:betting', onBetting);
    socket.on('round:reveal', onReveal);
    socket.on('round:scoreboard', onScoreboard);

    return () => {
      socket.off('round:start', onStart);
      socket.off('round:betting', onBetting);
      socket.off('round:reveal', onReveal);
      socket.off('round:scoreboard', onScoreboard);
    };
  }, [me?.id]);

  function submitAnswer() {
    if (!answer.trim()) return;
    socket.emit('player:submit_answer', { answer: Number(answer) });
    setPhase('locked');
  }

  function submitBet() {
    if (!betTarget) return;
    socket.emit('player:submit_bet', { targetId: betTarget });
    setPhase('locked');
  }

  const catColor = CAT_COLORS[roundData?.category] ?? 'var(--accent3)';
  const myResult = revealData?.ranked.find(r => r.id === me?.id);
  const isWinner = revealData?.ranked[0]?.id === me?.id;

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      <AnimatePresence mode="wait">

        {/* QUESTION */}
        {phase === 'question' && roundData && (
          <motion.div key="question" className={styles.card}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={styles.meta}>
              <span
                className={styles.category}
                style={{
                  color: catColor,
                  background: `${catColor}1a`,
                  borderColor: `${catColor}40`,
                }}
              >{roundData.category}</span>
              <span className={styles.roundNum}>Round {roundData.round}/{roundData.total}</span>
            </div>
            <p className={styles.question}>{roundData.question}</p>
            <p className={styles.unit}>Answer in <strong>{roundData.unit}</strong></p>
            {/* Accent strip above input */}
            <div className={styles.inputAccent} style={{ background: catColor }} />
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              className={styles.answerInput}
              onKeyDown={e => e.key === 'Enter' && submitAnswer()}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              style={inputFocused
                ? { borderColor: catColor, boxShadow: `0 0 0 4px ${catColor}26` }
                : { borderColor: catColor }}
              autoFocus
            />
            <button
              className={styles.submitBtn}
              onClick={submitAnswer}
              disabled={!answer.trim()}
              style={{ background: catColor }}
            >Lock In</button>
          </motion.div>
        )}

        {/* LOCKED */}
        {phase === 'locked' && (
          <motion.div key="locked" className={styles.card}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className={styles.lockedIcon}
              initial={{ scale: 0.8 }}
              animate={{ scale: [0.8, 1.1, 1] }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >✓</motion.div>
            <p className={styles.lockedTitle}>জমা দেওয়া হয়েছে!</p>
            <p className={styles.lockedSub}>Answer submitted</p>
            <p className={styles.waitingPhrase}>{waitingPhrase}</p>
          </motion.div>
        )}

        {/* BETTING */}
        {phase === 'betting' && bettingData && (
          <motion.div key="betting" className={styles.card}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={styles.bettingTitle}>Who do you trust?</p>
            <p className={styles.bettingSubtitle}>Pick one — +1 pt if they win this round</p>
            <div className={styles.bettingList}>
              {bettingData.ranked
                .map((p, i) => ({ ...p, rank: i + 1 }))
                .filter(p => p.id !== me?.id && p.name !== me?.name)
                .slice(0, 10)
                .map(p => (
                  <button
                    key={p.id}
                    className={`${styles.betCard} ${betTarget === p.id ? styles.betSelected : ''}`}
                    onClick={() => setBetTarget(p.id)}
                  >
                    <span className={styles.betRank}>#{p.rank}</span>
                    <span
                      className={styles.betAvatar}
                      style={{ background: catColor }}
                    >{p.name[0].toUpperCase()}</span>
                    <span className={styles.betName}>{p.name}</span>
                    <span className={styles.betScore}>{p.score} pts</span>
                    {betTarget === p.id && <span className={styles.betCheck}>✓</span>}
                  </button>
                ))}
            </div>
            <button
              className={styles.submitBtn}
              onClick={submitBet}
              disabled={!betTarget}
              style={{ background: catColor }}
            >Place Bet</button>
          </motion.div>
        )}

        {/* REVEAL */}
        {phase === 'reveal' && revealData && (
          <motion.div key="reveal" className={styles.card}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className={styles.revealLabel}>Correct Answer</p>
            <p className={styles.revealAnswer}>
              {revealData.correctAnswer.toLocaleString()}
              <span className={styles.revealUnit}> {revealData.unit}</span>
            </p>
            {revealData.funFact && <p className={styles.funFact}>{revealData.funFact}</p>}
            {myResult && (
              <div className={`${styles.myResult} ${isWinner ? styles.myResultWin : ''}`}>
                <div className={styles.myResultRow}>
                  <span className={styles.myResultLabel}>Your guess</span>
                  <span className={styles.myResultVal}>{myResult.guess?.toLocaleString() ?? '—'}</span>
                </div>
                <div className={styles.myResultRow}>
                  <span className={styles.myResultLabel}>Off by</span>
                  <span className={styles.myResultVal}>
                    {myResult.distance === Infinity ? '—' : myResult.distance.toLocaleString()}
                  </span>
                </div>
                {isWinner && <p className={styles.winMsg}>You won this round!</p>}
              </div>
            )}
          </motion.div>
        )}

        {/* SCOREBOARD */}
        {phase === 'scoreboard' && (
          <motion.div key="scoreboard" className={styles.card}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <p className={styles.scoreLabel}>Scoreboard</p>
            <div className={styles.miniBoard}>
              {scoreboardData.slice(0, 5).map((p, i) => {
                const isMe = p.id === me?.id;
                return (
                  <motion.div
                    key={p.id}
                    className={`${styles.miniBoardRow} ${isMe ? styles.miniBoardMe : ''}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <span className={styles.miniBoardRank}>#{i + 1}</span>
                    <span className={styles.miniBoardName}>{isMe ? 'You' : p.name}</span>
                    <span className={styles.miniBoardScore}>
                      <motion.span>{isMe ? rounded : p.score}</motion.span> pts
                    </span>
                  </motion.div>
                );
              })}
              {myRank > 5 && (
                <>
                  <div className={styles.miniBoardSep}>· · ·</div>
                  <motion.div
                    className={`${styles.miniBoardRow} ${styles.miniBoardMe}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 }}
                  >
                    <span className={styles.miniBoardRank}>#{myRank}</span>
                    <span className={styles.miniBoardName}>You</span>
                    <span className={styles.miniBoardScore}>
                      <motion.span>{rounded}</motion.span> pts
                    </span>
                  </motion.div>
                </>
              )}
            </div>
            {myRank === 1 && <p className={styles.topRank}>👑 এক নম্বর!</p>}
            <p className={styles.nextRound}>Next round starting…</p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
