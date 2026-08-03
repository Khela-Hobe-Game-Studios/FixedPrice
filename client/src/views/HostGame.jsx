import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Badge,
  Button,
  Card,
  Leaderboard,
  ProgressBar,
  Timer,
} from '@khelahobe/kui';
import {
  FunFact,
  QuestionCard,
  RevealCard,
} from '@khelahobe/kui/fixedprice';
import socket from '../socket';
import EkCategoryBadge from '../components/EkCategoryBadge';
import { normCategory } from '../categories';

export default function HostGame({
  room,
  paused = false,
  initialRound,
  initialPhase = 'question',
  initialBetting = null,
  initialReveal = null,
  initialScoreboard = null,
}) {
  const [phase, setPhase] = useState(initialPhase);
  const [roundData, setRoundData] = useState(initialRound ?? null);
  const [revealData, setRevealData] = useState(initialReveal ?? null);
  const [bettingData, setBettingData] = useState(initialBetting ?? null);
  const [scoreboard, setScoreboard] = useState(initialScoreboard?.scoreboard ?? []);
  const [answerCount, setAnswerCount] = useState({ count: 0, total: initialRound?.players?.length ?? 0 });
  const [timeLeft, setTimeLeft] = useState(initialRound?.timer ?? 0);
  const timerRef = useRef(null);

  useEffect(() => {
    const onStart = (data) => {
      setRoundData(data);
      setRevealData(null);
      setBettingData(null);
      setAnswerCount({ count: 0, total: data.players.length });
      setTimeLeft(data.timer);
      setPhase('question');
    };
    const onAnswerCount = ({ count, total }) => setAnswerCount({ count, total });
    const onBetting = (data) => { setBettingData(data); setTimeLeft(data.timer); setPhase('betting'); };
    const onReveal = (data) => { setRevealData(data); setPhase('reveal'); };
    const onScoreboard = ({ scoreboard }) => { setScoreboard(scoreboard); setPhase('scoreboard'); };

    socket.on('round:start', onStart);
    socket.on('round:answer_count', onAnswerCount);
    socket.on('round:betting', onBetting);
    socket.on('round:reveal', onReveal);
    socket.on('round:scoreboard', onScoreboard);

    return () => {
      socket.off('round:start', onStart);
      socket.off('round:answer_count', onAnswerCount);
      socket.off('round:betting', onBetting);
      socket.off('round:reveal', onReveal);
      socket.off('round:scoreboard', onScoreboard);
    };
  }, []);

  // Freeze the countdown while the server has the game paused (host dropped),
  // otherwise the clock runs down against a round that isn't advancing.
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!paused && (phase === 'question' || phase === 'betting') && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, roundData, paused]);

  // Server sends revealMs sized to the field. Fire the confetti just before the
  // phase ends so it never lands on top of the scoreboard at high player counts.
  useEffect(() => {
    if (!revealData) return;
    const animEnd = (revealData.ranked.length * 0.45 + 0.5) * 1000;
    const phaseEnd = (revealData.revealMs ?? 5000) - 600;
    const delay = Math.max(0, Math.min(animEnd, phaseEnd));
    const t = setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 75,
        origin: { y: 0.5 },
        colors: ['#fbbf24', '#15a374', '#006A4E', '#F42A41', '#fcd34d'],
      });
    }, delay);
    return () => clearTimeout(t);
  }, [revealData]);

  function endGame() {
    if (window.confirm('End the game now and show the final scores?')) {
      socket.emit('host:end_game');
    }
  }

  const category = normCategory(roundData?.category);
  const answerPct = answerCount.total > 0 ? (answerCount.count / answerCount.total) * 100 : 0;

  const leaderboardEntries = scoreboard.map((p, i) => ({
    id: p.id,
    rank: i + 1,
    name: p.name + (p.strikes ? ` ${'⚡'.repeat(p.strikes)}` : ''),
    initial: p.name[0],
    score: p.score,
    eliminated: !!p.eliminated,
  }));

  const revealCount = revealData?.ranked.length ?? 0;
  const revealCols = revealCount > 12 ? 3 : revealCount > 6 ? 2 : 1;
  const dense = revealCols >= 3;

  // Split into balanced columns so a 15-player board fits one screen.
  const scoreCols = scoreboard.length > 8 ? 2 : 1;
  const perCol = Math.ceil(leaderboardEntries.length / scoreCols) || 1;
  const leaderboardChunks = Array.from({ length: scoreCols }, (_, i) =>
    leaderboardEntries.slice(i * perCol, (i + 1) * perCol)
  ).filter(c => c.length > 0);

  return (
    <div className="ek-page" style={{ gap: 20 }}>
      {roundData && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: 900,
          margin: '0 auto',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {category && <EkCategoryBadge category={category} />}
            <span style={{
              fontFamily: 'var(--kui-font-display)',
              fontWeight: 800,
              fontSize: 'var(--kui-text-md)',
              color: 'var(--kui-text)',
              letterSpacing: '0.05em',
            }}>
              Round {roundData.round} / {roundData.total}
            </span>
            {roundData.isBettingRound && (
              <Badge variant="voting" pulse>BETTING ROUND</Badge>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {(phase === 'question' || phase === 'betting') && (
              <Timer seconds={timeLeft} size="lg" />
            )}
            {/* Without these the host is stuck waiting out a full 30s timer for
                someone who has put their phone down. */}
            <Button variant="ghost" size="sm" onClick={() => socket.emit('host:skip')}>
              Skip ⏭
            </Button>
            <Button variant="ghost" size="sm" onClick={endGame}>
              End
            </Button>
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', flex: 1 }}>
        <AnimatePresence mode="wait">

          {phase === 'question' && roundData && (
            <motion.div key="question"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              <QuestionCard
                question={roundData.question}
                unit={roundData.unit}
              />
              <ProgressBar
                value={answerPct}
                label={`${answerCount.count} / ${answerCount.total} answered`}
                showCount={false}
              />
            </motion.div>
          )}

          {phase === 'betting' && bettingData && (
            <motion.div key="betting"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              <Card variant="secondary">
                <Card.Header>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center' }}>
                    <h2 style={{
                      fontFamily: 'var(--kui-font-display)', fontWeight: 800,
                      fontSize: 'var(--kui-text-3xl)', color: 'var(--kui-secondary)',
                    }}>Who do you trust?</h2>
                    <p style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)' }}>Players are betting on phones</p>
                  </div>
                </Card.Header>
                <Card.Body>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 12,
                  }}>
                    {bettingData.ranked.map(p => (
                      <div key={p.id} style={{
                        padding: 12,
                        background: 'var(--kui-surface)',
                        border: '2.5px solid var(--kui-secondary)',
                        borderRadius: 'var(--kui-radius-md)',
                        boxShadow: '3px 3px 0 var(--kui-secondary)',
                        textAlign: 'center',
                        fontWeight: 700,
                      }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: '50%',
                          background: 'var(--kui-secondary)', color: 'var(--kui-bg)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--kui-font-display)', fontWeight: 800,
                          fontSize: 'var(--kui-text-lg)', marginBottom: 8,
                        }}>{p.name[0].toUpperCase()}</div>
                        <div>{p.name}</div>
                      </div>
                    ))}
                  </div>
                </Card.Body>
              </Card>
            </motion.div>
          )}

          {phase === 'reveal' && revealData && (
            <motion.div key="reveal"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              {/* Side by side once the field is large — stacked, the answer and
                  fun fact ate the vertical room the reveal cards need. */}
              <div className={dense ? 'ek-reveal-head ek-reveal-head--split' : 'ek-reveal-head'}>
                <Card>
                  <Card.Body>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>Correct Answer</p>
                      <p style={{
                        fontFamily: 'var(--kui-font-display)', fontWeight: 800,
                        fontSize: dense ? 'var(--kui-text-3xl)' : 'var(--kui-text-hero)',
                        color: 'var(--kui-accent)',
                        lineHeight: 1.1, marginTop: 6,
                      }}>
                        {revealData.correctAnswer.toLocaleString()}
                        {revealData.unit && (
                          <em style={{ fontStyle: 'normal', fontSize: 'var(--kui-text-lg)', color: 'var(--kui-text-muted)', marginLeft: 10 }}>{revealData.unit}</em>
                        )}
                      </p>
                    </div>
                  </Card.Body>
                </Card>

                {revealData.funFact && <FunFact text={revealData.funFact} />}
              </div>

              {/* One tall column ran off the bottom of a 16:9 TV past ~8
                  players, hiding the winner — and nobody scrolls a TV. Fan out
                  into columns so the whole field lands above the fold. Cards
                  fill worst-first, so the winner is still revealed last. */}
              <div
                className={`ek-reveal-list${dense ? ' ek-reveal-list--compact' : ''}`}
                style={{ '--ek-reveal-cols': revealCols }}
              >
                {[...revealData.ranked].reverse().map((r, i) => {
                  const total = revealData.ranked.length;
                  const minDist = revealData.ranked[0]?.distance;
                  const isWinner = minDist != null && r.distance === minDist;
                  return (
                    <motion.div
                      key={r.id}
                      initial={isWinner ? { opacity: 0, scale: 0.7, y: 40 } : { opacity: 0, y: 60 }}
                      animate={isWinner ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, y: 0 }}
                      transition={isWinner
                        ? { delay: i * 0.45, type: 'spring', stiffness: 200, damping: 18 }
                        : { delay: i * 0.45, duration: 0.35 }
                      }
                    >
                      <RevealCard
                        rank={total - i}
                        total={total}
                        name={r.name}
                        initial={r.name[0]}
                        guess={r.guess}
                        distance={r.distance}
                        unit={revealData.unit}
                        isWinner={isWinner}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {phase === 'scoreboard' && (
            <motion.div key="scoreboard"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <h2 style={{
                fontFamily: 'var(--kui-font-display)', fontWeight: 800,
                fontSize: 'var(--kui-text-3xl)', textAlign: 'center',
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>Scoreboard</h2>
              {/* Everyone in the room should be able to find themselves on the
                  shared screen. This used to show the top 5 and "+10 more". */}
              <div
                className="ek-scoreboard-cols"
                style={{ '--ek-score-cols': scoreboard.length > 8 ? 2 : 1 }}
              >
                {leaderboardChunks.map((chunk, i) => (
                  <Leaderboard key={i} players={chunk} />
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
