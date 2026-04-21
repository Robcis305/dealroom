/**
 * Single source of truth for date formatting inside the deal room viewer.
 * All components render dates via these helpers — do not reimplement in components.
 */

/** "Apr 12, 2026" */
export function formatDate(ts: string | Date): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "just now", "5m ago", "3h ago", "2d ago", or a fallback localized date. */
export function formatRelative(ts: string | Date): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(ts);
}
