import { PhoneScreen, AvatarTile, KeyTile, Num, Btn } from '../../board';
import { PhoneHeader, YouHeader, RotateGuard } from './parts';
import { category } from '../../categories';
import { useCountdown } from '../../game/clock';

const LOGO = `${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`;
const ORDINAL = ['1ST', '2ND', '3RD'];
const place = (r) => (r ? ORDINAL[r - 1] ?? `${r}TH` : '—');

/**
 * The "look up" state.
 *
 * Between rounds there is genuinely nothing for a thumb to do, and the design says
 * so out loud rather than filling the screen with something to fiddle with.
 */
export function PlayerBetween({ me, scoreboard, intro, timing }) {
  const rows = scoreboard?.scoreboard ?? [];
  const myIndex = rows.findIndex((r) => r.id === me?.id);
  const mine = rows[myIndex];
  const left = useCountdown(timing);
  const nextCat = intro?.category ? category(intro.category) : null;

  return (
    <PhoneScreen>
      <YouHeader me={me} right={mine ? `${place(myIndex + 1)} · ${mine.score}` : undefined} />

      <div className="ps-body ps-body--center" style={{ gap: 18 }}>
        <AvatarTile size={112} colorIndex={me?.colorIndex} name={me?.name ?? ''} avatar={mine?.avatar} />
        <h2 className="ps-head" style={{ fontSize: 40 }}>
          Look at
          <br />
          the TV
        </h2>
        <span className="bd-mono bd-mono--wrap" style={{ fontSize: 14 }}>
          {nextCat ? `NEXT CATEGORY IS ${nextCat.name}.` : 'THE BOARD IS DOING THE TALKING.'}
          <br />
          NOTHING TO DO HERE.
        </span>
        {left !== null && (
          <Num size={60} glow className="bd-blink">
            {String(left).padStart(2, '0')}
          </Num>
        )}
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}

/**
 * Reconnecting.
 *
 * The seat and the score are held for 90 seconds and the game carries on without
 * them — saying that plainly is the difference between a player waiting and a
 * player closing the tab.
 */
export function PlayerReconnecting({ me, score, seatHoldUntil, onLeave }) {
  const held = seatHoldUntil ? Math.max(0, Math.ceil((seatHoldUntil - Date.now()) / 1000)) : null;
  const pct = held !== null ? Math.max(0, Math.min(100, (held / 90) * 100)) : 100;

  return (
    <PhoneScreen>
      <PhoneHeader tone="red" left="CONNECTION LOST" />

      <div className="ps-body" style={{ gap: 18, justifyContent: 'center' }}>
        <div className="ps-bars">
          <span className="bd-blink" />
          <span />
          <span />
        </div>

        <h2 className="ps-head" style={{ fontSize: 34 }}>
          Getting you
          <br />
          back in
        </h2>

        <span className="bd-mono bd-mono--wrap" style={{ fontSize: 14 }}>
          YOUR SEAT{typeof score === 'number' ? ` AND YOUR ${score} POINTS ARE` : ' IS'} HELD. THE GAME
          CARRIES ON WITHOUT YOU UNTIL YOU'RE BACK.
        </span>

        <div className="ps-progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        {held !== null && (
          <Num size={15}>SEAT HELD · {held}S LEFT</Num>
        )}
      </div>

      <div className="ps-cta">
        <Btn block small tone="ghost" onClick={onLeave}>
          LEAVE THE GAME
        </Btn>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}

/** The four letters were wrong, or the room is gone. */
export function PlayerRoomError({ code = '', message, onRetry, onScan }) {
  return (
    <PhoneScreen>
      <PhoneHeader left="এক দাম" right="NO ROOM" bengali />

      <div className="ps-body ps-body--center" style={{ gap: 18 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {code.padEnd(4, ' ').slice(0, 4).split('').map((c, i) => (
            <KeyTile key={i} width={56} height={70} size={34} bar={4} tone="red">
              {c.trim()}
            </KeyTile>
          ))}
        </div>

        <h2 className="ps-head" style={{ fontSize: 32 }}>
          {message ?? (
            <>
              No room with
              <br />
              that code
            </>
          )}
        </h2>

        <span className="bd-mono bd-mono--wrap" style={{ fontSize: 13 }}>
          CHECK THE FOUR LETTERS ON THE TV. CODES EXPIRE WHEN THE HOST ENDS THE GAME.
        </span>
      </div>

      <div className="ps-cta">
        <Btn block cta onClick={onRetry} data-testid="try-again">
          TRY AGAIN
        </Btn>
        {onScan && (
          <Btn block small tone="ghost" onClick={onScan}>
            SCAN THE QR INSTEAD
          </Btn>
        )}
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}

/** How it ended, for you. */
export function PlayerGameOver({ me, final, onPlayAgain, onLeave }) {
  const results = final?.final ?? [];
  const myIndex = results.findIndex((r) => r.id === me?.id);
  const mine = results[myIndex];
  const winner = results[0];

  return (
    <PhoneScreen>
      <PhoneHeader tone="amber" left={`GAME OVER · ${final?.rounds ?? results.length} ROUNDS`} />

      <div className="ps-body ps-body--center" style={{ gap: 16 }}>
        <img src={LOGO} alt="" style={{ width: 118, height: 118, objectFit: 'contain' }} />

        <div
          style={{
            width: '100%',
            background: 'var(--panel)',
            borderBottom: '5px solid var(--led-green)',
            padding: '16px 18px',
          }}
        >
          <div className="bd-label" style={{ fontSize: 13 }}>
            YOU FINISHED
          </div>
          <Num size={74} tone="green" glow style={{ display: 'block', margin: '6px 0' }}>
            {place(myIndex + 1)}
          </Num>
          <div className="bd-mono" style={{ fontSize: 14 }}>
            {mine?.score ?? 0} POINTS
          </div>
        </div>

        {winner && (
          <p className="bd-word" style={{ fontSize: 19, lineHeight: 1.25, color: 'var(--out-55)' }}>
            {winner.id === me?.id
              ? 'You took it.'
              : `${winner.name} won with ${winner.score}.`}
          </p>
        )}
      </div>

      <div className="ps-cta">
        <Btn block cta onClick={onPlayAgain} aria-disabled="true" tone="panel">
          WAITING FOR THE HOST
        </Btn>
        <Btn block small tone="ghost" onClick={onLeave} data-testid="leave-game">
          LEAVE
        </Btn>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
