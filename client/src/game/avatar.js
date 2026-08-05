/**
 * Turning a photo into something the board can use.
 *
 * Fifteen arbitrary photos would destroy the board's coherence and none of them
 * would read at 18px on a TV across a room. So a selfie is posterised the way a
 * newspaper halftone is: square crop, greyscale, a two-level threshold, dark mapped
 * to the board and light mapped to the player's own colour, with an ordered dither
 * at the same 4px pitch as the dot grid behind it.
 *
 * The result is two colours, one of which the player already owns — so it is legible
 * at 18px, it never fights the board, and it still looks like them.
 *
 * Runs entirely on the phone. Only the processed square is uploaded, at 96px, which
 * lands around 1-2KB.
 */

const SIZE = 96;

// 4x4 Bayer matrix — the dither pitch matches the board's dot grid, so a face and
// the background it sits on are screened at the same frequency.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

/**
 * @param source  an HTMLImageElement / HTMLVideoElement / ImageBitmap
 * @param color   the player's ramp colour, which the light tone becomes
 * @param dither  0 = hard threshold, 1 = full ordered dither
 */
export function posterise(source, color, { dither = 0.7, threshold = 0.5 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Square crop from the centre — a portrait cropped off-centre is a portrait of
  // someone's ear.
  const w = source.videoWidth ?? source.naturalWidth ?? source.width;
  const h = source.videoHeight ?? source.naturalHeight ?? source.height;
  const side = Math.min(w, h);
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);

  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const px = img.data;
  const [lr, lg, lb] = hexToRgb(color);
  const [dr, dg, db] = [7, 9, 10]; // --board

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      // Rec. 601 luma: skin tones separate better from a dark ground than a flat
      // average does.
      const luma = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
      const bias = ((BAYER[y % 4][x % 4] + 0.5) / 16 - 0.5) * dither;
      const lit = luma + bias > threshold;

      px[i] = lit ? lr : dr;
      px[i + 1] = lit ? lg : dg;
      px[i + 2] = lit ? lb : db;
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Read a chosen file into something posterise() can draw. */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read'));
    };
    img.src = url;
  });
}

/**
 * The front camera, square, at a size we are about to throw most of away.
 *
 * getUserMedia needs a secure context, so over plain http on a LAN this rejects and
 * the picker falls back to the upload path rather than showing a dead button.
 */
export async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera on this device');
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
    audio: false,
  });
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}
