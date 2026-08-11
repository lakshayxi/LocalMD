/** Small display helpers shared by the recents list and the palette. */

/**
 * How to write the modifier key in shortcut hints.
 *
 * The one place a platform check is legitimate: this is a label, not a
 * capability. The handlers accept Meta and Control everywhere regardless of
 * what this says, so guessing wrong costs a wrong glyph and nothing more.
 */
export const MOD_KEY =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl+';

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * "just now" · "3 hours ago" · "yesterday".
 *
 * Deliberately coarse. The exact minute a file was last opened is never the
 * question being asked of a recents list — "was that this morning or last week"
 * is — and a precise timestamp makes the row look like a log line.
 */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = now - timestamp;

  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < WEEK) return relative.format(-Math.floor(elapsed / DAY), 'day');
  return relative.format(-Math.floor(elapsed / WEEK), 'week');
}

/** Byte counts as a reader would say them. Null when the size was never read. */
export function fileSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
