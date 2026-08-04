import {
  Stage,
  Band, BandCell, Brand, Marquee, SplitColumns, AvatarTile, Num, Btn, KeyTile,
} from '../../board';
import JoinQR, { joinHost } from '../../components/JoinQR';
import { LOBBY_MARQUEE } from './HostLanding';

/**
 * Room code, QR, and the filling roster.
 *
 * With one player the QR is the only thing that matters, so it grows and the start
 * button stands down. With fifteen the roster is the show.
 */
export default function HostLobby({ room, onStart, onSettings }) {
  const players = room?.players ?? [];
  const code = room?.code ?? '----';
  const ready = players.length >= 2;
  const waitingForOne = players.length === 1;

  return (
    <Stage>
      <Band>
        <Brand />
        <BandCell fill tone="panel" align="center">
          <span className="bd-label bd-label--bright" style={{ fontSize: 20, letterSpacing: '0.3em' }}>
            WAITING ROOM
          </span>
        </BandCell>
        <BandCell width={170} tone="amber" align="center">
          <Num size={22} tone="ink" data-testid="lobby-count">
            {players.length} IN
          </Num>
        </BandCell>
      </Band>

      <div className="hs-lobby">
        <div className="hs-lobby__left bd-rule-r">
          <span className="bd-label">ROOM CODE</span>
          <div className="hs-lobby__code" data-testid="room-code">
            {code.split('').map((c, i) => (
              <KeyTile key={i}>{c}</KeyTile>
            ))}
          </div>

          <div className="hs-lobby__qr">
            <JoinQR code={room?.code} size={waitingForOne ? 220 : 120} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span
                className="bd-label"
                style={{ fontSize: 14, letterSpacing: '0.22em', lineHeight: 1.3, whiteSpace: 'normal' }}
              >
                SCAN TO JOIN
                <br />
                THEN PICK A FACE
              </span>
              <Num size={15}>{joinHost()}</Num>
            </div>
          </div>

          <div className="bd-push" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Btn
              block
              onClick={onStart}
              disabled={!ready}
              data-testid="start-game"
              style={{ height: 64, fontSize: 25 }}
            >
              {ready ? `START · ${players.length} READY` : `NEED ${2 - players.length} MORE`}
            </Btn>
            <Btn block tone="ghost" small onClick={onSettings} data-testid="open-settings">
              SETTINGS
            </Btn>
          </div>
        </div>

        <div className="hs-lobby__right">
          <div className="hs-lobby__head">
            <span className="bd-label bd-label--tight">IN THE ROOM</span>
            <Num size={22}>
              {players.length}/15
            </Num>
          </div>

          {players.length === 0 ? (
            <div
              className="bd-fill"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
            >
              <span className="bd-caret" />
              <span className="bd-mono" style={{ fontSize: 17 }}>
                WAITING FOR THE FIRST PHONE
              </span>
            </div>
          ) : (
            <SplitColumns
              className="bd-fill"
              items={players}
              splitAt={8}
              gap="0 16px"
              rowHeight={56}
              rowGap={6}
              renderItem={(p) => (
                <div key={p.id} className="hs-seat">
                  <AvatarTile size={40} colorIndex={p.colorIndex} name={p.name} avatar={p.avatar} />
                  <span className="hs-seat__name">{p.name}</span>
                </div>
              )}
            />
          )}
        </div>
      </div>

      <Marquee items={LOBBY_MARQUEE} />
    </Stage>
  );
}
