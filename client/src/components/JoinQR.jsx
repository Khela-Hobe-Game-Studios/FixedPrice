import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function joinUrl(code) {
  const { origin } = window.location;
  const base = import.meta.env.BASE_URL || '/';
  return `${origin}${base}${base.endsWith('/') ? '' : '/'}?join=${code}`;
}

/** The address a guest would type, without the deep-link query. */
export function joinHost() {
  return joinUrl('')
    .replace(/^https?:\/\//, '')
    .replace(/\?join=.*$/, '')
    .replace(/\/$/, '');
}

/**
 * With 15 guests, typing an address plus a 4-letter code is the slowest part of the
 * whole game — this makes it a scan, deep-linked so the code is prefilled.
 *
 * The quiet zone stays white and the modules stay near-black even on a board where
 * everything else is emissive: a QR inverted into the board's palette is a QR that
 * half the phones in the room refuse to read.
 */
export default function JoinQR({ code, size = 120, pad = 8 }) {
  const [dataUrl, setDataUrl] = useState(null);
  const url = code ? joinUrl(code) : null;

  useEffect(() => {
    if (!url) { setDataUrl(null); return undefined; }
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: size * 3,           // oversampled — this is read across a living room
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#07090A', light: '#E8E4D8' },
    })
      .then((d) => { if (!cancelled) setDataUrl(d); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [url, size]);

  if (!url) return null;

  return (
    <div
      style={{
        width: size,
        height: size,
        flex: 'none',
        padding: pad,
        background: 'var(--bone)',
        display: 'flex',
      }}
    >
      {dataUrl && (
        <img
          src={dataUrl}
          alt={`QR code to join room ${code}`}
          width={size - pad * 2}
          height={size - pad * 2}
          style={{ imageRendering: 'pixelated' }}
        />
      )}
    </div>
  );
}
