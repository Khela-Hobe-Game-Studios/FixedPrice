import { motion } from 'framer-motion';
import {
  Badge,
  Card,
  LoadingDot,
  PlayerCard,
  RoomCode,
} from '@khelahobe/kui';

const AVATAR_COLORS = ['#fbbf24', '#15a374', '#fb923c', '#818cf8', '#e879f9'];

export default function PlayerLobby({ room, me }) {
  const players = room?.players ?? [];
  const code = room?.code ?? '----';

  return (
    <div className="ek-page" style={{ paddingTop: 32 }}>
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <RoomCode code={code} label="Room" size="sm" />

        <Badge variant="success" style={{ alignSelf: 'flex-start' }}>
          ✓ Joined as {me?.name ?? '…'}
        </Badge>

        <Card>
          <Card.Body>
            <LoadingDot
              message="Waiting for the host to kick things off…"
              subtext="অপেক্ষা করুন"
            />
          </Card.Body>
        </Card>

        <Card variant="secondary">
          <Card.Header>
            <span style={{ fontFamily: 'var(--kui-font-display)', fontWeight: 700, fontSize: 'var(--kui-text-sm)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--kui-text-muted)' }}>
              {players.length} player{players.length !== 1 ? 's' : ''} in the room
            </span>
          </Card.Header>
          <Card.Body>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {players.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <PlayerCard
                    name={p.name}
                    initial={p.name[0]}
                    color={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                    variant="list"
                    isMe={p.id === me?.id}
                  />
                </motion.div>
              ))}
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
