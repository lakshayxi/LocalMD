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

  constructor(private readonly onWrite?: () => void) {}

  async write(chunk: string) {
    this.onWrite?.();
    this.chunks.push(chunk);
  }
  async close() {
    this.closed = true;
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

  constructor(
    readonly name: string,
    private readonly content = '',
  ) {}

  async getFile() {
    return {
      size: this.content.length,
      lastModified: 0,
      text: async () => this.content,
    };
  }

  async createWritable() {
    return this.writable;
  }

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    this.requested += 1;
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
