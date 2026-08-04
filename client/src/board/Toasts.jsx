import AvatarTile from './AvatarTile';

/**
 * A system message that never blocks the game.
 *
 * Pinned to the bottom of the board with a 14px margin so it reads as a band that
 * arrived rather than a dialog that interrupted. A player dropping out is news, not
 * a decision to make — the game carries on behind it.
 */
export function ToastBand({ tone = 'red', title, sub, player, className = '' }) {
  return (
    <div className={`bd-toast bd-toast--${tone} ${className}`} role="status">
      {player && (
        <AvatarTile
          size={34}
          colorIndex={player.colorIndex}
          name={player.name}
          avatar={player.avatar}
        />
      )}
      <div className="bd-toast__text">
        <div className="bd-toast__title">{title}</div>
        {sub && <div className="bd-toast__sub">{sub}</div>}
      </div>
    </div>
  );
}

const TONE_BY_TYPE = { danger: 'red', success: 'led', info: 'panel' };

/** The stack the app's toast hook feeds. */
export default function Toasts({ toasts }) {
  if (!toasts?.length) return null;
  return (
    <div className="bd-toaststack">
      {toasts.map((t) => (
        <ToastBand
          key={t.id}
          tone={TONE_BY_TYPE[t.type] ?? 'panel'}
          title={t.message}
          sub={t.sub}
          player={t.player}
        />
      ))}
    </div>
  );
}
