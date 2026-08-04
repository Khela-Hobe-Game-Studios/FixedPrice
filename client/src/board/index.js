/* DOT MATRIX — the board's design system.
 *
 * Plain React and plain CSS, no dependencies. Every screen composes from these.
 * Import styles once, from main.jsx: `import './board/board.css'`.
 */

export { default as Stage, PhoneScreen } from './Stage';
export { Band, BandCell, Brand, Marquee } from './Band';
export { default as SplitColumns } from './SplitColumns';
export { default as AvatarTile, playerColor, hasNotch, PLAYER_RAMP } from './AvatarTile';
export { default as Num, FlapNum, formatNum } from './Numeral';
export { default as SegmentBar } from './SegmentBar';
export { default as Countdown } from './Countdown';
export { KeyTile, CodeEntry } from './KeyTile';
export { default as Btn, ActionBar } from './Btn';
export { default as Toasts, ToastBand } from './Toasts';
