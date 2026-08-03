import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function joinUrl(code) {
  const { origin } = window.location;
  const base = import.meta.env.BASE_URL || '/';
  return `${origin}${base}${base.endsWith('/') ? '' : '/'}?join=${code}`;
}

/**
 * The host lobby used to say "Players join at your URL" without ever showing the
 * URL. With 15 guests, typing an address plus a 4-letter code is the slowest part
 * of the whole game — this makes it a scan, deep-linked so the code is prefilled.
 */
export default function JoinQR({ code, size = 168 }) {
  const [dataUrl, setDataUrl] = useState(null);
  const url = code ? joinUrl(code) : null;

  useEffect(() => {
    if (!url) { setDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: size * 2,           // 2x for crisp rendering on a TV
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#003d2e', light: '#ffffff' },
    })
      .then(d => { if (!cancelled) setDataUrl(d); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [url, size]);

  if (!url) return null;

  // Show the bare address people would type; the QR carries the ?join= deep link.
  const display = url.replace(/^https?:\/\//, '').replace(/\?join=.*$/, '').replace(/\/$/, '');

  return (
    <div className="ek-joinqr">
      {dataUrl
        ? <img src={dataUrl} alt={`QR code to join room ${code}`} width={size} height={size} />
        : <div className="ek-joinqr__placeholder" style={{ width: size, height: size }} />}
      <div className="ek-joinqr__meta">
        <span className="ek-joinqr__label">Scan to join</span>
        <span className="ek-joinqr__url">{display}</span>
      </div>
    </div>
  );
}
