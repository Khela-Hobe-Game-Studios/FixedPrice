export const PLAYER_RAMP = [
  '#FFB423',
  '#2BE08A',
  '#FF3B47',
  '#2E86FF',
  '#C46BFF',
  '#22D3DB',
  '#FF6FA8',
  '#B4E82B',
];

/** The player's colour, from the server-assigned index. Stable for the whole game. */
export function playerColor(colorIndex = 0) {
  return PLAYER_RAMP[colorIndex % PLAYER_RAMP.length];
}

/** Players 9+ repeat the ramp, so they carry an inset notch to stay distinguishable. */
export function hasNotch(colorIndex = 0) {
  return colorIndex >= PLAYER_RAMP.length;
}

function barFor(size) {
  if (size >= 100) return 6;
  if (size >= 70) return 5;
  if (size >= 40) return 4;
  return 3;
}

/**
 * One player, one hard square.
 *
 * Three sources — monogram (the zero-friction default), selfie (quantised onto a
 * six-step ramp of the player's own colour so photos can't break the board), sprite
 * (the commissioned set, not yet drawn) — but the identity that actually carries across
 * the room is the colour, not the picture. At 3 metres a 20px face is mush and a
 * 20px colour block is instant.
 */
export default function AvatarTile({
  size = 34,
  colorIndex = 0,
  name = '',
  avatar,
  dim = false,
  bar,
  barColor,
  label,
  className = '',
  style,
  ...rest
}) {
  const color = playerColor(colorIndex);
  const kind = avatar?.kind ?? 'monogram';
  const monogram = (name.trim()[0] ?? '?').toUpperCase();

  /* A monogram tile is the colour with the board cutting a bar out of it; a picture
   * tile is the panel with the colour as the bar. Either way the colour is on the
   * tile, which is the only part of it that survives at 18px. */
  const hasPicture = kind !== 'monogram' && !!avatar?.image;

  return (
    <span
      className={[
        'bd-tile',
        hasNotch(colorIndex) ? 'bd-tile--notch' : '',
        dim ? 'bd-tile--dim' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.54),
        '--tile-color': hasPicture ? 'var(--panel)' : color,
        '--tile-bar': `${bar ?? barFor(size)}px`,
        borderBottomColor: barColor ?? (hasPicture ? color : 'var(--board)'),
        ...style,
      }}
      /* Decorative almost everywhere — the name sits right next to it, so announcing
         the tile as well just says everything twice. Pass `label` on the one screen
         where the tile IS the subject (the picker) and it becomes an image. */
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}
      {...rest}
    >
      {hasPicture ? <img className="bd-tile__img" src={avatar.image} alt="" /> : monogram}
    </span>
  );
}
