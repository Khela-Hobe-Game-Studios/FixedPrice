import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../socket';
import styles from './PlayerGame.module.css';

export default function PlayerGame({ me }) {
  const [phase, setPhase] = useState('question'); // question | locked | betting | reveal | scoreboard
  const [roundData, setRoundData] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [bettingData, setBettingData] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [myRank, setMyRank] = useState(null);
  const [answer, setAnswer] = useState('');
  const [betTarget, setBetTarget] = useState(null);

  useEffect(() => {
    socket.on('round:start', (data) => {
      setRoundData(data);
      setAnswer('');
      setBetTarget(null);
      setRevealData(null);
      setBettingData(null);
      setPhase('question');
    });

    socket.on('round:betting', (data) => {
      setBettingData(data);
      setBetTarget(null);
      setPhase('betting');
    });

    socket.on('round:reveal', (data) => {
      setRevealData(data);
      setPhase('reveal');
    });

    socket.on('round:scoreboard', ({ scoreboard }) => {
      const entry = scoreboard.find(p => p.id === me?.id);
      if (entry) {
        setMyScore(entry.score);
        setMyRank(scoreboard.indexOf(entry) + 1);
      }
      setPhase('scoreboard');
    });

    return () => {
      socket.off('round:start');
      socket.off('round:betting');
      socket.off('round:reveal');
      socket.off('round:scoreboard');
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
              <span className={styles.category}>{roundData.category}</span>
              <span className={styles.roundNum}>Round {roundData.round}/{roundData.total}</span>
            </div>
            <p className={styles.question}>{roundData.question}</p>
            <p className={styles.unit}>Answer in <strong>{roundData.unit}</strong></p>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              className={styles.answerInput}
              onKeyDown={e => e.key === 'Enter' && submitAnswer()}
              autoFocus
            />
            <button
              className={styles.submitBtn}
              onClick={submitAnswer}
              disabled={!answer.trim()}
            >Lock In</button>
          </motion.div>
        )}

        {/* LOCKED */}
        {phase === 'locked' && (
          <motion.div key="locked" className={styles.card}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className={styles.lockedIcon}>✓</div>
            <p className={styles.lockedTitle}>Locked in</p>
            <p className={styles.lockedSub}>Waiting for everyone else…</p>
          </motion.div>
        )}

        {/* BETTING */}
        {phase === 'betting' && bettingData && (
          <motion.div key="betting" className={styles.card}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={styles.bettingTitle}>Who do you trust?</p>
            <p className={styles.bettingSubtitle}>Tap to place your bet</p>
            <div className={styles.bettingList}>
              {bettingData.ranked
                .filter(p => p.id !== me?.id)
                .map(p => (
                  <button
                    key={p.id}
                    className={`${styles.betCard} ${betTarget === p.id ? styles.betSelected : ''}`}
                    onClick={() => setBetTarget(p.id)}
                  >
                    <span className={styles.betAvatar}>{p.name[0].toUpperCase()}</span>
                    <span className={styles.betName}>{p.name}</span>
                    {betTarget === p.id && <span className={styles.betCheck}>✓</span>}
                  </button>
                ))}
            </div>
            <button
              className={styles.submitBtn}
              onClick={submitBet}
              disabled={!betTarget}
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
            <p className={styles.scoreLabel}>Your Score</p>
            <p className={styles.myScore}>{myScore}</p>
            <p className={styles.scoreUnit}>points</p>
            {myRank && <p className={styles.myRank}>Rank #{myRank}</p>}
            <p className={styles.nextRound}>Next round starting…</p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
