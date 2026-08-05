import { PhoneScreen, SplitColumns, AvatarTile, Btn } from '../../board';
import { YouHeader, RotateGuard } from './parts';

/** Waiting for the host, with the room filling up. */
export default function PlayerLobby({ me, room, onEditAvatar }) {
  const players = room?.players ?? [];

  return (
    <PhoneScreen>
      <YouHeader me={me} right={room?.code} />

      <div className="ps-body">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="bd-label" style={{ fontSize: 13 }}>
            IN THE ROOM
          </span>
          <span className="bd-mono" style={{ fontSize: 15 }}>
            {players.length}
          </span>
        </div>

        <div className="ps-scroll">
          <SplitColumns
            items={players}
            gap="0 8px"
            rowHeight={52}
            rowGap={8}
            renderItem={(p) => (
              <div
                key={p.id}
                className="ps-bet"
                style={{ borderLeft: 'none', background: 'var(--panel)' }}
              >
                <AvatarTile size={36} colorIndex={p.colorIndex} name={p.name} avatar={p.avatar} />
                <span className="ps-bet__name" style={{ fontSize: 19 }}>
                  {p.name}
                </span>
              </div>
            )}
          />
        </div>
      </div>

      <div className="ps-cta">
        <Btn block small tone="ghost" onClick={onEditAvatar}>
          CHANGE MY FACE
        </Btn>
        <Btn block small tone="panel" aria-disabled="true" style={{ gap: 12 }}>
          WAITING FOR HOST
          <span className="bd-caret" />
        </Btn>
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
