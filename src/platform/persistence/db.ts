import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Local storage for preferences and recent documents.
 *
 * Two rules govern everything in here.
 *
 * **No document content, ever.** Not the text, not a preview snippet, not a
 * first line for the recents list. A snippet would be the single most tempting
 * addition — it makes a recents list look much better — and it would mean the
 * contents of every document you have opened sit in browser storage
 * indefinitely. The name and a file handle are enough to reopen; anything more
 * is a liability the product does not need.
 *
 * **The user's file is the source of truth.** Nothing here is authoritative.
 * Losing this database should cost preferences and a convenience list, nothing
 * else. That is also why drafts (M4) will be recovery-only and surfaced as a
 * prompt rather than applied silently.
 */

/** Bumping this runs the upgrade path below. Add stores, never rewrite them. */
const VERSION = 1;
const DB_NAME = 'localmd';

export interface StoredPrefs {
  theme: 'system' | 'light' | 'dark';
  typeface: 'sans' | 'serif';
  /** Whether the outline is pinned open on wide screens. */
  outlinePinned: boolean;
}

export interface RecentDocument {
  id: string;
  name: string;
  size: number | null;
  lastOpened: number;
  /**
   * A File System Access handle, which IndexedDB can store directly.
   *
   * Only documents with a handle are recorded at all. Without one there is no
   * way back to the file, so the entry would be a row that cannot be clicked —
   * and a list of things you cannot open is worse than no list. On Safari and
   * Firefox, which have no handles for user files, recents stay empty.
   */
  handle: FileSystemFileHandle;
}

interface LocalMDSchema extends DBSchema {
  prefs: { key: string; value: unknown };
  recents: { key: string; value: RecentDocument; indexes: { lastOpened: number } };
}

let dbPromise: Promise<IDBPDatabase<LocalMDSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<LocalMDSchema>> {
  dbPromise ??= openDB<LocalMDSchema>(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('prefs')) {
        db.createObjectStore('prefs');
      }
      if (!db.objectStoreNames.contains('recents')) {
        const store = db.createObjectStore('recents', { keyPath: 'id' });
        store.createIndex('lastOpened', 'lastOpened');
      }
    },
  });

  return dbPromise;
}

/**
 * Whether persistence is usable at all.
 *
 * IndexedDB is absent or throws in private browsing on some engines, and inside
 * sandboxed iframes. Every caller treats storage as optional rather than
 * assuming it exists — a reader in a private window should still get a working
 * app, just without memory.
 */
export async function isAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    await getDB();
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks the browser not to evict this origin's storage.
 *
 * Safari discards IndexedDB after about seven days without a visit, so recovery
 * is best-effort there whatever we do. Requesting persistence improves the odds
 * on Chromium without changing what we promise the reader.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Wipes everything. Backs the "clear local data" control the privacy page promises. */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  await Promise.all([db.clear('prefs'), db.clear('recents')]);
}
