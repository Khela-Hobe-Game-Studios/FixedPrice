import { useState } from 'react';
import { Stage, Band, BandCell, Brand, ActionBar } from '../../board';
import { CATEGORIES, CATEGORY_KEYS } from '../../categories';
import { DEFAULT_BOARD } from '../../game/settings';

const DEFAULTS = {
  rounds: 10,
  secondsPerQuestion: 30,
  bettingFrequency: 'never',
  categories: [],
  flavour: 'mixed',
  finale: 'auto',
};

function Group({ label, children }) {
  return (
    <div className="hs-set__group">
      <span className="bd-label" style={{ fontSize: 15, letterSpacing: '0.3em' }}>
        {label}
      </span>
      <div className="hs-set__row">{children}</div>
    </div>
  );
}

function Seg({ options, value, onChange, tone = 'amber', testid }) {
  return options.map(([val, text]) => (
    <button
      key={val}
      type="button"
      className={`hs-set__btn hs-set__btn--${tone}`}
      aria-pressed={value === val}
      onClick={() => onChange(val)}
      data-testid={testid ? `${testid}-${val}` : undefined}
    >
      {text}
    </button>
  ));
}

/**
 * Everything the host decides, on one screen, reachable before the game and from
 * the pause overlay.
 *
 * Lighting, sound and motion are properties of the room the board is standing in
 * rather than of the game, so they stay on this device and are not sent to the
 * server. Everything else changes how the game is played, so it is.
 */
/* `onLeaveBoard` is passed through to the rotate guard, and only here: this is the
 * one host screen you can reach on a portrait phone with no room open yet, so it is
 * the one place where "actually, I meant to join" is still a coherent thing to say. */
export default function HostSettings({ settings, board, onBoard, onSave, onClose, started, onLeaveBoard }) {
  const [draft, setDraft] = useState({ ...DEFAULTS, ...settings });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const toggleCategory = (key) => {
    const on = draft.categories.length === 0 || draft.categories.includes(key);
    const all = draft.categories.length === 0 ? CATEGORY_KEYS : draft.categories;
    const next = on ? all.filter((c) => c !== key) : [...all, key];
    // Every category off is a deck with no questions in it. Empty means "all",
    // which is also what it means on the server.
    set({ categories: next.length === 0 || next.length === CATEGORY_KEYS.length ? [] : next });
  };

  const isOn = (key) => draft.categories.length === 0 || draft.categories.includes(key);

  return (
    <Stage onLeaveBoard={onLeaveBoard}>
      <Band>
        <Brand />
        <BandCell fill tone="panel" align="center">
          <span className="bd-label bd-label--bright" style={{ fontSize: 20, letterSpacing: '0.3em' }}>
            SETTINGS
          </span>
        </BandCell>
        <BandCell width={150} tone="panel" align="center">
          <button type="button" className="bd-label bd-label--bright" onClick={onClose} data-testid="close-settings">
            CLOSE ✕
          </button>
        </BandCell>
      </Band>

      <div className="hs-set">
        <div className="hs-set__col">
          <Group label="ROUNDS">
            <Seg
              options={[[10, '10'], [15, '15'], [20, '20']]}
              value={draft.rounds}
              onChange={(rounds) => set({ rounds })}
              testid="rounds"
            />
          </Group>

          <Group label="SECONDS PER QUESTION">
            <Seg
              options={[[20, '20'], [30, '30'], [45, '45'], [0, 'OFF']]}
              value={draft.secondsPerQuestion}
              onChange={(secondsPerQuestion) => set({ secondsPerQuestion })}
              testid="seconds"
            />
          </Group>

          <Group label="QUESTION FLAVOUR">
            <Seg
              options={[['deshi', 'DESHI'], ['mixed', 'MIXED'], ['global', 'GLOBAL']]}
              value={draft.flavour}
              onChange={(flavour) => set({ flavour })}
              testid="flavour"
            />
          </Group>

          <p className="bd-mono bd-mono--wrap hs-set__note hs-set__note--tight">
            DESHI FILLS THREE ROUNDS IN FOUR WITH BANGLADESHI QUESTIONS — TAKA PRICES, DESH,
            LOCAL CRICKET. WEIRD AND SPORTS ARE GLOBAL EITHER WAY.
          </p>

          <Group label="BETTING ROUND">
            <Seg
              options={[['every3', 'EVERY 3RD'], ['every5', 'EVERY 5TH'], ['never', 'NEVER']]}
              value={draft.bettingFrequency}
              onChange={(bettingFrequency) => set({ bettingFrequency })}
              tone="green"
              testid="betting"
            />
          </Group>

          <Group label="FINALE · SUDDEN DEATH">
            <Seg
              options={[['off', 'OFF'], ['auto', 'AUTO'], ['on', 'ON']]}
              value={draft.finale}
              onChange={(finale) => set({ finale })}
              tone="red"
              testid="finale"
            />
          </Group>

          <p className="bd-mono bd-mono--wrap hs-set__note">
            AUTO RUNS THE FINALE WHEN 8 OR MORE ARE PLAYING. THE TOP FEW PLAY SUDDEN-DEATH
            ROUNDS UNTIL ONE IS LEFT — FURTHEST GUESS IS KNOCKED OUT EACH TIME.
          </p>
        </div>

        <div className="hs-set__col bd-rule-l">
          <Group label="CATEGORIES IN THE DECK">
            <div className="hs-set__cats">
              {CATEGORY_KEYS.map((key) => {
                const cat = CATEGORIES[key];
                const on = isOn(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`hs-set__cat${cat.bengali ? ' bd-bn' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleCategory(key)}
                    style={{
                      background: on ? cat.color : 'var(--panel)',
                      color: on ? cat.ink : 'var(--out-45)',
                      border: on ? 'none' : `1px solid ${cat.color}`,
                    }}
                  >
                    {on ? cat.name : `${cat.name} · OFF`}
                  </button>
                );
              })}
            </div>
          </Group>

          <Group label="BOARD LIGHTING">
            <Seg
              options={[['auto', 'AUTO'], ['night', 'NIGHT'], ['day', 'DAY']]}
              value={board.lighting}
              onChange={(lighting) => onBoard({ lighting })}
              testid="lighting"
            />
          </Group>

          <Group label="SOUND">
            <Seg
              options={[[true, 'ON'], [false, 'MUTED']]}
              value={board.sound}
              onChange={(sound) => onBoard({ sound })}
              tone="green"
            />
          </Group>

          <Group label="MOTION">
            <Seg
              options={[['full', 'FULL'], ['reduced', 'REDUCED']]}
              value={board.motion}
              onChange={(motion) => onBoard({ motion })}
              tone="green"
            />
          </Group>

          <p className="bd-mono bd-mono--wrap hs-set__note">
            REDUCED KILLS SHAKE, BLINK AND STROBE. RESPECTS PREFERS-REDUCED-MOTION
            AUTOMATICALLY.
          </p>
        </div>
      </div>

      <ActionBar>
        <button
          type="button"
          onClick={() => onSave(draft)}
          data-testid="save-settings"
          style={{ background: 'var(--led-green)', color: 'var(--board)' }}
        >
          {started ? 'SAVE' : 'SAVE & OPEN THE ROOM'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ ...DEFAULTS });
            onBoard({ ...DEFAULT_BOARD });
          }}
          style={{ background: 'var(--panel)', color: 'var(--out-55)', flex: '0 0 280px' }}
        >
          RESET DEFAULTS
        </button>
      </ActionBar>
    </Stage>
  );
}
