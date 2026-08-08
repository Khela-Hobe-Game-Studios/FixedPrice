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

/* A QR's colours are not design tokens. They are literals on purpose: `var(--bone)`
 * is the words colour, and in day mode it flips to near-black (#12211C) — which
 * painted the quiet zone black around a light QR and made the whole thing
 * unscannable on the day palette. Nothing here may reference the lighting. */
const QR_DARK = '#07090A';
const QR_LIGHT = '#E8E4D8';

/**
 * With 15 guests, typing an address plus a 4-letter code is the slowest part of the
 * whole game — this makes it a scan, deep-linked so the code is prefilled.
 *
 * The quiet zone stays light and the modules stay near-black even on a board where
 * everything else is emissive, and in both lighting modes: a QR inverted into the
 * board's palette is a QR that half the phones in the room refuse to read.
 */
export default function JoinQR({ code, size = 120, pad = 6 }) {
  const [dataUrl, setDataUrl] = useState(null);
  const url = code ? joinUrl(code) : null;

  useEffect(() => {
    if (!url) { setDataUrl(null); return undefined; }
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: size * 3,           // oversampled — this is read across a living room
      // The quiet zone is generated *into* the bitmap, in modules, so it stays in
      // proportion at 120px and at 220px. A CSS pad cannot: 8px is four modules at
      // one size and one and a half at the other.
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: QR_DARK, light: QR_LIGHT },
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
        background: QR_LIGHT,
        display: 'flex',
      }}
    >
      {dataUrl && (
        <img
          src={dataUrl}
          alt={`QR code to join room ${code}`}
          width={size - pad * 2}
          height={size - pad * 2}
          /* Deliberately *not* `pixelated`. The bitmap is 3x oversampled, so this is
           * a downscale, and nearest-neighbour downscaling point-samples module
           * edges away — a scanner sees ragged modules. Smoothing is what a camera
           * does to it anyway. */
        />
      )}
    </div>
  );
}
