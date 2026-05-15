import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Avatar,
  Badge,
  Button,
  Card,
} from '@khelahobe/kui';
import {
  AnswerInput,
  BettingPanel,
  CategoryBadge,
  FunFact,
  MiniLeaderboard,
  QuestionCard,
} from '@khelahobe/kui/fixedprice';
import socket from '../socket';

const CAT_COLORS = {
  desh:    '#15a374',
  cricket: '#fb923c',
  taka:    '#fbbf24',
  global:  '#818cf8',
  weird:   '#e879f9',
};
const CATEGORY_KEYS = Object.keys(CAT_COLORS);
function normCategory(raw) {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase();
  return CATEGORY_KEYS.find(k => v.includes(k));
}

const WAITING_PHRASES = [
  'Others are still thinking…',
  'Will anyone beat you?',
  'Fingers crossed 🤞',
];

export default function PlayerGame({
  me,
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
  const [scoreboardData, setScoreboardData] = useState(initialScoreboard?.scoreboard ?? []);
  const [myScore, setMyScore] = useState(() => {
    const entry = initialScoreboard?.scoreboard?.find(p => p.name === me?.name);
    return entry?.score ?? 0;
  });
  const [myRank, setMyRank] = useState(() => {
    if (!initialScoreboard?.scoreboard) return null;
    const idx = initialScoreboard.scoreboard.findIndex(p => p.name === me?.name);
    return idx >= 0 ? idx + 1 : null;
  });
  const [answer, setAnswer] = useState('');
  const [betTarget, setBetTarget] = useState(null);

  const waitingPhrase = useMemo(
    () => WAITING_PHRASES[Math.floor(Math.random() * WAITING_PHRASES.length)],
    []
  );

  useEffect(() => {
    const onStart = (data) => {
      setRoundData(data);
      setAnswer('');
      setBetTarget(null);
      setRevealData(null);
      setBettingData(null);
      setPhase('question');
    };
    const onBetting = (data) => { setBettingData(data); setBetTarget(null); setPhase('betting'); };
    const onReveal  = (data) => { setRevealData(data);  setPhase('reveal'); };
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
    if (!answer.toString().trim()) return;
    socket.emit('player:submit_answer', { answer: Number(answer) });
    setPhase('locked');
  }

  function submitBet() {
    if (!betTarget) return;
    socket.emit('player:submit_bet', { targetId: betTarget });
    setPhase('locked');
  }

  const category = normCategory(roundData?.category);
  const catColor = category ? CAT_COLORS[category] : 'var(--kui-accent)';
  const myResult = revealData?.ranked.find(r => r.id === me?.id || r.name === me?.name);
  const minDist  = revealData?.ranked[0]?.distance;
  const isWinner = minDist != null && myResult?.distance === minDist;

  const leaderboardEntries = scoreboardData.map((p, i) => ({
    id: p.id,
    rank: i + 1,
    name: p.name,
    initial: p.name[0],
    score: p.score,
    isMe: p.id === me?.id || p.name === me?.name,
    eliminated: !!p.eliminated,
  }));

  const myId = scoreboardData.find(p => p.id === me?.id || p.name === me?.name)?.id;

  return (
    <div className="ek-page" style={{ paddingTop: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <AnimatePresence mode="wait">

          {phase === 'question' && roundData && (
            <motion.div key="question"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                {category && <CategoryBadge category={category} />}
                <span style={{ fontFamily: 'var(--kui-font-display)', fontWeight: 700, color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)' }}>
                  Round {roundData.round}/{roundData.total}
                </span>
              </div>
              <QuestionCard question={roundData.question} unit={roundData.unit} />
              <AnswerInput
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="0"
                unit={roundData.unit}
                accentColor={catColor}
                onSubmit={submitAnswer}
                autoFocus
              />
              <Button
                variant="primary"
                size="lg"
                onClick={submitAnswer}
                disabled={!answer.toString().trim()}
                style={{ width: '100%', background: catColor, borderColor: catColor }}
              >
                Lock In
              </Button>
            </motion.div>
          )}

          {phase === 'locked' && (
            <motion.div key="locked"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            >
              <Card>
                <Card.Body>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: [0.8, 1.15, 1] }}
                      transition={{ duration: 0.45 }}
                    >
                      <Avatar initial="✓" size="xl" isWinner color="#15a374" />
                    </motion.div>
                    <h2 className="ek-bengali" style={{ fontFamily: 'var(--kui-font-bengali)', fontWeight: 700, fontSize: 'var(--kui-text-2xl)' }}>
                      জমা দেওয়া হয়েছে!
                    </h2>
                    <Badge variant="success">Answer submitted</Badge>
                    <p style={{ fontStyle: 'italic', color: 'var(--kui-text-muted)' }}>{waitingPhrase}</p>
                  </div>
                </Card.Body>
              </Card>
            </motion.div>
          )}

          {phase === 'betting' && bettingData && (
            <motion.div key="betting"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ textAlign: 'center' }}>
                <h2 style={{
                  fontFamily: 'var(--kui-font-display)', fontWeight: 800,
                  fontSize: 'var(--kui-text-2xl)', color: 'var(--kui-secondary)',
                }}>Who do you trust?</h2>
                <p style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)' }}>
                  Pick one — +1 pt if they win this round
                </p>
              </div>
              <BettingPanel
                options={
                  bettingData.ranked
                    .map((p, i) => ({ id: p.id, name: p.name, initial: p.name[0], rank: i + 1, score: p.score ?? 0 }))
                    .filter(p => p.id !== me?.id && p.name !== me?.name)
                    .slice(0, 10)
                }
                selectedBet={betTarget}
                onBet={setBetTarget}
              />
              <Button
                variant="primary"
                size="lg"
                onClick={submitBet}
                disabled={!betTarget}
                style={{ width: '100%' }}
              >
                Place Bet
              </Button>
            </motion.div>
          )}

          {phase === 'reveal' && revealData && (
            <motion.div key="reveal"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <Card>
                <Card.Body>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>Correct Answer</p>
                    <p style={{
                      fontFamily: 'var(--kui-font-display)', fontWeight: 800,
                      fontSize: 'var(--kui-text-3xl)', color: 'var(--kui-accent)',
                      lineHeight: 1.1, marginTop: 6,
                    }}>
                      {revealData.correctAnswer.toLocaleString()}
                      {revealData.unit && (
                        <em style={{ fontStyle: 'normal', fontSize: 'var(--kui-text-md)', color: 'var(--kui-text-muted)', marginLeft: 8 }}>{revealData.unit}</em>
                      )}
                    </p>
                  </div>
                </Card.Body>
              </Card>

              {revealData.funFact && <FunFact text={revealData.funFact} />}

              {myResult && (
                <Card variant={isWinner ? 'default' : 'secondary'} style={isWinner ? { borderColor: '#15a374', boxShadow: '4px 4px 0 #003d2e' } : undefined}>
                  <Card.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Row label="Your guess" value={myResult.guess == null ? '—' : myResult.guess.toLocaleString()} />
                      <Row label="Off by" value={myResult.distance == null ? '—' : myResult.distance.toLocaleString()} />
                      {isWinner && (
                        <p style={{
                          textAlign: 'center', fontFamily: 'var(--kui-font-display)',
                          fontWeight: 800, color: '#15a374', marginTop: 6,
                        }}>You won this round! 🎉</p>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              )}
            </motion.div>
          )}

          {phase === 'scoreboard' && (
            <motion.div key="scoreboard"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <h2 style={{
                fontFamily: 'var(--kui-font-display)', fontWeight: 800, textAlign: 'center',
                letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 'var(--kui-text-md)',
                color: 'var(--kui-text-muted)',
              }}>Scoreboard</h2>
              <MiniLeaderboard
                players={leaderboardEntries}
                currentPlayerId={myId}
                maxShow={5}
              />
              {myRank === 1 && (
                <p className="ek-bengali" style={{ textAlign: 'center', fontFamily: 'var(--kui-font-bengali)', fontWeight: 700, color: 'var(--kui-accent)' }}>
                  👑 এক নম্বর!
                </p>
              )}
              <p style={{ textAlign: 'center', fontSize: 'var(--kui-text-sm)', color: 'var(--kui-text-muted)' }}>
                Next round starting… (score: {myScore})
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: 'var(--kui-font-display)', fontWeight: 800, fontSize: 'var(--kui-text-xl)' }}>{value}</span>
    </div>
  );
}
