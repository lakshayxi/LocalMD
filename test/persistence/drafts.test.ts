import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { TextShape } from '@/core/text/encoding';
import type { DraftInput } from '@/platform/persistence/drafts';

/**
 * The draft store — the one place LocalMD keeps document text.
 *
 * What these tests are really protecting is the bargain that justifies it: a
 * draft exists only while work is unsaved, only one row per document, and never
 * for longer than the storage it lives in would survive anyway.
 *
 * **Known gap, stated rather than papered over.** Recognising a draft as
 * belonging to the same file across a reload — which is what keeps one file to
 * one row — runs through `FileSystemFileHandle.isSameEntry`, and a stand-in
 * handle loses its methods to IndexedDB's structured clone, so only a real
 * browser can serialize one. That path is verified by hand on Chrome and Edge
 * alongside the save-in-place check on the release checklist. What is reachable
 * from Node is everything else, including the property the lost methods
 * threaten: an uncomparable handle must not stop drafts from being written.
 */

const SHAPE: TextShape = { hadBom: false, lineEnding: 'lf', hadTrailingNewline: true };

class FakeHandle implements Pick<FileSystemFileHandle, 'name' | 'kind'> {
  readonly kind = 'file' as const;
  constructor(readonly name: string) {}
  async isSameEntry(other: FileSystemFileHandle) {
    return other.name === this.name;
  }
}

function draft(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    id: null,
    name: 'notes.md',
    text: '# Notes\n',
    shape: SHAPE,
    handle: null,
    baseModified: null,
    ...overrides,
  };
}

beforeEach(() => {
  // A fresh factory per test. The module under test memoizes its database
  // promise, so the module registry has to be reset alongside it.
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Re-imports against the current factory, since `getDB` caches its promise. */
async function freshModule() {
  return import('@/platform/persistence/drafts');
}

/** Both halves of the store, from the same fresh module registry. */
async function freshModules() {
  return {
    drafts: await import('@/platform/persistence/drafts'),
    db: await import('@/platform/persistence/db'),
  };
}

describe('saveDraft', () => {
  it('keeps the text and the shape that will reproduce the file', async () => {
    const drafts = await freshModule();
    await drafts.saveDraft(draft({ name: 'readme.md', text: '# Hi\r\n' }));

    const [stored] = await drafts.listDrafts();
    expect(stored).toMatchObject({ name: 'readme.md', text: '# Hi\r\n', shape: SHAPE });

    // Asserted as an exact shape rather than field by field. This is the only
    // store that holds document content, so anything added to it should have to
    // be said out loud.
    expect(Object.keys(stored!).sort()).toEqual([
      'baseModified',
      'handle',
      'id',
      'name',
      'savedAt',
      'shape',
      'text',
    ]);
  });

  it('records where the draft branched from, so recovery can spot a changed file', async () => {
    const drafts = await freshModule();
    const baseModified = Date.UTC(2026, 7, 11, 9, 30);

    await drafts.saveDraft(draft({ baseModified }));

    // Without this the recovery prompt cannot tell putting work back from
    // overwriting whatever edited the file in the meantime.
    expect((await drafts.listDrafts())[0]?.baseModified).toBe(baseModified);
  });

  it('overwrites the same row when handed back its id', async () => {
    const drafts = await freshModule();

    const id = await drafts.saveDraft(draft({ text: 'first' }));
    expect(id).not.toBeNull();
    await drafts.saveDraft(draft({ id, text: 'second' }));

    // A flush every time the tab is hidden must not grow the store.
    const list = await drafts.listDrafts();
    expect(list).toHaveLength(1);
    expect(list[0]?.text).toBe('second');
  });

  it('gives unrelated documents their own rows', async () => {
    // The regression this guards: sources are numbered per session, so the
    // document abandoned today and the one pasted tomorrow are both `memory-1`.
    // Keying on that would have the second silently overwrite the first's draft
    // — the exact data loss this store exists to prevent.
    const drafts = await freshModule();

    await drafts.saveDraft(draft({ name: 'Pasted document', text: 'yesterday' }));
    await drafts.saveDraft(draft({ name: 'Pasted document', text: 'today' }));

    // Order between two writes in the same millisecond is arbitrary; that they
    // are two rows at all is the point. Ordering is covered below.
    expect((await drafts.listDrafts()).map((entry) => entry.text).sort()).toEqual([
      'today',
      'yesterday',
    ]);
  });

  it('records drafts newest first', async () => {
    const drafts = await freshModule();

    vi.setSystemTime(new Date('2026-08-11T09:00:00Z'));
    await drafts.saveDraft(draft({ text: 'older' }));
    vi.setSystemTime(new Date('2026-08-11T10:00:00Z'));
    await drafts.saveDraft(draft({ text: 'newer' }));

    expect((await drafts.listDrafts()).map((entry) => entry.text)).toEqual(['newer', 'older']);
  });

  it('keeps a recovery net rather than an archive', async () => {
    const drafts = await freshModule();

    for (let index = 0; index < 14; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 11, 0, index)));
      await drafts.saveDraft(draft({ text: `draft-${index}` }));
    }

    const list = await drafts.listDrafts();
    expect(list).toHaveLength(8);
    expect(list[0]?.text).toBe('draft-13');
    expect(list.at(-1)?.text).toBe('draft-6');
  });

  it('lets go of drafts older than the storage they live in', async () => {
    const drafts = await freshModule();

    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
    await drafts.saveDraft(draft({ text: 'ancient' }));

    // Eight days on. Safari has evicted the origin by now anyway; keeping this
    // longer would hold text on Chromium in exchange for a promise WebKit
    // cannot keep.
    vi.setSystemTime(new Date('2026-08-09T00:01:00Z'));
    await drafts.saveDraft(draft({ text: 'current' }));

    expect((await drafts.listDrafts()).map((entry) => entry.text)).toEqual(['current']);
  });

  it('writes even when a stored handle cannot be compared', async () => {
    // A handle that has lost its methods used to throw on the first comparison
    // and abort the enclosing write, so one bad row would silently stop every
    // later flush — with the reader's unsaved work in it.
    const drafts = await freshModule();
    const handle = new FakeHandle('doc.md') as unknown as FileSystemFileHandle;

    await drafts.saveDraft(draft({ handle }));
    await expect(drafts.saveDraft(draft({ handle, text: 'later' }))).resolves.not.toBeNull();

    expect((await drafts.listDrafts()).some((entry) => entry.text === 'later')).toBe(true);
  });

  it('does not reject when storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const drafts = await freshModule();

    // A reader in a private window still gets a working editor, just without a
    // net — never an error on the way to their document.
    await expect(drafts.saveDraft(draft())).resolves.toBeNull();
    expect(await drafts.listDrafts()).toEqual([]);
  });
});

