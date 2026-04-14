import { motion } from 'framer-motion';
import socket from '../socket';
import styles from './HostLobby.module.css';

export default function HostLobby({ room }) {
  const players = room?.players ?? [];
  const settings = room?.settings ?? {};

  function startGame() {
    socket.emit('host:start_game');
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      <div className={styles.layout}>
        {/* Left: Room code + settings */}
        <div className={styles.left}>
          <div className={styles.codeBox}>
            <p className={styles.codeLabel}>Room Code</p>
            <p className={styles.code}>{room?.code ?? '----'}</p>
            <p className={styles.codeSub}>Players join at your URL</p>
          </div>

          <div className={styles.settingsBox}>
            <div className={styles.settingRow}>
              <span className={styles.settingKey}>Questions</span>
              <span className={styles.settingVal}>{settings.questionCount ?? 10}</span>
            </div>
            <div className={styles.settingRow}>
              <span className={styles.settingKey}>Elimination</span>
              <span className={settings.eliminationMode ? styles.on : styles.off}>
                {settings.eliminationMode ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className={styles.settingRow}>
              <span className={styles.settingKey}>Betting Rounds</span>
              <span className={settings.bettingRounds ? styles.on : styles.off}>
                {settings.bettingRounds ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Player list + start button */}
        <div className={styles.right}>
          <div className={styles.playerHeader}>
            <h2 className={styles.playerTitle}>Players</h2>
            <span className={styles.playerCount}>{players.length} joined</span>
          </div>

          <div className={styles.playerGrid}>
            {players.map((p, i) => (
              <motion.div
                key={p.id}
                className={styles.playerCard}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
              >
                <span className={styles.avatar}>{p.name[0].toUpperCase()}</span>
                <span className={styles.playerName}>{p.name}</span>
              </motion.div>
            ))}

            {players.length === 0 && (
              <p className={styles.waiting}>Waiting for players to join…</p>
            )}
          </div>

          <button
            className={styles.startBtn}
            onClick={startGame}
            disabled={players.length < 2}
          >
            {players.length < 2 ? 'Need at least 2 players' : 'Start Game'}
          </button>
        </div>
      </div>
    </div>
  );
}
