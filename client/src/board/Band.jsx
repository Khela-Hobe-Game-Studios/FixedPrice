const LOGO = `${import.meta.env.BASE_URL}fixed_price_logo_bitmap.png`;

/** A header or footer band. Always flex:none — bands never absorb slack. */
export function Band({ children, height, className = '', ...rest }) {
  return (
    <div
      className={`bd-band ${className}`}
      style={height ? { height } : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * A cell inside a band. `tone` picks the infill:
 * panel | green | red | amber | led | none, plus `color` for a category band.
 */
export function BandCell({
  children,
  tone = 'none',
  fill = false,
  align,
  width,
  color,
  ink,
  className = '',
  style,
  ...rest
}) {
  const cls = [
    'bd-band__cell',
    fill ? 'bd-band__cell--fill' : '',
    tone !== 'none' && !color ? `bd-band__cell--${tone}` : '',
    align === 'between' ? 'bd-band__cell--between' : '',
    align === 'center' ? 'bd-band__cell--center' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={{
        ...(width ? { width, flex: 'none' } : null),
        ...(color ? { background: color, color: ink } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * The brand lockup that opens every host header. The mascot is the one round thing
 * in the system — it is a picture of a logo, not a UI element.
 */
export function Brand({ width, compact = false }) {
  return (
    <div className="bd-brand" style={width ? { width } : undefined}>
      <img className="bd-brand__mark" src={LOGO} alt="" />
      <span className="bd-brand__word">
        <span className="bd-brand__bn">এক দাম</span>
        {!compact && ' · FIXED PRICE'}
      </span>
    </div>
  );
}

/**
 * A scrolling sponsor band. The track is duplicated and translated -50%, so the loop
 * is seamless regardless of how long the copy is. Never pauses — except under
 * reduced motion, where it stops dead (board.css).
 */
export function Marquee({ items, tone = 'red', speed = 28, className = '', style }) {
  const track = [...items, ...items];
  return (
    <div className={`bd-marquee bd-marquee--${tone} ${className}`} style={style} aria-hidden="true">
      <div
        className="bd-marquee__track"
        style={{ animationDuration: `${speed}s` }}
      >
        {track.map((item, i) => (
          <span className="bd-marquee__seg" key={i}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
