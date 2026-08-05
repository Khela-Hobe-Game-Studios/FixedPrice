/**
 * Every actionable thing on the board is a full-width bar, never a pill.
 *
 * `tone`: led (the default primary) | ghost | panel | red | amber.
 * Hit targets: the phone's primary CTA is 80px, secondary 52px, and nothing tappable
 * is under 44px.
 */
export default function Btn({
  children,
  tone = 'led',
  block = false,
  cta = false,
  small = false,
  pulse = false,
  className = '',
  ...rest
}) {
  const cls = [
    'bd-btn',
    tone !== 'led' ? `bd-btn--${tone}` : '',
    block ? 'bd-btn--block' : '',
    cta ? 'bd-btn--cta' : '',
    small ? 'bd-btn--sm' : '',
    pulse ? 'bd-btn--pulse' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

/** The host's footer, split into halves (PLAY AGAIN | FULL STANDINGS). */
export function ActionBar({ children, height, className = '' }) {
  return (
    <div
      className={`bd-actionbar ${className}`}
      style={height ? { height } : undefined}
    >
      {children}
    </div>
  );
}
