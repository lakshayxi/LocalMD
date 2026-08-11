import { clearAll } from './db';
import { clearPrefs } from './prefs';

export { clearAll, getDB, isAvailable, requestPersistence } from './db';
export type { RecentDocument, StoredPrefs } from './db';
export { DEFAULT_PREFS, clearPrefs, loadPrefs, savePrefs } from './prefs';
export {
  ensureReadPermission,
  forgetRecent,
  listRecents,
  recordRecent,
} from './recents';
export type { PermissionOutcome } from './recents';

/**
 * Erases everything LocalMD has stored locally.
 *
 * Backs the control the privacy page promises. It spans both stores on purpose
 * — preferences live in localStorage and recents in IndexedDB for reasons that
 * matter internally (see prefs.ts) and not at all to someone who has just asked
 * for their traces to be gone.
 */
export async function clearAllLocalData(): Promise<void> {
  clearPrefs();
  await clearAll();
}
