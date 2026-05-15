import { motion } from 'framer-motion';
import {
  Button,
  Card,
  LoadingDot,
  PlayerCard,
  RoomCode,
  SettingsPanel,
} from '@khelahobe/kui';
import socket from '../socket';

const AVATAR_COLORS = ['#fbbf24', '#15a374', '#fb923c', '#818cf8', '#e879f9'];

export default function HostLobby({ room, onStartGame }) {
  const players = room?.players ?? [];
  const settings = room?.settings ?? {};

  function startGame() {
    onStartGame?.();
    socket.emit('host:start_game');
  }

  const settingRows = [
    { key: 'Questions',        value: String(settings.questionCount ?? 10) },
    { key: 'Elimination',      value: settings.eliminationMode  ? 'ON' : 'OFF', isActive: !!settings.eliminationMode  },
    { key: 'Betting Rounds',   value: settings.bettingRounds    ? 'ON' : 'OFF', isActive: !!settings.bettingRounds    },
    { key: 'Background Music', value: settings.backgroundMusic  ? 'ON' : 'OFF', isActive: !!settings.backgroundMusic  },
  ];

  return (
    <div className="ek-page">
      <div
        style={{
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'minmax(260px, 320px) 1fr',
          alignItems: 'start',
        }}
        className="ek-host-lobby"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RoomCode code={room?.code ?? '----'} label="Room Code" size="lg" />
          <SettingsPanel settings={settingRows} />
          <p style={{ marginTop: -4, fontSize: 'var(--kui-text-sm)', color: 'var(--kui-text-muted)', fontWeight: 600, textAlign: 'center' }}>
            Players join at your URL with the code above
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="ek-bengali" style={{ fontSize: 'var(--kui-text-2xl)', color: 'var(--kui-accent)' }}>খেলোয়াড়</span>
              <h2 style={{ fontFamily: 'var(--kui-font-display)', fontWeight: 800, fontSize: 'var(--kui-text-2xl)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Players</h2>
            </div>
            <span style={{ fontSize: 'var(--kui-text-sm)', color: 'var(--kui-text-muted)', fontWeight: 700 }}>
              {players.length} joined
            </span>
          </div>

          {players.length === 0 ? (
            <Card>
              <Card.Body>
                <LoadingDot message="Waiting for players to join…" subtext="অপেক্ষা করুন" />
              </Card.Body>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              }}
            >
              {players.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
                >
                  <PlayerCard
                    name={p.name}
                    initial={p.name[0]}
                    color={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                    variant="grid"
                    status="waiting"
                  />
                </motion.div>
              ))}
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={startGame}
            disabled={players.length < 2}
            style={{ width: '100%' }}
          >
            {players.length < 2 ? 'Need at least 2 players' : 'Start Game'}
          </Button>
        </div>
      </div>
    </div>
  );
}
