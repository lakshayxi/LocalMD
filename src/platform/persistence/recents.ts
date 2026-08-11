import { getDB, requestPersistence, type RecentDocument } from './db';
import { isSameEntry } from './same-entry';

/**
 * Recently opened documents.
 *
 * This is the feature that turns LocalMD from a one-shot tool into something
 * you come back to. Without it you visit once, read, and next time open your
 * editor instead — which is the structural weakness the plan named.
 *
 * Only documents with a File System Access handle are recorded, because only
 * those can be reopened. A row you cannot click is worse than no row.
 */

/** Beyond this the list stops being a shortcut and starts being a file manager. */
const MAX_RECENTS = 12;

export async function listRecents(): Promise<RecentDocument[]> {
  try {
    const db = await getDB();
    const all = await db.getAllFromIndex('recents', 'lastOpened');
    return all.reverse();
  } catch {
    return [];
  }
}

/**
 * Records an opened document, replacing any earlier entry for the same file.
 *
 * Identity comes from `isSameEntry` rather than the filename: two different
 * `README.md` files from different projects are different documents, and the
 * same file moved is still the same file.
 */
export async function recordRecent(
  handle: FileSystemFileHandle,
  size: number | null,
): Promise<void> {
  try {
    const db = await getDB();
    const existing = await db.getAll('recents');

    let id: string | null = null;
    for (const entry of existing) {
      if (await isSameEntry(entry.handle, handle)) {
        id = entry.id;
        break;
      }
    }

    await db.put('recents', {
      id: id ?? crypto.randomUUID(),
      name: handle.name,
      size,
      lastOpened: Date.now(),
      handle,
    });

    await trim(db);

    // Asked for here rather than on page load, because this is the first moment
    // there is anything worth keeping. Someone who pastes a snippet and leaves
    // should not have prompted their browser to reserve storage on our behalf.
    void requestPersistence();
  } catch {
    // Recents are a convenience; failing to record one must not break opening.
  }
}

async function trim(db: Awaited<ReturnType<typeof getDB>>): Promise<void> {
  const all = await db.getAllFromIndex('recents', 'lastOpened');
  const excess = all.slice(0, Math.max(0, all.length - MAX_RECENTS));
  await Promise.all(excess.map((entry) => db.delete('recents', entry.id)));
}

export async function forgetRecent(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('recents', id);
  } catch {
    /* nothing to do */
  }
}

export type PermissionOutcome = 'granted' | 'denied' | 'unsupported';

/**
 * Re-requests read permission for a stored handle.
 *
 * Handles survive a reload but their permission does not, so reopening a recent
 * prompts again. That request needs a user activation, which is why it happens
 * on click rather than while the list is being drawn — asking on page load
 * would both fail and feel like an ambush.
 */
export async function ensureReadPermission(
  handle: FileSystemFileHandle,
): Promise<PermissionOutcome> {
  // Both are optional in the type because the API is not on a standards track
  // every engine has adopted. Checking them together means the happy path below
  // needs no further narrowing.
  const query = handle.queryPermission?.bind(handle);
  const request = handle.requestPermission?.bind(handle);
  if (!query || !request) return 'unsupported';

  const options = { mode: 'read' } as const;
  if ((await query(options)) === 'granted') return 'granted';

  try {
    return (await request(options)) === 'granted' ? 'granted' : 'denied';
  } catch {
    // Chromium throws rather than resolving 'denied' when the request is made
    // without a user activation, which is why callers must invoke this from a
    // click handler.
    return 'denied';
  }
}
