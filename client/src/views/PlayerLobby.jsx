import { motion } from 'framer-motion';
import styles from './PlayerLobby.module.css';

const AVATAR_COLORS = ['#fbbf24', '#4ade80', '#fb923c', '#818cf8', '#e879f9'];

export default function PlayerLobby({ room, me }) {
  const players = room?.players ?? [];
  const code = room?.code ?? '----';

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      <div className={styles.card}>
        <div className={styles.codeRow}>
          <span className={styles.codeLabel}>Room</span>
          <span className={styles.code}>{code}</span>
        </div>

        <div className={styles.youBadge}>
          ✓ You joined as <strong>{me?.name ?? '…'}</strong>
        </div>

        <div className={styles.waitMsg}>
          <motion.div
            className={styles.dot}
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          />
          Waiting for the host to kick things off…
        </div>
        <p className={styles.waitSubtext}>অপেক্ষা করুন</p>

        <div className={styles.playerList}>
          <p className={styles.listHeader}>{players.length} player{players.length !== 1 ? 's' : ''} in the room</p>
          {players.map((p, i) => (
            <motion.div
              key={p.id}
              className={`${styles.playerRow} ${p.id === me?.id ? styles.isMe : ''}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <span className={styles.avatar} style={{ background: AVATAR_COLORS[i % 5] }}>{p.name[0].toUpperCase()}</span>
              <span>{p.name}</span>
              {p.id === me?.id && <span className={styles.youTag}>you</span>}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
