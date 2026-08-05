import Stage, { PhoneScreen } from './Stage';
import { Band, BandCell, Brand, Marquee } from './Band';
import SplitColumns from './SplitColumns';
import AvatarTile, { PLAYER_RAMP } from './AvatarTile';
import Num, { FlapNum } from './Numeral';
import SegmentBar from './SegmentBar';
import Countdown from './Countdown';
import { KeyTile } from './KeyTile';
import Btn, { ActionBar } from './Btn';
import { ToastBand } from './Toasts';

/* A specimen sheet for the primitives, so type, colour, glow and the stage's scaling
 * can be checked on their own before any screen depends on them. Preview-only. */

const NAMES = [
  'Rashid', 'Nadia', 'Khaled', 'Afridi', 'Siddiqui', 'Popy', 'Tania', 'Imran',
  'Shuvo', 'Mitu', 'Farhan', 'Rumi', 'Alam', 'Jhuma', 'Bijoy',
];

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, minHeight: 0 }}>
      <span className="bd-label" style={{ width: 150, fontSize: 12 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}

export function BoardSpecimens() {
  return (
    <Stage>
      <Band>
        <Brand />
        <BandCell fill tone="panel" align="between">
          <span className="bd-label bd-label--bright" style={{ fontSize: 20, letterSpacing: '.3em' }}>
            BOARD PRIMITIVES
          </span>
          <Num size={18} style={{ opacity: 0.75 }}>
            v2.0
          </Num>
        </BandCell>
        <BandCell width={140} tone="amber">
          <span className="bd-word" style={{ fontSize: 18, letterSpacing: '.2em' }}>
            SPECIMEN
          </span>
        </BandCell>
      </Band>

      <div
        className="bd-body"
        style={{ padding: '16px 20px', gap: 12, justifyContent: 'space-between' }}
      >
        <Row label="NUMERALS">
          <Num size={56} glow>
            780
          </Num>
          <Num size={40} tone="green" glow>
            +3
          </Num>
          <Num size={40} tone="red" glow>
            12,000
          </Num>
          <Num size={40} tone="bone">
            14
          </Num>
          <FlapNum value={1250} size={40} />
        </Row>

        <Row label="WORDS">
          <span className="bd-word" style={{ fontSize: 40 }}>
            Karwan Bazar
          </span>
          <span className="bd-name">Siddiqui</span>
          <span className="bd-label">SECONDS LEFT</span>
          <span className="bd-mono" style={{ fontSize: 14 }}>
            2-15 PLAYERS · 15 MIN
          </span>
          <span className="bd-bn" style={{ fontSize: 30, color: 'var(--amber)' }}>
            এক দাম!
          </span>
        </Row>

        <Row label="TILES">
          {PLAYER_RAMP.map((_, i) => (
            <AvatarTile key={i} size={34} colorIndex={i} name={NAMES[i]} />
          ))}
          <AvatarTile size={34} colorIndex={9} name="Mitu" />
          <AvatarTile size={26} colorIndex={2} name="Khaled" />
          <AvatarTile size={22} colorIndex={4} name="Popy" dim />
        </Row>

        <Row label="CLOCK / BARS">
          <Countdown seconds={18} size={64} />
          <Countdown seconds={4} size={64} />
          <div style={{ width: 260 }}>
            <SegmentBar total={15} lit={7} />
          </div>
          <KeyTile width={54} height={64} size={40}>
            K
          </KeyTile>
          <KeyTile width={54} height={64} size={40} empty>
            {' '}
          </KeyTile>
        </Row>

        <Row label="ACTIONS">
          <Btn style={{ height: 52, fontSize: 20 }}>START GAME</Btn>
          <Btn tone="ghost" style={{ height: 52, fontSize: 20 }}>
            SETTINGS
          </Btn>
          <Btn tone="red" style={{ height: 52, fontSize: 20 }}>
            END GAME
          </Btn>
          <Btn disabled style={{ height: 52, fontSize: 20 }}>
            NEED 1 MORE
          </Btn>
        </Row>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span className="bd-label" style={{ fontSize: 12, marginBottom: 6 }}>
              SPLITCOLUMNS · 15 ROWS, TOP-TO-BOTTOM
            </span>
            <SplitColumns
              items={NAMES}
              renderItem={(name, i) => (
                <div
                  key={name}
                  className="bd-row-rule"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
                >
                  <Num size={13} tone="green" style={{ width: 22 }}>
                    {String(i + 1).padStart(2, '0')}
                  </Num>
                  <AvatarTile size={18} colorIndex={i} name={name} />
                  <span className="bd-name" style={{ fontSize: 17 }}>
                    {name}
                  </span>
                  <Num size={15} style={{ marginLeft: 'auto' }}>
                    {(900 - i * 37).toLocaleString()}
                  </Num>
                </div>
              )}
            />
          </div>

          <div style={{ width: 300, flex: 'none', position: 'relative' }}>
            <span className="bd-label" style={{ fontSize: 12 }}>
              TOAST
            </span>
            <div style={{ marginTop: 8 }}>
              <ToastBand
                title="Alam lost connection"
                sub="SEAT HELD FOR 90S · SCORE KEPT"
                player={{ name: 'Alam', colorIndex: 2 }}
              />
            </div>
          </div>
        </div>
      </div>

      <ActionBar>
        <div style={{ background: 'var(--led-green)', color: 'var(--board)' }}>PLAY AGAIN</div>
        <div style={{ background: 'var(--panel)', color: 'var(--out-55)' }}>FULL STANDINGS</div>
      </ActionBar>

      <Marquee items={['খেলা হবে! · PLAYERS JOIN ON THEIR PHONES · ']} />
    </Stage>
  );
}

export function PhoneSpecimens() {
  return (
    <PhoneScreen>
      <Band height="var(--band-phone)">
        <BandCell fill tone="green" align="between">
          <span className="bd-word bd-bn" style={{ fontSize: 19, letterSpacing: '.14em' }}>
            এক দাম
          </span>
          <Num size={15} style={{ color: 'rgba(255,248,236,.8)' }}>
            KHEL
          </Num>
        </BandCell>
      </Band>

      <div className="bd-body" style={{ padding: 18, gap: 18 }}>
        <div>
          <span className="bd-label" style={{ fontSize: 12 }}>
            YOUR GUESS
          </span>
          <div style={{ marginTop: 8 }}>
            <Num size={72} glow>
              1,250
            </Num>
            <span className="bd-caret" style={{ height: 56, width: 13, marginLeft: 6 }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <AvatarTile size={48} colorIndex={1} name="Nadia" />
          <AvatarTile size={78} colorIndex={4} name="Popy" />
          <AvatarTile size={112} colorIndex={5} name="Mitu" />
        </div>

        <SegmentBar total={15} lit={7} />

        <div className="bd-push" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Btn block cta pulse>
            LOCK IN
          </Btn>
          <Btn block small tone="ghost">
            CHANGE MY GUESS
          </Btn>
        </div>
      </div>
    </PhoneScreen>
  );
}
