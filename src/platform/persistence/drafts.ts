import type { TextShape } from '@/core/text/encoding';
import { currentWriteEpoch, getDB, requestPersistence, type StoredDraft } from './db';
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

/**
 * Rows that must never be written again.
 *
 * Cancelling a scheduled flush stops a write that has not started. It does
 * nothing about one already in the air — and there is always one in the air at
 * exactly the wrong moment, because the flush that matters is the one racing a
 * save. The sequence that costs the reader their guarantee:
 *
 *   1. the idle timer fires and `saveDraft` suspends on `getDB()`
 *   2. ⌘S lands, the file is written, `discardDraft` deletes the row
 *   3. the suspended write resumes and puts the row back
 *
 * The store now holds the text of a saved document, which is the one thing
 * db.ts promises it never does. An id is retired the instant its work becomes
 * durable or is thrown away, and a retired id is refused — before the write and
 * again after every await it passes through, since the discard can arrive in
 * any of those gaps.
 *
 * Retired forever rather than on a timer: ids are per-document UUIDs and the
 * store mints a fresh one the moment a document is edited again, so nothing
 * legitimate ever asks to write a retired id twice. The set grows by one entry
 * per document edited in a session, which is not a size worth managing.
 */
const retired = new Set<string>();

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
  /** The file's mtime when it was last read or written. See StoredDraft. */
  baseModified: number | null;
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
    const id = input.id ?? crypto.randomUUID();
    if (retired.has(id)) return null;

    // Which side of a wipe this write started on. Captured before the first
    // suspension, compared after it: a write that began before "clear local
    // data" must not land after it, however far along it had got. See db.ts.
    const epoch = currentWriteEpoch();

    const db = await getDB();
    // Checked again on the far side of the await. Opening the database is the
    // long suspension in this function and therefore the likely place for a
    // discard or a wipe to arrive; below this line the `put` is issued
    // synchronously, so there is no further gap for one to slip into.
    if (retired.has(id) || currentWriteEpoch() !== epoch) return null;

    await db.put('drafts', {
      id,
      name: input.name,
      text: input.text,
      shape: input.shape,
      savedAt: Date.now(),
      handle: input.handle,
      baseModified: input.baseModified,
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
  // Before the await, and outside the try. Retiring the id is what actually
  // makes the delete stick, so it must happen even if the database is
  // unreachable — and it must happen synchronously, so that a flush suspended
  // right now sees it when it resumes rather than winning the race by a tick.
  retired.add(id);

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
