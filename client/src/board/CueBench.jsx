import { useEffect, useState } from 'react';
import Stage from './Stage';
import { Band, BandCell, Brand } from './Band';
import Num from './Numeral';
import Btn from './Btn';
import { VOICES, cue, sequence, killAll, setBed, setMuted, unlockAudio } from '../game/cues';

/**
 * The audition bench for the board's twelve cues. Preview-only, no backend.
 *
 * Tuning a cue means hearing it against the one before it, dozens of times in a
 * row. Doing that inside a real game means playing a real game, so this exists to
 * make every voice one click away — and the reveal sequence, which is the only one
 * whose character lives in the spacing rather than in any single sound.
 */

const CUES = [
  ['clunk', 'Relay clunk', 'Phase change, band swap'],
  ['flick', 'Mechanical flick', 'One split-flap digit'],
  ['tick', 'Tick', 'One reveal row lighting'],
  ['keypad', 'Keypad tick', 'A bet placed'],
  ['thunk', 'Lock-in thunk', 'Answer committed, point posted'],
  ['beep', 'Countdown beep', 'Each of the last five seconds'],
  ['klaxon', 'Klaxon', 'Time is up'],
  ['stab', 'Category stab', 'The intro flash'],
  ['humRise', 'Rising hum', 'The clock running out'],
  ['crowd', 'Crowd', 'The winner beat'],
  ['fanfare', 'Fanfare', 'Game over'],
  ['deflate', 'Deflate', 'Nobody was close'],
];

/* A stand-in for the server's schedule at nine players, so the chase can be heard
 * at the spacing it actually ships at. Mirrors revealSchedule() in gameManager. */
const DEMO = (() => {
  const rowStep = 60;
  const rows = 1100;
  const dim = rows + 9 * rowStep + 1660;
  const out = [{ at: 0, name: 'clunk', opts: { level: 1.15 } }];
  for (let i = 0; i < 5; i += 1) out.push({ at: 400 + i * 90, name: 'flick' });
  for (let i = 0; i < 9; i += 1) {
    out.push({ at: rows + i * rowStep, name: 'tick', opts: { level: i < 3 ? 1.35 : 1 } });
  }
  out.push({ at: dim, name: 'clunk', opts: { level: 0.7 } });
  out.push({ at: dim + 100, name: 'crowd' });
  out.push({ at: dim + 100, name: 'stab', opts: { level: 0.5 } });
  out.push({ at: dim + 500, name: 'thunk' });
  return out;
})();

export default function CueBench() {
  const [bed, setBedOn] = useState(false);
  const [last, setLast] = useState('—');

  useEffect(() => {
    setMuted(false);
    return () => { killAll(); setBed(false); };
  }, []);

  useEffect(() => { setBed(bed); }, [bed]);

  const fire = (name) => {
    unlockAudio();
    setLast(name);
    cue(name, name === 'humRise' ? { dur: 3 } : undefined);
  };

  return (
    <Stage>
      <Band>
        <Brand />
        <BandCell fill tone="panel" align="between">
          <span className="bd-label bd-label--bright" style={{ fontSize: 20, letterSpacing: '.3em' }}>
            CUE BENCH
          </span>
          <span className="bd-label" style={{ fontSize: 14, letterSpacing: '.2em' }}>
            LAST: {last.toUpperCase()}
          </span>
        </BandCell>
        <BandCell width={140} tone="amber">
          <span className="bd-word" style={{ fontSize: 18, letterSpacing: '.2em' }}>
            AUDIO
          </span>
        </BandCell>
      </Band>

      <div className="bd-body" style={{ padding: '18px 22px', gap: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            flex: 1,
            minHeight: 0,
          }}
        >
          {CUES.map(([name, title, when], i) => (
            <Btn
              key={name}
              tone="ghost"
              onClick={() => fire(name)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: 2,
                padding: '10px 14px',
                textAlign: 'left',
                minHeight: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Num size={15}>{String(i + 1).padStart(2, '0')}</Num>
                <span className="bd-word" style={{ fontSize: 19, letterSpacing: '.04em' }}>
                  {title}
                </span>
              </div>
              <span className="bd-label" style={{ fontSize: 11, letterSpacing: '.14em', opacity: 0.65 }}>
                {when}
              </span>
            </Btn>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Btn
            onClick={() => { unlockAudio(); killAll(); setLast('reveal @ 9'); sequence(DEMO, 0); }}
          >
            PLAY REVEAL SEQUENCE
          </Btn>
          <Btn tone="ghost" onClick={() => { unlockAudio(); setBedOn((v) => !v); }}>
            BED {bed ? 'ON' : 'OFF'}
          </Btn>
          <Btn tone="ghost" onClick={() => { killAll(); setBedOn(false); }}>
            KILL ALL
          </Btn>
          <span className="bd-label" style={{ fontSize: 11, letterSpacing: '.16em', opacity: 0.5 }}>
            {Object.keys(VOICES).length} VOICES · SYNTHESISED · NO ASSETS
          </span>
        </div>
      </div>
    </Stage>
  );
}
