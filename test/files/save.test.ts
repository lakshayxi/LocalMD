import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeText } from '@/core/text/encoding';
import { FileHandleSource } from '@/platform/files/fs-access';

/**
 * Saving back to a file, byte for byte.
 *
 * This is the test behind the promise that opening a document and saving it
 * unchanged produces an identical file. Getting it wrong does not throw or look
 * broken — it produces a diff where every line is marked changed because CRLF
 * became LF, which is precisely how a tool loses the trust of the git-using
 * developer this product is aimed at.
 *
 * The `write` path is exercised against a fake handle. The real File System
 * Access picker cannot be driven from a test, which is stated rather than
 * papered over: see the note in test/persistence/recents.test.ts.
 */

class FakeWritable {
  readonly chunks: string[] = [];
  aborted = false;
  closed = false;
  /** Set by the handle: closing is what commits, and committing moves the mtime. */
  onClose?: (written: string) => void;

  constructor(private readonly onWrite?: () => void) {}

  async write(chunk: string) {
    this.onWrite?.();
    this.chunks.push(chunk);
  }
  async close() {
    this.closed = true;
    this.onClose?.(this.chunks.join(''));
  }
  async abort() {
    this.aborted = true;
  }
}

class FakeHandle {
  readonly kind = 'file' as const;
  writable = new FakeWritable();
  permission: PermissionState = 'granted';
  requested = 0;
  /** Bumped by `changeOnDisk`, the way a real file's mtime moves. */
  lastModified = 1_000;
  /** Set to make the file unreachable, as a deleted or moved one would be. */
  missing = false;
  onPermissionRequest?: () => void;

  constructor(
    readonly name: string,
    private content = '',
  ) {}

  async getFile() {
    if (this.missing) throw new DOMException('not found', 'NotFoundError');
    return {
      size: this.content.length,
      lastModified: this.lastModified,
      text: async () => this.content,
    };
  }

  /** Somebody else wrote to this file: a formatter, a git checkout, another editor. */
  changeOnDisk(content: string, lastModified = this.lastModified + 5_000) {
    this.content = content;
    this.lastModified = lastModified;
  }

  async createWritable() {
    // A committed write moves the file's mtime and changes its contents, which
    // is the behaviour the conflict check is reading. A fake that held the mtime
    // still would make every save look conflict-free and quietly excuse the one
    // bug most worth catching: our own write being mistaken for someone else's.
    this.writable.onClose = (written) => {
      this.content = written;
      this.lastModified += 1_000;
    };
    return this.writable;
  }

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    this.requested += 1;
    this.onPermissionRequest?.();
    return this.permission;
  }

  /** What ended up on disk. */
  get written() {
    return this.writable.chunks.join('');
  }
}

function sourceFor(handle: FakeHandle) {
  return new FileHandleSource(handle as unknown as FileSystemFileHandle);
}

