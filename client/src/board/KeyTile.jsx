import { useRef } from 'react';

/**
 * One letter of the room code, on its own lit tile.
 *
 * The code is the single most-photographed thing on the screen — people hold their
 * phone up to the TV — so each letter gets a panel of its own with an amber bar
 * under it rather than sharing one word-shaped block.
 */
export function KeyTile({
  children,
  width = 80,
  height = 96,
  size = 62,
  bar = 5,
  tone = 'amber',
  empty = false,
  active = false,
  className = '',
  style,
}) {
  const color = tone === 'red' ? 'var(--led-red)' : 'var(--amber)';
  return (
    <span
      className={`bd-key ${className}`}
      style={{
        width,
        height,
        fontSize: size,
        borderBottom: `${bar}px solid ${empty ? 'var(--out-20)' : color}`,
        color,
        ...style,
      }}
      data-active={active || undefined}
    >
      {children}
      {active && <span className="bd-key__caret" style={{ height: size * 0.7 }} />}
    </span>
  );
}

/**
 * The four-tile code field on the phone.
 *
 * A real input drives it — visually hidden but focusable, so the phone keyboard, the
 * QR deep link, autofill and paste all behave — and the tiles are a rendering of its
 * value. Keeps the `#room-code` id the screenshot pipeline types into.
 */
export function CodeEntry({
  value,
  onChange,
  length = 4,
  tone = 'amber',
  id = 'room-code',
  autoFocus = false,
  label = 'Room code',
}) {
  const inputRef = useRef(null);
  const chars = value.padEnd(length, ' ').slice(0, length).split('');

  return (
    <div className="bd-codeentry" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        id={id}
        className="bd-codeentry__input"
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, length)
          )
        }
        maxLength={length}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck="false"
        inputMode="text"
        aria-label={label}
        autoFocus={autoFocus}
        data-testid="room-code-input"
      />
      <div className="bd-codeentry__tiles" aria-hidden="true">
        {chars.map((c, i) => (
          <KeyTile
            key={i}
            width="100%"
            height={78}
            size={46}
            bar={4}
            tone={tone}
            empty={c === ' '}
            active={i === Math.min(value.length, length - 1) && c === ' '}
          >
            {c.trim()}
          </KeyTile>
        ))}
      </div>
    </div>
  );
}
