import { useCallback, useEffect, useRef, useState } from 'react';
import { attachStream, cameraMessage, openCamera, stopCamera } from './avatar';

/**
 * The viewfinder, as a state machine, because the naive version does not work
 * anywhere.
 *
 * Opening a camera and showing it are two separate problems and they have to be two
 * separate effects. `getUserMedia` resolves, you call `setStream`, and in the same
 * tick you assign `video.srcObject` — but if the `<video>` is rendered *because* the
 * stream exists, it has not mounted yet and the ref is still null. The assignment is
 * a silent no-op, the element then mounts with no source, and the user gets exactly
 * what was reported: the permission prompt, a granted permission, and a dead black
 * square. So the element is mounted unconditionally by the caller and the stream is
 * attached from an effect that runs after it exists.
 *
 * `ready` is not "we have a stream" either. A stream resolves well before the first
 * frame decodes, and `videoWidth` is 0 until then — a shutter tap in that window
 * captures nothing. Readiness is the metadata event plus a non-zero width.
 *
 * The rest is the platforms:
 *   - iOS ends the track when the app backgrounds or a call arrives, and never
 *     restores it. The video keeps painting its last frame, so nothing looks wrong.
 *   - Android Chrome pauses the element when the tab hides.
 * Both are handled on `visibilitychange`: a dead track reopens, a paused element
 * plays. Neither re-prompts, because permission is already granted by then.
 */
export function useCamera(active) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  // 1. Acquire.
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let opened = null;

    // Clear the last failure before asking again. Leaving it set meant a player who
    // was refused once, switched tabs and came back got a working viewfinder behind
    // a CTA still offering them the no-camera fallback.
    setError(null);
    setReady(false);
    openCamera()
      .then((s) => {
        if (cancelled) return stopCamera(s);
        opened = s;
        setStream(s);
        return undefined;
      })
      .catch((err) => {
        if (!cancelled) setError(cameraMessage(err));
      });

    return () => {
      cancelled = true;
      stopCamera(opened);
      setStream(null);
      setReady(false);
    };
  }, [active, attempt]);

  // 2. Attach — a separate pass, so the <video> is guaranteed to have mounted.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return undefined;

    attachStream(video, stream);

    const check = () => setReady(!!video.videoWidth);
    video.addEventListener('loadedmetadata', check);
    video.addEventListener('playing', check);
    check(); // a stream re-attached to a warm element can already be past both

    // The OS taking the camera back is not an error the user caused, but it is one
    // they have to be told about — otherwise the frozen last frame reads as live.
    const tracks = stream.getVideoTracks();
    const onEnded = () => {
      setReady(false);
      setError('CAMERA STOPPED — TAP RETRY, OR UPLOAD A PHOTO');
    };
    tracks.forEach((t) => t.addEventListener('ended', onEnded));

    return () => {
      video.removeEventListener('loadedmetadata', check);
      video.removeEventListener('playing', check);
      tracks.forEach((t) => t.removeEventListener('ended', onEnded));
      video.srcObject = null;
    };
  }, [stream]);

  // 3. Survive the phone being put down.
  useEffect(() => {
    if (!active || !stream) return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const live = stream.getVideoTracks().some((t) => t.readyState === 'live');
      if (!live) {
        setError(null);
        setAttempt((n) => n + 1);
      } else if (videoRef.current?.paused) {
        videoRef.current.play?.().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active, stream]);

  return { videoRef, ready, error, retry };
}