describe('discardDraft', () => {
  it('removes the row once the work is durable elsewhere', async () => {
    const drafts = await freshModule();

    const id = await drafts.saveDraft(draft());
    await drafts.discardDraft(id!);

    // Text that has been saved must not stay behind in storage.
    expect(await drafts.listDrafts()).toEqual([]);
  });

  it('ignores an id that is already gone', async () => {
    const drafts = await freshModule();
    await expect(drafts.discardDraft('never-existed')).resolves.toBeUndefined();
  });

  it('refuses a write that was in flight when the discard arrived', async () => {
    // The race this closes: a flush suspends mid-write, ⌘S lands and deletes the
    // draft, and the suspended write resumes to put it back — leaving the text
    // of a *saved* document in the one store that promises never to hold it.
    //
    // Asserted on the return value rather than on the store, because the store
    // ends up empty either way today: both calls await the same memoized
    // `getDB`, so the `put` is always issued before the `delete` and IndexedDB
    // commits them in that order. That safety is incidental — it rests on the
    // memoization, on `idb` issuing its request synchronously, and on microtask
    // registration order, and any one of those can change under a refactor with
    // no visible symptom. What the guard adds is the refusal itself, so pin
    // that: a write racing a discard must report that it kept nothing.
    const drafts = await freshModule();

    const id = await drafts.saveDraft(draft({ text: 'still being edited' }));
    const inFlight = drafts.saveDraft(draft({ id, text: 'the flush that was already going' }));

    await drafts.discardDraft(id!);

    expect(await inFlight).toBeNull();
    expect(await drafts.listDrafts()).toEqual([]);
  });

  it('ignores a flush that arrives after its draft was discarded', async () => {
    const drafts = await freshModule();

    const id = await drafts.saveDraft(draft({ text: 'first' }));
    await drafts.discardDraft(id!);
    await drafts.saveDraft(draft({ id, text: 'late' }));

    expect(await drafts.listDrafts()).toEqual([]);
  });

  it('still keeps a net for work edited again after a save', async () => {
    // The other half of retiring an id: it must not cost the reader the net for
    // the *next* edit. The store mints a fresh id once a document goes dirty
    // again, so a discarded id is never asked for twice.
    const drafts = await freshModule();

    const id = await drafts.saveDraft(draft({ text: 'saved and gone' }));
    await drafts.discardDraft(id!);

    await drafts.saveDraft(draft({ id: null, text: 'edited again afterwards' }));

    expect((await drafts.listDrafts()).map((entry) => entry.text)).toEqual([
      'edited again afterwards',
    ]);
  });
});

describe('clearing local data', () => {
  /**
   * "Clear local data" has to mean it, and a wipe is several awaits long.
   *
   * The failure it has to survive: a draft flush already suspended when the
   * reader presses the button, resuming afterwards and putting their text back
   * into the store they just emptied — the control appearing to work, and the
   * thing it promised to remove sitting there again a tick later.
   *
   * A barrier rather than retiring the id, because the document is very likely
   * still open and still dirty. Retiring would switch off crash protection for
   * the rest of its life without saying so, trading a visible failure for an
   * invisible one.
   */

  it('does not let a write already in flight repopulate the store', async () => {
    const { drafts, db } = await freshModules();
    await drafts.saveDraft(draft({ text: 'earlier' }));

    const inFlight = drafts.saveDraft(draft({ text: 'in flight when the wipe landed' }));
    await db.clearAll();

    // Asserted on the return value as well as the store: the refusal is the
    // mechanism, and it is what stays true if the ordering underneath changes.
    expect(await inFlight).toBeNull();
    expect(await drafts.listDrafts()).toEqual([]);
  });

  it('protects work typed after the wipe', async () => {
    const { drafts, db } = await freshModules();
    await db.clearAll();

    await drafts.saveDraft(draft({ text: 'typed after clearing' }));

    expect((await drafts.listDrafts()).map((entry) => entry.text)).toEqual([
      'typed after clearing',
    ]);
  });

  it('keeps protecting the document that was open when the wipe happened', async () => {
    // The property the barrier exists to preserve, and the reason it is not an
    // id retirement: clearing storage must not silently cost an open, dirty
    // document its net for the rest of the session. The same row is still
    // writable the moment there is something new to write.
    const { drafts, db } = await freshModules();

    const id = await drafts.saveDraft(draft({ text: 'mid-edit' }));
    await db.clearAll();

    await drafts.saveDraft(draft({ id, text: 'still editing afterwards' }));

    expect((await drafts.listDrafts()).map((entry) => entry.text)).toEqual([
      'still editing afterwards',
    ]);
  });
});
