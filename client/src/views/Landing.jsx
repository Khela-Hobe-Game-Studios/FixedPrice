import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Card,
  Input,
} from '@khelahobe/kui';
import socket from '../socket';

const fade = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -16 } };

export default function Landing({ setRoom, setMe }) {
  const [mode, setMode] = useState('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [settings, setSettings] = useState({
    questionCount: 10,
    eliminationMode: false,
    bettingRounds: true,
    backgroundMusic: true,
  });

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

  function toggle(key) {
    setSettings(s => ({ ...s, [key]: !s[key] }));
  }

  return (
    <div className="ek-page ek-page--center" style={{ gap: 24 }}>
      <AnimatePresence mode="wait">
        {mode === 'home' && (
          <motion.div
            key="home"
            {...fade}
            transition={{ duration: 0.3 }}
            style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}
          >
            <img
              src={`${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`}
              alt="এক দাম — Fixed Price"
              style={{
                width: 'min(280px, 70vw)',
                height: 'auto',
                display: 'block',
                filter: 'drop-shadow(4px 4px 0 rgba(0, 61, 46, 0.18))',
              }}
            />
            <p
              style={{
                fontFamily: 'var(--kui-font-sans)',
                color: 'var(--kui-text-muted)',
                textAlign: 'center',
                maxWidth: 380,
                lineHeight: 1.45,
                fontSize: 'var(--kui-text-md)',
                margin: 0,
              }}
            >
              The closest guess wins. No multiple choice. Pure instinct.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="primary" size="lg" onClick={() => setMode('host')}>Host a Game</Button>
              <Button variant="secondary" size="lg" onClick={() => setMode('join')}>Join a Game</Button>
            </div>
          </motion.div>
        )}

        {mode === 'host' && (
          <motion.div
            key="host"
            {...fade}
            transition={{ duration: 0.25 }}
            style={{ width: '100%', maxWidth: 480 }}
          >
            <Card>
              <Card.Header>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <Button variant="ghost" size="sm" onClick={() => setMode('home')}>← Back</Button>
                  <strong style={{ fontFamily: 'var(--kui-font-display)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Game Settings</strong>
                  <span style={{ width: 60 }} />
                </div>
              </Card.Header>
              <Card.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SettingRow label="Questions">
                    <Segmented
                      options={[10, 15, 20]}
                      value={settings.questionCount}
                      onChange={n => setSettings(s => ({ ...s, questionCount: n }))}
                    />
                  </SettingRow>
                  <SettingRow label="Elimination Mode">
                    <Toggle on={settings.eliminationMode} onClick={() => toggle('eliminationMode')} />
                  </SettingRow>
                  <SettingRow label="Betting Rounds">
                    <Toggle on={settings.bettingRounds} onClick={() => toggle('bettingRounds')} />
                  </SettingRow>
                  <SettingRow label="Background Music">
                    <Toggle on={settings.backgroundMusic} onClick={() => toggle('backgroundMusic')} />
                  </SettingRow>
                </div>
              </Card.Body>
              <Card.Footer>
                <Button variant="primary" size="lg" onClick={createRoom} style={{ width: '100%' }}>
                  Create Room
                </Button>
              </Card.Footer>
            </Card>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div
            key="join"
            {...fade}
            transition={{ duration: 0.25 }}
            style={{ width: '100%', maxWidth: 420 }}
          >
            <Card>
              <Card.Header>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <Button variant="ghost" size="sm" onClick={() => setMode('home')}>← Back</Button>
                  <strong style={{ fontFamily: 'var(--kui-font-display)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Join a Game</strong>
                  <span style={{ width: 60 }} />
                </div>
              </Card.Header>
              <Card.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Input
                    id="room-code"
                    label="Room Code"
                    placeholder="ABCD"
                    value={code}
                    maxLength={4}
                    autoCapitalize="characters"
                    style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.4em', fontFamily: 'var(--kui-font-display)', fontWeight: 800, fontSize: '1.5rem' }}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                  />
                  <Input
                    id="player-name"
                    label="Your Name"
                    placeholder="e.g. Karim"
                    value={name}
                    maxLength={16}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
              </Card.Body>
              <Card.Footer>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={joinRoom}
                  disabled={!name.trim() || code.length !== 4}
                  style={{ width: '100%' }}
                >
                  Join
                </Button>
              </Card.Footer>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <StudioCredit />
    </div>
  );
}

function StudioCredit() {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        opacity: 0.9,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div
        aria-hidden
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          width: 'min(220px, 70vw)',
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--kui-text-muted)', opacity: 0.4 }} />
        <span style={{ color: 'var(--kui-text-muted)', fontSize: 'var(--kui-text-sm)', opacity: 0.7 }}>✦</span>
        <span style={{ flex: 1, height: 1, background: 'var(--kui-text-muted)', opacity: 0.4 }} />
      </div>
      <span
        style={{
          fontFamily: 'var(--kui-font-sans)',
          fontSize: 'var(--kui-text-xs)',
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--kui-text-muted)',
        }}
      >
        A game by
      </span>
      <span
        style={{
          fontFamily: 'var(--kui-font-display)',
          fontSize: 'var(--kui-text-base)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: 'var(--kui-text)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        Khela Hobe Game Studios
      </span>
    </div>
  );
}

function SettingRow({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontWeight: 700, fontSize: 'var(--kui-text-md)' }}>{label}</span>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex',
      padding: 4,
      gap: 4,
      borderRadius: 'var(--kui-radius-md)',
      background: 'var(--kui-surface-2)',
      border: '2px solid var(--kui-border)',
    }}>
      {options.map(n => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={active}
            style={{
              minWidth: 38,
              padding: '6px 12px',
              border: 'none',
              borderRadius: 'var(--kui-radius-sm)',
              background: active ? 'var(--kui-primary)' : 'transparent',
              color: active ? 'var(--kui-text)' : 'var(--kui-text-muted)',
              fontFamily: 'var(--kui-font-display)',
              fontWeight: 800,
              fontSize: 'var(--kui-text-sm)',
              cursor: 'pointer',
              boxShadow: active ? '2px 2px 0 var(--kui-shadow-color)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        position: 'relative',
        width: 60,
        height: 32,
        borderRadius: 999,
        border: '2.5px solid var(--kui-border)',
        background: on ? 'var(--kui-primary)' : 'var(--kui-surface-2)',
        boxShadow: on ? '2px 2px 0 var(--kui-shadow-color)' : 'inset 1px 1px 0 rgba(0,0,0,0.15)',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.15s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 30 : 2,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--kui-text)',
          boxShadow: '1px 1px 0 var(--kui-shadow-color)',
          transition: 'left 0.18s var(--kui-easing-bounce)',
        }}
      />
    </button>
  );
}
