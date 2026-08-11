import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ensureReadPermission } from '@/platform/persistence/recents';

/**
 * The recents store.
 *
 * **Known gap, stated rather than papered over.** A real
 * `FileSystemFileHandle` survives IndexedDB because the browser serializes it
 * as a platform object; a stand-in cannot, so a handle written here comes back
 * as plain data with its methods gone. That makes `isSameEntry` deduplication —
 * "the same file opened twice is one row" — unreachable from Node, and it is
 * verified by hand on Chrome and Edge alongside the save-in-place check on the
 * release checklist.
 *
 * What that leaves testable is everything else, including the property the lost
 * methods used to threaten: recording must not break when a stored handle
 * cannot be compared.
 */

class FakeHandle implements Pick<FileSystemFileHandle, 'name' | 'kind'> {
  readonly kind = 'file' as const;
  constructor(readonly name: string) {}
  async isSameEntry(other: FileSystemFileHandle) {
    return other.name === this.name;
  }
}

function handle(name: string): FileSystemFileHandle {
  return new FakeHandle(name) as unknown as FileSystemFileHandle;
}

beforeEach(async () => {
  // A fresh factory per test. The module under test memoizes its database
  // promise, so the module registry has to be reset alongside it.
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Re-imports against the current factory, since `getDB` caches its promise. */
async function freshModule() {
  return import('@/platform/persistence/recents');
}

describe('listRecents', () => {
  it('is empty before anything is opened', async () => {
    const recents = await freshModule();
    expect(await recents.listRecents()).toEqual([]);
  });

  it('returns the most recently opened first', async () => {
    const recents = await freshModule();

    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'));
    await recents.recordRecent(handle('first.md'), 100);
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    await recents.recordRecent(handle('second.md'), 200);
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
    await recents.recordRecent(handle('third.md'), 300);

    const list = await recents.listRecents();
    expect(list.map((entry) => entry.name)).toEqual(['third.md', 'second.md', 'first.md']);

    vi.useRealTimers();
  });

  it('records the name and size but never any content', async () => {
    const recents = await freshModule();
    await recents.recordRecent(handle('notes.md'), 4096);

    const [entry] = await recents.listRecents();
    expect(entry).toMatchObject({ name: 'notes.md', size: 4096 });

    // The store's central rule, asserted as an exact shape rather than the
    // absence of one field. A preview snippet is the single most tempting
    // addition — it makes a recents list look much better — and it would put
    // the contents of every document ever opened into browser storage
    // indefinitely. Adding a key here should require saying so out loud.
    expect(Object.keys(entry!).sort()).toEqual(['handle', 'id', 'lastOpened', 'name', 'size']);
  });
});

describe('recordRecent', () => {
  it('keeps the list to a usable length, dropping the oldest', async () => {
    const recents = await freshModule();

    for (let index = 0; index < 20; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, index)));
      await recents.recordRecent(handle(`doc-${index}.md`), index);
    }

    const list = await recents.listRecents();
    expect(list).toHaveLength(12);
    expect(list[0]?.name).toBe('doc-19.md');
    expect(list.at(-1)?.name).toBe('doc-8.md');

    vi.useRealTimers();
  });

  it('keeps recording after a stored handle becomes uncomparable', async () => {
    // The regression this guards: one entry whose `isSameEntry` throws used to
    // abort the enclosing write, so a single bad row silently stopped every
    // future document from being recorded.
    const recents = await freshModule();
    await recents.recordRecent(handle('older.md'), 1);

    await expect(recents.recordRecent(handle('newer.md'), 2)).resolves.toBeUndefined();

    const list = await recents.listRecents();
    expect(list.map((entry) => entry.name)).toContain('newer.md');
  });

  it('does not reject when storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const recents = await freshModule();

    // A reader in a private window still gets a working app, just without
    // memory — never an error on the way to their document.
    await expect(recents.recordRecent(handle('doc.md'), 1)).resolves.toBeUndefined();
    expect(await recents.listRecents()).toEqual([]);
  });
});

describe('forgetRecent', () => {
  it('removes the entry', async () => {
    const recents = await freshModule();
    await recents.recordRecent(handle('doc.md'), 1);

    const [entry] = await recents.listRecents();
    await recents.forgetRecent(entry!.id);

    expect(await recents.listRecents()).toEqual([]);
  });

  it('ignores an id that is already gone', async () => {
    const recents = await freshModule();
    await expect(recents.forgetRecent('never-existed')).resolves.toBeUndefined();
  });
});

describe('ensureReadPermission', () => {
  const options = { mode: 'read' };

  it('reports unsupported where the API is absent', async () => {
    // Safari and Firefox. The caller must not present this as a denial — there
    // was never anything to grant.
    expect(await ensureReadPermission(handle('doc.md'))).toBe('unsupported');
  });

  it('does not prompt when permission is still held', async () => {
    const request = vi.fn();
    const stored = Object.assign(handle('doc.md'), {
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: request,
    });

    expect(await ensureReadPermission(stored)).toBe('granted');
    expect(request).not.toHaveBeenCalled();
  });

  it('prompts when permission has lapsed', async () => {
    const stored = Object.assign(handle('doc.md'), {
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });

    expect(await ensureReadPermission(stored)).toBe('granted');
    expect(stored.requestPermission).toHaveBeenCalledWith(options);
  });

  it('reports a refusal as denied', async () => {
    const stored = Object.assign(handle('doc.md'), {
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    expect(await ensureReadPermission(stored)).toBe('denied');
  });

  it('reports a throwing request as denied', async () => {
    // Chromium throws rather than resolving when the request is made without a
    // user activation. That is a denial from the reader's point of view, and it
    // must not surface as an unhandled rejection.
    const stored = Object.assign(handle('doc.md'), {
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockRejectedValue(new Error('user activation required')),
    });

    expect(await ensureReadPermission(stored)).toBe('denied');
  });
});
