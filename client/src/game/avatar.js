/**
 * Turning a photo into something the board can use.
 *
 * Fifteen arbitrary photos would destroy the board's coherence and none of them
 * would read at 18px on a TV across a room. So a selfie is posterised: square crop,
 * greyscale, then quantised onto a ramp that runs from the board's own black up to
 * the player's colour — one hue, the one they already own.
 *
 * It is a *ramp* and not a threshold. Two levels is a screen-print, and a
 * screen-print of a face you have never seen at this size is a blob: everything that
 * identifies somebody — the shape of the nose, where the eyes sit, whether they are
 * smiling — lives in the midtones a 1-bit threshold throws away. Six levels keeps
 * the structure and still reads as one colour on the board rather than as a
 * photograph pasted onto it.
 *
 * Two things do most of the work:
 *   - auto-levels, because a phone selfie is nearly always backlit or side-lit and a
 *     fixed threshold renders both as a silhouette;
 *   - a light ordered dither at the same 4px pitch as the dot grid behind it, enough
 *     to break the bands without becoming the texture.
 *
 * Runs entirely on the phone. Only the processed square is uploaded, at 128px, which
 * lands around 2-4KB.
 */

const SIZE = 128;

// How many steps the ramp is quantised to, endpoints included. Two is a threshold,
// and past about eight it stops looking like the board and starts looking like a
// photograph that has been tinted.
const LEVELS = 6;

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
 * @param color   the player's ramp colour, which the top of the ramp becomes
 * @param levels  steps in the ramp, endpoints included
 * @param dither  0 = hard bands, 1 = a full step of ordered dither
 * @param mirror  match a mirrored front-camera preview
 */
export function posterise(source, color, { dither = 0.45, levels = LEVELS, mirror = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Square crop from the centre — a portrait cropped off-centre is a portrait of
  // someone's ear.
  //
  // `||` rather than `??`: a video element reports videoWidth 0 (not undefined)
  // until loadedmetadata, and `??` walks straight past a 0 into a zero-width
  // drawImage, which throws IndexSizeError instead of falling back.
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const side = Math.min(w, h);
  if (!side) throw new Error('That image is not ready yet');

  // The preview is mirrored, because a front camera that is not mirrored is a
  // stranger. The capture has to match it or the shutter appears to flip your face.
  if (mirror) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const px = img.data;
  const [lr, lg, lb] = hexToRgb(color);
  const [dr, dg, db] = [7, 9, 10]; // --board
  const n = SIZE * SIZE;

  // Rec. 601 luma: skin tones separate better from a dark ground than a flat average
  // does. Kept as a pass of its own so the histogram sees the whole frame before any
  // pixel is decided.
  const luma = new Float32Array(n);
  const hist = new Uint32Array(64);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const l = (px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114) / 255;
    luma[i] = l;
    hist[Math.min(63, (l * 64) | 0)]++;
  }

  // Auto-levels, clipping 2% at each end so a bright window or a dark jumper does not
  // set the range on its own. Without this, the ramp of a backlit selfie spans about
  // a fifth of its width and every level lands in the same two steps.
  const clip = n * 0.02;
  let lo = 0;
  let hi = 1;
  for (let b = 0, acc = 0; b < 64; b++) { acc += hist[b]; if (acc > clip) { lo = b / 64; break; } }
  for (let b = 63, acc = 0; b >= 0; b--) { acc += hist[b]; if (acc > clip) { hi = (b + 1) / 64; break; } }
  const span = Math.max(hi - lo, 0.15); // a flat frame must not be amplified to noise

  const steps = Math.max(1, levels - 1);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const p = i * 4;

      // ^0.8 opens the midtones. The ramp bottoms out at the board's own black, so
      // without the lift a face sits in its lower third and the shadow side of it
      // disappears into the tile.
      const t = Math.pow(Math.min(1, Math.max(0, (luma[i] - lo) / span)), 0.8);

      // The dither only ever has to carry across one step of the ramp, so it scales
      // with the step size — at six levels that is a fifth of what a threshold needs,
      // which is the difference between texture and grain.
      const bias = ((BAYER[y % 4][x % 4] + 0.5) / 16 - 0.5) * dither / steps;
      const q = Math.min(1, Math.max(0, Math.round((t + bias) * steps) / steps));

      px[p] = dr + (lr - dr) * q;
      px[p + 1] = dg + (lg - dg) * q;
      px[p + 2] = db + (lb - db) * q;
      px[p + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Read a chosen file into something posterise() can draw.
 *
 * `createImageBitmap(file, { imageOrientation: 'from-image' })` first, because a
 * photo straight off an iPhone carries its rotation in EXIF and an `<img>` decoded
 * from a blob URL does not always apply it — which is how a portrait selfie arrives
 * sideways and gets centre-cropped to an ear. Safari before 15 has no options bag on
 * createImageBitmap and throws, so the `<img>` path stays as the fallback.
 */
export async function loadImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
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

/** ImageBitmaps hold decoded pixels until they are closed; an `<img>` does not. */
export function releaseImage(source) {
  source?.close?.();
}

function fail(name, message) {
  return Object.assign(new Error(message), { name });
}

/* Descending order of ambition. Chrome and Safari both honour the first, but an
 * Android browser on a device whose front camera has no square-ish mode can reject
 * the whole call with OverconstrainedError rather than degrade — so ask for less,
 * twice, before giving up. A refusal is not retried: it would only re-prompt. */
const LADDER = [
  { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false },
  { video: { facingMode: 'user' }, audio: false },
  { video: true, audio: false },
];

/** The front camera, square, at a size we are about to throw most of away. */
export async function openCamera() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw fail('UnsupportedError', 'No camera API in this browser');
  }
  if (window.isSecureContext === false) {
    throw fail('InsecureContextError', 'The camera needs https');
  }

  let last = fail('UnsupportedError', 'No camera on this device');
  for (const constraints of LADDER) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') break;
    }
  }
  throw last;
}

/** Every reason the camera can refuse, said in a way that names the way out. */
export function cameraMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'CAMERA BLOCKED — ALLOW IT IN YOUR BROWSER, OR UPLOAD A PHOTO';
    case 'NotReadableError':
    case 'AbortError':
      return 'ANOTHER APP HAS THE CAMERA — CLOSE IT, OR UPLOAD A PHOTO';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'NO CAMERA FOUND — UPLOAD A PHOTO INSTEAD';
    case 'InsecureContextError':
      return 'THE CAMERA NEEDS HTTPS — UPLOAD A PHOTO INSTEAD';
    default:
      return 'NO CAMERA HERE — UPLOAD A PHOTO INSTEAD';
  }
}

/**
 * Point a `<video>` at a stream and get it playing.
 *
 * Every attribute here is load-bearing on one platform or another: iOS refuses to
 * play inline without `playsinline`, refuses to autoplay without `muted`, and its
 * `play()` returns a promise that rejects if the gesture is judged stale — which is
 * survivable, because the frames still arrive, so the rejection is swallowed rather
 * than turned into an error state the user cannot act on.
 */
export function attachStream(video, stream) {
  if (!video) return;
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  const played = video.play?.();
  played?.catch?.(() => {});
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}
