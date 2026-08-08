import { useRef, useState } from 'react';
import { PhoneScreen, AvatarTile, Btn, playerColor } from '../../board';
import { PhoneHeader, RotateGuard } from './parts';
import { posterise, loadImageFile, releaseImage } from '../../game/avatar';
import { useCamera } from '../../game/useCamera';

/* The twelve are commissioned art, not shipped yet: 16x16 pixel art, 2-3 colours,
 * drawn to read against both the board and a saturated fill. Until they exist the
 * tab is visibly locked — emoji and icon fonts both break the pixel grid. */
const SPRITES = [
  'RICKSHAW', 'CRICKET BALL', 'FISH', 'TEACUP', 'TAKA NOTE', 'BUS',
  'MANGO', 'KITE', 'TIGER', 'BOAT', 'SHONDESH', 'UMBRELLA',
];

/**
 * Pick your face.
 *
 * Three sources, one tile. The colour is assigned and permanent — it is the part
 * that actually identifies you across the room — so this screen only chooses what
 * sits inside it.
 */
export default function PlayerAvatar({ me, onSet, onDone }) {
  const [tab, setTab] = useState('letter');
  const [shot, setShot] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef(null);
  const captureRef = useRef(null);
  const color = playerColor(me?.colorIndex);

  // The camera runs only while the tab is open and nothing has been taken yet;
  // switching away or landing a shot releases it, which is what turns the phone's
  // recording indicator off.
  const live = tab === 'selfie' && !shot;
  const { videoRef, ready, error: cameraError, retry } = useCamera(live);
  const notice = uploadError ?? cameraError;

  // The stream resolves before the first frame does, so `ready` gates the shutter on
  // a decoded frame rather than on the existence of a stream — an eager tap used to
  // throw out of the handler and just look broken.
  const capture = () => {
    const video = videoRef.current;
    if (!ready || !video?.videoWidth) return;
    try {
      setShot(posterise(video, color, { mirror: true }));
      setUploadError(null);
    } catch {
      setUploadError('THAT PHOTO DID NOT TAKE — TRY AGAIN');
    }
  };

  const upload = async (file) => {
    if (!file) return;
    let img = null;
    try {
      img = await loadImageFile(file);
      setShot(posterise(img, color));
      setUploadError(null);
    } catch {
      setUploadError('THAT IMAGE COULD NOT BE READ');
    } finally {
      releaseImage(img);
    }
  };

  const confirm = () => {
    if (tab === 'selfie' && shot) onSet({ kind: 'selfie', image: shot });
    else onSet({ kind: 'monogram' });
    onDone();
  };

  return (
    <PhoneScreen>
      <PhoneHeader left="এক দাম" right="YOUR FACE" bengali />

      <div className="ps-body" style={{ gap: 16 }}>
        <div className="ps-you">
          <AvatarTile
            size={78}
            colorIndex={me?.colorIndex}
            name={me?.name ?? ''}
            avatar={shot ? { kind: 'selfie', image: shot } : { kind: 'monogram' }}
            label={shot ? 'Your posterised selfie' : 'Your monogram tile'}
          />
          <div style={{ minWidth: 0 }}>
            <div className="bd-label" style={{ fontSize: 13 }}>
              YOU ARE
            </div>
            <div className="bd-word" style={{ fontSize: 38, marginTop: 4 }}>
              {me?.name}
            </div>
          </div>
        </div>

        <div className="ps-seg" role="tablist">
          <button
            type="button"
            role="tab"
            className="ps-seg__btn"
            aria-selected={tab === 'sprite'}
            disabled
            title="Sprites are being drawn"
          >
            SPRITE
          </button>
          <button
            type="button"
            role="tab"
            className="ps-seg__btn"
            aria-selected={tab === 'selfie'}
            onClick={() => setTab('selfie')}
          >
            SELFIE
          </button>
          <button
            type="button"
            role="tab"
            className="ps-seg__btn"
            aria-selected={tab === 'letter'}
            onClick={() => setTab('letter')}
            data-testid="avatar-letter"
          >
            LETTER
          </button>
        </div>

        {tab === 'letter' && (
          <div
            className="ps-scroll"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 24 }}
          >
            <AvatarTile
              size={140}
              colorIndex={me?.colorIndex}
              name={me?.name ?? ''}
              bar={8}
              label={`Your monogram tile, ${(me?.name ?? '').trim()[0] ?? ''}`}
            />
            <span className="bd-mono bd-mono--wrap" style={{ fontSize: 12, textAlign: 'center' }}>
              YOUR LETTER ON YOUR COLOUR. THE COLOUR IS WHAT PEOPLE READ FROM THE SOFA — IT IS
              YOURS FOR THE WHOLE GAME AND NOBODY ELSE IN THE ROOM HAS IT.
            </span>
          </div>
        )}

        {tab === 'selfie' && (
          <div className="ps-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ps-camera">
              {shot ? (
                <img src={shot} alt="Your posterised selfie" />
              ) : (
                <>
                  {/* Mounted unconditionally and hidden with opacity, never with
                    * `display: none` — iOS will not decode a frame into an element
                    * it is not drawing, and the ref has to exist before the stream
                    * arrives or it is attached to nothing. */}
                  <video
                    ref={videoRef}
                    className="ps-camera__view"
                    style={{ opacity: ready ? 1 : 0 }}
                    autoPlay
                    playsInline
                    muted
                  />
                  {!ready && (
                    <span
                      className="ps-camera__note bd-mono bd-mono--wrap"
                      style={{ fontSize: 12, textAlign: 'center' }}
                    >
                      {notice ?? (
                        <>
                          CAMERA PREVIEW
                          <br />
                          SQUARE CROP, CENTRED
                        </>
                      )}
                    </span>
                  )}
                </>
              )}
            </div>
            <span className="bd-mono bd-mono--wrap" style={{ fontSize: 11 }}>
              PHOTOS ARE POSTERISED TO 2 TONES + YOUR COLOUR, SO THEY READ AT 18PX ON THE TV AND
              NEVER FIGHT THE BOARD.
            </span>
          </div>
        )}

        {tab === 'sprite' && (
          <div className="ps-scroll">
            <div className="ps-sprites">
              {SPRITES.map((label, i) => (
                <div key={label} className="ps-sprite" style={{ '--sprite-color': playerColor(i) }}>
                  <span className="ps-sprite__ph" />
                  <span className="ps-sprite__label">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ps-cta">
        {tab === 'selfie' && !shot && (
          <>
            {/* When getUserMedia will not play — an in-app webview, a locked-down
              * iOS profile, a camera another app has — the file input with
              * `capture` still opens the native camera. It is the one path that
              * exists on every phone, so it takes over the primary slot rather
              * than hiding behind a second tap. */}
            {cameraError ? (
              <Btn block cta onClick={() => captureRef.current?.click()}>
                OPEN THE CAMERA APP
              </Btn>
            ) : (
              <Btn block cta onClick={capture} disabled={!ready}>
                {ready ? 'TAKE PHOTO' : 'STARTING CAMERA…'}
              </Btn>
            )}
            <div className="ps-cta__row">
              {cameraError && (
                <Btn small tone="ghost" onClick={retry}>
                  RETRY
                </Btn>
              )}
              <Btn small tone="ghost" onClick={() => fileRef.current?.click()}>
                UPLOAD A PHOTO
              </Btn>
            </div>
            <input
              ref={captureRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = ''; // so retaking the same shot re-fires change
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </>
        )}
        {tab === 'selfie' && shot && (
          <>
            <Btn block cta onClick={confirm} data-testid="use-avatar">
              USE THIS
            </Btn>
            <Btn
              block
              small
              tone="ghost"
              onClick={() => { setShot(null); setUploadError(null); }}
            >
              RETAKE
            </Btn>
          </>
        )}
        {tab !== 'selfie' && (
          <Btn block cta onClick={confirm} data-testid="use-avatar">
            USE THIS
          </Btn>
        )}
      </div>

      <RotateGuard />
    </PhoneScreen>
  );
}
