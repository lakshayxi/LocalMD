import type { TextShape } from '@/core/text/encoding';
import { getDB, requestPersistence, type StoredDraft } from './db';
import { isSameEntry } from './same-entry';

/**
 * Unsaved work, held only for as long as it is unsaved.
 *
 * This is the one store that keeps document text, so it is also the one that
 * has to justify itself. The bargain: text is written only while a document is
 * dirty, it is deleted the instant that work becomes durable in a file, and it
 * is never applied without being offered first. What the reader gets in return
 * is that a closed tab, a reload, or a lost browser does not cost them an edit.
 *
 * Everything here fails soft. A draft is a safety net, and a net that throws on
 * the way to the document it is protecting is worse than no net.
 */

/**
 * Beyond this, the store stops being a recovery net and starts being an
 * unmanaged archive of everything you have ever typed. Small on purpose: the
 * realistic case is one or two documents interrupted mid-edit.
 */
const MAX_DRAFTS = 8;

/**
 * How long unsaved work is kept.
 *
 * Seven days, matching the point at which Safari evicts the origin's storage
 * anyway. Keeping drafts longer would hold text indefinitely on Chromium in
 * exchange for a promise we could not keep on WebKit — the wrong trade for a
 * store whose whole justification is that it is temporary.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DraftInput {
  /**
   * The row this document owns.
   *
   * Decided by the caller and decided *synchronously*, which is the whole point:
   * a teardown fires `visibilitychange` and `pagehide` in the same tick, so two
   * flushes are in the air before either write lands. If the row were worked out
   * in here, both would find nothing and mint one each. Passing it in makes the
   * second write an overwrite. Null only for a caller with nowhere to keep it.
   */
  id: string | null;
  name: string;
  text: string;
  shape: TextShape;
  /** Null for pasted, new, and dropped documents — there is no file behind them. */
  handle: FileSystemFileHandle | null;
}

/**
 * Writes a draft, replacing any earlier one for the same document.
 *
 * Returns the row's id so the caller can address it directly next time, or null
 * when storage is unavailable — a reader in a private window still gets a
 * working editor, just without a net.
 */
export async function saveDraft(input: DraftInput): Promise<string | null> {
  try {
    const db = await getDB();
    const id = input.id ?? crypto.randomUUID();

    await db.put('drafts', {
      id,
      name: input.name,
      text: input.text,
      shape: input.shape,
      savedAt: Date.now(),
      handle: input.handle,
    });

    await supersede(db, id, input.handle);
    await prune(db);
    void requestPersistence();
    return id;
  } catch {
    return null;
  }
}

/**
 * Keeps a file to one draft.
 *
 * An id only means anything within a session, so a document opened after a
 * reload arrives with a new one and would leave last week's abandoned draft of
 * the same file sitting alongside today's — and a recovery prompt offering one
 * file twice is a prompt nobody can answer. A handle is the only thing that
 * identifies a file across sessions, so where there is one, the newer draft
 * replaces the older rather than joining it.
 *
 * Only reachable with a real `FileSystemFileHandle`: a stand-in loses its
 * methods to structured clone, so this is on the manual release checklist
 * alongside the other handle-identity behaviour. See test/persistence/drafts.test.ts.
 */
async function supersede(
  db: Awaited<ReturnType<typeof getDB>>,
  id: string,
  handle: FileSystemFileHandle | null,
): Promise<void> {
  if (!handle) return;

  for (const draft of await db.getAll('drafts')) {
    if (draft.id !== id && (await isSameEntry(draft.handle, handle))) {
      await db.delete('drafts', draft.id);
    }
  }
}

/** Newest first, which is the order the recovery prompt offers them in. */
export async function listDrafts(): Promise<StoredDraft[]> {
  try {
    const db = await getDB();
    await prune(db);
    const all = await db.getAllFromIndex('drafts', 'savedAt');
    return all.reverse();
  } catch {
    return [];
  }
}

/**
 * Drops a draft.
 *
 * Called the moment the work stops being unsaved — a successful save, a
 * download, or a recovery the reader has accepted or declined. Holding on past
 * that point would leave the text of a saved document sitting in storage, which
 * is precisely what this store promises not to do.
 */
export async function discardDraft(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('drafts', id);
  } catch {
    /* nothing to do */
  }
}

async function prune(db: Awaited<ReturnType<typeof getDB>>): Promise<void> {
  const all = await db.getAllFromIndex('drafts', 'savedAt');
  const cutoff = Date.now() - MAX_AGE_MS;

  const doomed = new Set(all.filter((draft) => draft.savedAt < cutoff).map((draft) => draft.id));
  // Index order is oldest first, so the excess to drop is the head of the list.
  for (const draft of all.slice(0, Math.max(0, all.length - MAX_DRAFTS))) doomed.add(draft.id);

  await Promise.all([...doomed].map((id) => db.delete('drafts', id)));
}
