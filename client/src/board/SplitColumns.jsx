/**
 * Two columns that fill top-to-bottom, not row-major.
 *
 * This exists because the same defect showed up twice in design review: rows placed
 * directly into a two-column grid fill left-right, so the lobby roster reads as a
 * checkerboard and the reveal gives you every other rank down each column with the
 * struck-through misses scattered.
 *
 * The fix is always the same — exactly two wrapper divs, each its own grid — so it
 * lives in one place and the bug cannot come back. Rows inside each wrapper share
 * the leftover height (`grid-auto-rows: 1fr`), which is what lets the reveal serve 2
 * players and 15 with the same markup.
 *
 * `splitAt` defaults to a balanced split with the extra row in the first column,
 * which is what the design shows at 15 (8 | 7).
 */
export default function SplitColumns({
  items,
  splitAt,
  renderItem,
  gap = '0 22px',
  rowGap,
  stretch = true,
  className = '',
  columnClassName = '',
  style,
}) {
  const cut = splitAt ?? Math.ceil(items.length / 2);
  const columns = [items.slice(0, cut), items.slice(cut)];

  return (
    <div
      className={`bd-split ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap,
        minHeight: 0,
        ...style,
      }}
    >
      {columns.map((column, ci) => (
        <div
          key={ci}
          className={`${stretch ? 'bd-rows' : 'bd-rows bd-rows--fixed'} ${columnClassName}`}
          style={rowGap ? { rowGap } : undefined}
          data-column={ci}
        >
          {column.map((item, i) => renderItem(item, cut * ci + i, ci))}
        </div>
      ))}
    </div>
  );
}
