import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../socket';
import styles from './Landing.module.css';

const fade = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -16 } };

export default function Landing({ setRoom, setMe }) {
  const [mode, setMode] = useState('home'); // home | host | join
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [settings, setSettings] = useState({ questionCount: 10, eliminationMode: false, bettingRounds: true });

  function createRoom() {
    if (!settings.questionCount) return;
    socket.emit('host:create_room', settings);
    setRoom({ code: null, players: [], settings });
  }

  function joinRoom() {
    if (!name.trim() || code.length !== 4) return;
    setMe({ id: socket.id, name: name.trim() });
    socket.emit('player:join', { code: code.toUpperCase(), name: name.trim() });
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      <AnimatePresence mode="wait">
        {mode === 'home' && (
          <motion.div key="home" className={styles.center} {...fade} transition={{ duration: 0.3 }}>
            <div className={styles.titleBlock}>
              <span className={styles.bengali}>এক দাম</span>
              <h1 className={styles.title}>FIXED PRICE</h1>
              <p className={styles.tagline}>The closest guess wins. No multiple choice. Pure instinct.</p>
            </div>
            <div className={styles.actions}>
              <button className={styles.btnHost} onClick={() => setMode('host')}>Host a Game</button>
              <button className={styles.btnJoin} onClick={() => setMode('join')}>Join a Game</button>
            </div>
          </motion.div>
        )}

        {mode === 'host' && (
          <motion.div key="host" className={styles.center} {...fade} transition={{ duration: 0.25 }}>
            <button className={styles.back} onClick={() => setMode('home')}>← Back</button>
            <h2 className={styles.sectionTitle}>Game Settings</h2>

            <div className={styles.settingsGrid}>
              <label className={styles.settingLabel}>Questions</label>
              <div className={styles.segmented}>
                {[10, 15, 20].map(n => (
                  <button
                    key={n}
                    className={`${styles.seg} ${settings.questionCount === n ? styles.segActive : ''}`}
                    onClick={() => setSettings(s => ({ ...s, questionCount: n }))}
                  >{n}</button>
                ))}
              </div>

              <label className={styles.settingLabel}>Elimination Mode</label>
              <button
                className={`${styles.toggle} ${settings.eliminationMode ? styles.toggleOn : ''}`}
                onClick={() => setSettings(s => ({ ...s, eliminationMode: !s.eliminationMode }))}
              >{settings.eliminationMode ? 'ON' : 'OFF'}</button>

              <label className={styles.settingLabel}>Betting Rounds</label>
              <button
                className={`${styles.toggle} ${settings.bettingRounds ? styles.toggleOn : ''}`}
                onClick={() => setSettings(s => ({ ...s, bettingRounds: !s.bettingRounds }))}
              >{settings.bettingRounds ? 'ON' : 'OFF'}</button>
            </div>

            <button className={styles.btnHost} onClick={createRoom}>Create Room</button>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div key="join" className={styles.center} {...fade} transition={{ duration: 0.25 }}>
            <button className={styles.back} onClick={() => setMode('home')}>← Back</button>
            <h2 className={styles.sectionTitle}>Join a Game</h2>
            <div className={styles.form}>
              <input
                placeholder="Room Code"
                value={code}
                maxLength={4}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className={styles.codeInput}
              />
              <input
                placeholder="Your Name"
                value={name}
                maxLength={16}
                onChange={e => setName(e.target.value)}
              />
              <button
                className={styles.btnJoin}
                onClick={joinRoom}
                disabled={!name.trim() || code.length !== 4}
              >Join</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
