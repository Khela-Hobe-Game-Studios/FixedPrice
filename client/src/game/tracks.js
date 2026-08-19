/**
 * The music manifest — filenames only, no dependencies.
 *
 * Deliberately its own module with nothing imported into it, so that
 * `scripts/check-music.js` can import it straight from Node and HEAD every URL
 * without dragging Howler and the rest of the client in. A track that is listed
 * here but not uploaded (or uploaded under a different name) is otherwise a
 * silent board on game night, and there is no ambient traffic to catch it.
 *
 * Adding a track: upload it to the folder on R2, add the filename below, run
 * `npm run check:music`.
 */

export const CDN = 'https://pub-039ad0fe61d64de69d722e5ecd00b200.r2.dev';

/**
 * Three playlists, one per stretch of the night.
 *
 *   startup      the board is standing there with people walking up to it — the
 *                landing, the settings, and the lobby filling with players
 *   game         under the rounds themselves
 *   celebration  the final standings, and for as long as the room takes to argue
 *                about whether to play again
 *
 * `volume` is the track's own level, `fadeIn` how long it takes to arrive, and
 * `delay` how long the board waits before starting it. Celebration waits out the
 * fanfare cue (1.2s): the fanfare is written to land on silence.
 */
export const PLAYLISTS = {
  startup: {
    folder: 'startup-music',
    volume: 0.32,
    fadeIn: 1600,
    delay: 0,
    tracks: [
      'ekdaam.mp3',
      'ke_hobe_raja.mp3',
      'shesh_baji.mp3',
    ],
  },

  game: {
    folder: 'bg-music',
    volume: 0.35,
    fadeIn: 1200,
    delay: 0,
    tracks: [
      'the_scoring_bell.mp3',
      'the_dhaka_lobby.mp3',
      'square_wave_bazaar.mp3',
      'round_one_answer.mp3',
    ],
  },

  celebration: {
    folder: 'celebration-music',
    volume: 0.40,
    fadeIn: 900,
    delay: 1400,
    tracks: [
      'ek_daam.mp3',
      'winner_price.mp3',
    ],
  },
};

/**
 * Where a playlist goes when it has nothing playable left — an empty list, or
 * every track in it 404ing. The game pool is the one that has always been there,
 * so it is the floor: a lobby with the wrong music is a bug, a lobby with no
 * music at all reads as a broken board.
 */
export const FALLBACK = {
  startup: 'game',
  celebration: 'game',
  game: null,
};

export const urlFor = (folder, file) => `${CDN}/${folder}/${file}`;

/** Every URL the client could ask for, flattened — for the checker. */
export function allTracks() {
  return Object.entries(PLAYLISTS).flatMap(([key, list]) =>
    list.tracks.map((file) => ({ key, file, url: urlFor(list.folder, file) })));
}
