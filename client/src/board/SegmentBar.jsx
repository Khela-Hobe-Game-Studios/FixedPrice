/**
 * The locked-in bar: one segment per seat, lit as answers land.
 *
 * "7 of 15 answered" is carried on three channels at once — this bar, the big number
 * pair above it, and the named seats that flip below. Each works at a different
 * glance length, which is why all three stay.
 *
 * A seat going from pending to answered switches in one frame. No transition, no
 * fade — the board is a mechanical device.
 */
export default function SegmentBar({
  total,
  lit,
  height = 20,
  gap = 3,
  color,
  className = '',
  style,
}) {
  const cells = Array.from({ length: Math.max(total, 1) });

  return (
    <div
      className={`bd-seg ${className}`}
      style={{
        gridTemplateColumns: `repeat(${Math.max(total, 1)}, 1fr)`,
        height,
        gap,
        ...style,
      }}
      role="img"
      aria-label={`${lit} of ${total} locked in`}
    >
      {cells.map((_, i) => (
        <span
          key={i}
          className={`bd-seg__cell${i < lit ? ' bd-seg__cell--lit' : ''}`}
          style={color && i < lit ? { background: color } : undefined}
        />
      ))}
    </div>
  );
}
