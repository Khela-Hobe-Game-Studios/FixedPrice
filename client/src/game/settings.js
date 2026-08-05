import { useCallback, useEffect, useState } from 'react';

/**
 * Host-device settings — the three the server has no opinion about.
 *
 * Lighting, sound and motion belong to the room the board is standing in, not to
 * the game, so they live on the device and persist between games. Phones are always
 * night: a phone is held close and glanced at, and the dark board is the more
 * legible of the two at arm's length.
 */

const KEY = 'ek_daam_board';

export const DEFAULT_BOARD = {
  lighting: 'auto',  // auto | night | day
  sound: true,
  motion: 'full',    // full | reduced
};

function read() {
  try {
    return { ...DEFAULT_BOARD, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_BOARD };
  }
}

/** AUTO follows the clock in the room: daylight is daylight. */
function resolveLighting(mode) {
  if (mode === 'day' || mode === 'night') return mode;
  const hour = new Date().getHours();
  return hour >= 8 && hour < 17 ? 'day' : 'night';
}

export function applyBoardSettings(board, { isPhone = false } = {}) {
  const root = document.documentElement;
  root.dataset.lighting = isPhone ? 'night' : resolveLighting(board.lighting);
  root.dataset.motion = board.motion === 'reduced' ? 'reduced' : 'full';
}

export function useBoardSettings({ isPhone = false } = {}) {
  const [board, setBoard] = useState(read);

  useEffect(() => {
    applyBoardSettings(board, { isPhone });
    try {
      localStorage.setItem(KEY, JSON.stringify(board));
    } catch {
      /* private mode — the board still works, it just won't be remembered */
    }
  }, [board, isPhone]);

  // AUTO has to keep meaning "now", not "whenever this tab was opened" — a game
  // that starts at dusk should turn the lights on partway through.
  useEffect(() => {
    if (board.lighting !== 'auto' || isPhone) return undefined;
    const t = setInterval(() => applyBoardSettings(board, { isPhone }), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [board, isPhone]);

  const update = useCallback((patch) => setBoard((b) => ({ ...b, ...patch })), []);

  return [board, update];
}
