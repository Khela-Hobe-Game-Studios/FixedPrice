/** Latin numerals everywhere, including the timer and the scoreboard — the client
 * chose this for legibility at 3 metres. */
export function formatNum(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('en-US');
}

/**
 * A number on the board. Numbers are amber and words are bone; they never swap, so
 * `tone` exists only for the four states that override it — green for points gained,
 * red for a wild miss or the last five seconds, bone for a total, ink for the one
 * inverted element in the system.
 */
export default function Num({
  children,
  size = 32,
  tone = 'amber',
  glow = false,
  as: Tag = 'span',
  className = '',
  style,
  ...rest
}) {
  const toneClass =
    tone === 'amber' ? '' : ` bd-num--${tone}`;

  return (
    <Tag
      className={`bd-num${toneClass}${glow ? ' bd-num--glow' : ''} ${className}`}
      style={{ fontSize: size, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The correct answer arriving digit-by-digit, split-flap, 90ms apart.
 *
 * Each digit is a span with its own animation-delay, so the whole sequence is one
 * CSS pass with no per-digit React state and no timer that can drift away from the
 * beat that owns it.
 */
export function FlapNum({
  value,
  size = 104,
  tone = 'amber',
  glow = true,
  step = 90,
  delay = 0,
  run = true,
  className = '',
  style,
}) {
  const text = typeof value === 'string' ? value : formatNum(value);
  const chars = [...text];

  return (
    <span
      className={`bd-num${tone === 'amber' ? '' : ` bd-num--${tone}`}${
        glow ? ' bd-num--glow' : ''
      } bd-flap ${className}`}
      style={{ fontSize: size, ...style }}
      aria-label={text}
    >
      {chars.map((c, i) => (
        <span
          key={i}
          className="bd-flap__d"
          style={
            run
              ? { animationDelay: `${delay + i * step}ms` }
              : { animation: 'none', opacity: 1 }
          }
          aria-hidden="true"
        >
          {c}
        </span>
      ))}
    </span>
  );
}
