import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TextShape } from '@/core/text/encoding';

/**
 * Local storage for preferences, recent documents, and unsaved drafts.
 *
 * Two rules govern everything in here.
 *
 * **No document content, except a draft of unsaved work.** Not a preview
 * snippet, not a first line for the recents list. A snippet would be the single
 * most tempting addition — it makes a recents list look much better — and it
 * would mean the contents of every document you have opened sit in browser
 * storage indefinitely. The name and a file handle are enough to reopen.
 *
 * The `drafts` store is the one deliberate exception, and it is narrow: text is
 * written only while a document is dirty, and the row is deleted the moment
 * that work becomes durable somewhere else. Content you have saved is never
 * held here. See drafts.ts for the bounds that keep it that way.
 *
 * **The user's file is the source of truth.** Nothing here is authoritative.
 * Losing this database should cost preferences, a convenience list, and a
 * recovery net — never the file. That is why drafts are recovery-only and
 * surfaced as a prompt rather than applied silently.
 */

/** Bumping this runs the upgrade path below. Add stores, never rewrite them. */
const VERSION = 2;
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

/**
 * Unsaved work, kept only until it stops being unsaved.
 *
 * A draft exists so that closing a tab, reloading, or losing the browser does
 * not cost you an edit. It is never applied on its own — recovery is a prompt,
 * because silently resurrecting text over a file the reader may have changed
 * elsewhere would be exactly the kind of surprise this product cannot afford.
 */
export interface StoredDraft {
  id: string;
  /** The document's name at the time it was flushed, for the recovery prompt. */
  name: string;
  /** Normalized to LF, as everywhere above the encoding boundary. */
  text: string;
  /** Carried so a recovered draft still saves byte-for-byte. */
  shape: TextShape;
  savedAt: number;
  /**
   * Present only for handle-backed documents. It is what lets recovery offer to
   * put the text back into the file it came from rather than into a copy — and
   * what identifies a draft as belonging to that file across sessions, since
   * nothing else about a document survives a reload.
   */
  handle: FileSystemFileHandle | null;
  /**
   * The file's modification time when LocalMD last read it or wrote to it.
   *
   * A draft is offered back hours or days later, and in between the file it
   * came from may have been edited by something else. Recording where the draft
   * branched from is what lets recovery tell the difference between putting
   * work back and silently overwriting someone's other edits. Null whenever
   * there was no file to stat.
   */
  baseModified: number | null;
}

interface LocalMDSchema extends DBSchema {
  prefs: { key: string; value: unknown };
  recents: { key: string; value: RecentDocument; indexes: { lastOpened: number } };
  drafts: { key: string; value: StoredDraft; indexes: { savedAt: number } };
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
      // Added in version 2. Guarded like the others so the same function serves
      // a fresh database and an upgrade from version 1.
      if (!db.objectStoreNames.contains('drafts')) {
        const store = db.createObjectStore('drafts', { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt');
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
  // Drafts belong here more than anything else does: they are the only store
  // that holds document text, so a "clear local data" that missed them would
  // leave behind precisely the thing the reader asked to be rid of.
  await Promise.all([db.clear('prefs'), db.clear('recents'), db.clear('drafts')]);
}
