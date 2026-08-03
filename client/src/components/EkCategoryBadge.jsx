import { CATEGORIES } from '../categories';

/**
 * Local replacement for KUI's CategoryBadge.
 *
 * KUI is pinned (we can't publish to it), and its badge only covers five
 * categories — so Price and Sports questions showed no badge at all. Same
 * visual language as the KUI original, driven by --kui-* tokens so it stays in
 * theme.
 */
export default function EkCategoryBadge({ category, style, ...rest }) {
  const cat = CATEGORIES[category];
  if (!cat) return null;

  return (
    <span
      className="ek-catbadge"
      style={{ '--ek-cat-color': cat.color, ...style }}
      {...rest}
    >
      {cat.label}
    </span>
  );
}
