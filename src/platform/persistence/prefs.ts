import type { StoredPrefs } from './db';

/**
 * Reading preferences.
 *
 * These live in localStorage rather than IndexedDB, which is a deliberate split
 * from the recents store next door:
 *
 * - **Preferences must be readable synchronously.** Theme has to be applied
 *   before first paint or the reader gets a white flash before a dark page.
 *   IndexedDB is async and cannot be consulted that early. `public/theme-init.js`
 *   reads these values in a blocking script in `<head>`; a separate file rather
 *   than an inline script because `script-src 'self'` forbids inline script, and
 *   loosening the CSP for a theme flicker would be a poor trade.
 * - **Recents must store a `FileSystemFileHandle`**, which only IndexedDB's
 *   structured clone can hold. localStorage stringifies, which would destroy it.
 *
 * So each store is used for the thing it is actually good at.
 *
 * Note what is *not* here: the remote-content decision. That is per document and
 * per session by design — persisting it would mean trusting your own README once
 * and thereby trusting every file anyone sends you afterwards. Adding it to this
 * file would be a security change, not a convenience.
 */

const KEY = 'localmd.prefs';

export const DEFAULT_PREFS: StoredPrefs = {
  theme: 'system',
  typeface: 'sans',
  outlinePinned: true,
};

/** Synchronous, so callers can use it during the first render. */
export function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS;

    // Merged over defaults rather than replacing them, so a preference added in
    // a later version does not come back undefined for an existing reader, and
    // a hand-edited or corrupted value cannot remove a key entirely.
    return { ...DEFAULT_PREFS, ...(parsed as Partial<StoredPrefs>) };
  } catch {
    // Private browsing, a disabled-storage origin, or malformed JSON — none of
    // which should stop someone reading a document.
    return DEFAULT_PREFS;
  }
}

export function clearPrefs(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored, nothing to clear */
  }
}

export function savePrefs(prefs: StoredPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience. Failing to store one is not worth
    // interrupting the reader over.
  }
}
