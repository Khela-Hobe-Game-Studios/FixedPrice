import Num from './Numeral';

/**
 * The clock.
 *
 * Blinks at 1s `steps(1)` throughout — one blink per second is the board's heartbeat.
 * In the final five seconds it doubles to 2Hz and goes red if it isn't already,
 * which is the only place in the design where two motion channels run at once.
 *
 * Pads to two digits so the numeral never changes width and the layout never shifts
 * under it.
 */
export default function Countdown({
  seconds,
  size = 170,
  tone = 'red',
  urgentAt = 5,
  className = '',
  style,
  ...rest
}) {
  const value = Math.max(0, Math.round(seconds ?? 0));
  const urgent = value <= urgentAt;

  return (
    <Num
      size={size}
      tone={urgent ? 'red' : tone}
      glow
      className={`bd-countdown${urgent ? ' bd-countdown--urgent' : ' bd-blink'} ${className}`}
      style={{ lineHeight: 0.85, ...style }}
      role="timer"
      aria-live="off"
      {...rest}
    >
      {String(value).padStart(2, '0')}
    </Num>
  );
}