/** Open, then save without editing. The output must equal the input exactly. */
async function roundTrip(original: string) {
  const handle = new FakeHandle('doc.md', original);
  const source = sourceFor(handle);

  const contents = await source.read();
  await source.save(contents);

  return handle.written;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('round-trip fidelity', () => {
  it.each([
    ['LF throughout', 'one\ntwo\nthree\n'],
    ['CRLF throughout', 'one\r\ntwo\r\nthree\r\n'],
    ['a BOM with LF', '﻿one\ntwo\n'],
    ['a BOM with CRLF', '﻿one\r\ntwo\r\n'],
    ['no trailing newline', 'one\ntwo'],
    ['CRLF and no trailing newline', 'one\r\ntwo'],
    ['a single line', 'just one line'],
    ['an empty file', ''],
  ])('saves a file with %s unchanged', async (_label, original) => {
    expect(await roundTrip(original)).toBe(original);
  });

  it('applies the file’s own line ending to lines added while editing', async () => {
    const handle = new FakeHandle('doc.md', 'one\r\ntwo\r\n');
    const source = sourceFor(handle);
    const contents = await source.read();

    // The editor works in LF regardless of what the file uses; the boundary is
    // what puts CRLF back. Mixing the two would corrupt the file quietly.
    await source.save({ ...contents, text: `${contents.text}three\nfour\n` });

    expect(handle.written).toBe('one\r\ntwo\r\nthree\r\nfour\r\n');
  });

  it('does not add a trailing newline the file never had', async () => {
    // Silently editing the last byte of someone's file to satisfy a convention
    // is exactly the kind of thing that makes a tool untrustworthy.
    expect(await roundTrip('no newline at end')).toBe('no newline at end');
  });

  it('keeps a BOM out of the text the editor and parser see', async () => {
    const source = sourceFor(new FakeHandle('doc.md', '﻿heading\n'));
    const { text, shape } = await source.read();

    expect(text).toBe('heading\n');
    expect(shape.hadBom).toBe(true);
  });
});

describe('FileHandleSource.save', () => {
  it('reports itself as the source, so later saves go to the same file', async () => {
    const handle = new FakeHandle('doc.md', 'x\n');
    const source = sourceFor(handle);

    const outcome = await source.save(await source.read());

    expect(outcome).toEqual({ kind: 'saved', source });
  });

  it('closes the writable, which is what commits the swap file', async () => {
    const handle = new FakeHandle('doc.md', 'x\n');
    const source = sourceFor(handle);

    await source.save(await source.read());

    expect(handle.writable.closed).toBe(true);
    expect(handle.writable.aborted).toBe(false);
  });

  it('asks for write permission before writing', async () => {
    const handle = new FakeHandle('doc.md', 'x\n');
    handle.permission = 'prompt';
    const source = sourceFor(handle);

    await source.save(await source.read());

    // Read permission and write permission are separate grants, so opening a
    // file does not imply the right to overwrite it.
    expect(handle.requested).toBe(1);
  });

  it('treats a refused permission as cancelled, and writes nothing', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();
    handle.permission = 'denied';

    // A refusal is an answer, not a fault: it must not throw, and it must
    // leave the file exactly as it was.
    expect(await source.save(contents)).toEqual({ kind: 'cancelled' });
    expect(handle.written).toBe('');
  });

  it('abandons the swap file when the write fails', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    handle.writable = new FakeWritable(() => {
      throw new Error('disk full');
    });
    const source = sourceFor(handle);
    const contents = await source.read();
    contents.text = 'replacement\n';

    await expect(source.save(contents)).rejects.toThrow('disk full');

    // Closing a half-written writable would commit the truncation. Aborting is
    // what leaves the reader's original file intact.
    expect(handle.writable.aborted).toBe(true);
    expect(handle.writable.closed).toBe(false);
  });
});

