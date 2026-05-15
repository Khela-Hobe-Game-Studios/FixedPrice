export default function EkBrandLine() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 18px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 2,
        lineHeight: 1,
        pointerEvents: 'none',
        zIndex: 2,
        opacity: 0.85,
      }}
    >
      <span
        className="ek-bengali"
        style={{
          fontFamily: 'var(--kui-font-bengali)',
          fontWeight: 700,
          fontSize: 'var(--kui-text-lg)',
          color: 'var(--kui-primary)',
          lineHeight: 1,
        }}
      >
        এক দাম
      </span>
      <span
        style={{
          fontFamily: 'var(--kui-font-display)',
          fontWeight: 800,
          fontSize: 'var(--kui-text-xs)',
          letterSpacing: '0.18em',
          color: 'var(--kui-text-muted)',
          lineHeight: 1,
        }}
      >
        FIXED PRICE
      </span>
    </div>
  );
}