describe('external changes', () => {
  /**
   * The guarantee: LocalMD never silently replaces a file that changed
   * underneath the reader.
   *
   * It lives in `save` rather than in the caller on purpose — every route to
   * overwriting someone's file goes through this one method, so a save path
   * added later cannot forget to ask. These tests are the whole of the
   * automated coverage for it: driving a real File System Access handle needs a
   * picker no test can operate, so the store wiring above it is verified by
   * hand on Chrome and Edge alongside the other handle checks.
   */

  it('refuses to write over a file that changed since it was read', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();

    handle.changeOnDisk('somebody else got here first\n');

    expect(await source.save({ ...contents, text: 'mine\n' })).toEqual({
      kind: 'conflict',
      lastModified: handle.lastModified,
    });
    // The refusal has to be total. A partial write would be worse than either
    // version surviving intact.
    expect(handle.written).toBe('');
  });

  it('treats an older timestamp as suspicious too', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();

    // Backwards is not benign: a restore from backup, a `git checkout` of an
    // older commit, a sync client writing a stale copy and a clock that stepped
    // back all land here, and every one of them means the bytes on disk are
    // something the reader has not seen.
    handle.changeOnDisk('an older version\n', 500);

    expect((await source.save(contents)).kind).toBe('conflict');
    expect(handle.written).toBe('');
  });

  it('treats a size change as suspicious even when the timestamp is retained', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();

    handle.changeOnDisk('a longer external version\n', 1_000);

    expect((await source.save(contents)).kind).toBe('conflict');
    expect(handle.written).toBe('');
  });

  it('does not prompt for write permission on a save it is going to refuse', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    handle.permission = 'prompt';
    const source = sourceFor(handle);
    const contents = await source.read();

    handle.changeOnDisk('theirs\n');
    await source.save(contents);

    // Answering a permission dialog for a write that was never going to happen
    // teaches the reader that the dialog does not mean anything.
    expect(handle.requested).toBe(0);
  });

  it('rechecks for changes made while write permission is being requested', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    handle.permission = 'prompt';
    const source = sourceFor(handle);
    const contents = await source.read();
    handle.onPermissionRequest = () => {
      handle.changeOnDisk('changed during the prompt\n');
      handle.permission = 'granted';
    };

    expect((await source.save(contents)).kind).toBe('conflict');
    expect(handle.requested).toBe(1);
    expect(handle.written).toBe('');
  });

  it('writes when the reader has said to overwrite', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();

    handle.changeOnDisk('theirs\n');

    expect((await source.save({ ...contents, text: 'mine\n' }, { overwrite: true })).kind).toBe(
      'saved',
    );
    expect(handle.written).toBe('mine\n');
  });

  it('adopts the file it just wrote as the new baseline', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();

    // Committing the write moves the mtime, as it does on a real filesystem.
    // Without re-stating the baseline afterwards our own save would look like
    // somebody else's edit, and the very next ⌘S would be refused — a conflict
    // banner about a change the reader had just made themselves.
    await source.save(contents);
    expect(handle.lastModified).not.toBe(1_000);

    expect((await source.save(contents)).kind).toBe('saved');
  });

  it('still saves a file that has no baseline to compare against', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);

    // Never read, so nothing is known about what was there. Refusing on missing
    // evidence rather than on contrary evidence would leave the reader unable to
    // save at all.
    expect((await source.save({ text: 'mine\n', shape: decodeText('x\n').shape })).kind).toBe(
      'saved',
    );
  });

  it('does not recreate a file that has been deleted underneath it', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();

    handle.missing = true;

    expect((await source.save(contents)).kind).toBe('conflict');
    expect(handle.written).toBe('');
  });

  it('only recreates a missing file after an explicit overwrite', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);
    const contents = await source.read();
    handle.missing = true;

    expect((await source.save(contents, { overwrite: true })).kind).toBe('saved');
    expect(handle.written).toBe('original\n');
  });

  it('adopts a baseline recorded elsewhere, for a recovered draft', async () => {
    const handle = new FakeHandle('doc.md', 'original\n');
    const source = sourceFor(handle);

    // What recovery does: the source is built from a stored handle and never
    // read, so the only baseline available is the one the draft carried. If it
    // were not adopted, the source would have nothing to compare and a restored
    // draft would overwrite a file that had moved on while it was gone.
    source.adoptBaseline(1_000);
    handle.changeOnDisk('changed while the draft was in storage\n');

    expect((await source.save({ text: 'recovered\n', shape: decodeText('x\n').shape })).kind).toBe(
      'conflict',
    );
    expect(handle.written).toBe('');
  });
});

describe('decode/encode agreement', () => {
  it('the shape recorded on read is the shape restored on save', async () => {
    // Guards the seam directly: if `decodeText` ever learns a new property that
    // `encodeText` does not restore, this fails rather than silently degrading.
    const original = '﻿alpha\r\nbeta\r\n';
    const { shape } = decodeText(original);

    expect(shape).toEqual({ hadBom: true, lineEnding: 'crlf', hadTrailingNewline: true });
    expect(await roundTrip(original)).toBe(original);
  });
});
