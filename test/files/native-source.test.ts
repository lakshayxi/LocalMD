import { describe, expect, it } from 'vitest';

import {
  NativeFileSource,
  NativeMemorySource,
  type NativeDocumentDescriptor,
  type NativeFileBridge,
  type NativeRead,
  type NativeSaveResult,
} from '@/desktop/native-files';

class FakeNativeBridge implements NativeFileBridge {
  readonly descriptor: NativeDocumentDescriptor = {
    id: 'opaque-document-token',
    name: 'document.md',
    size: 0,
    lastModified: 1_000,
  };
  text: string;
  lastWrite: string | null = null;
  lastOverwrite = false;
  conflict = false;
  cancelSaveAs = false;
  closed: string[] = [];

  constructor(text: string) {
    this.text = text;
    this.descriptor.size = text.length;
  }

  async openDocument(): Promise<NativeDocumentDescriptor> {
    return { ...this.descriptor };
  }

  async readDocument(): Promise<NativeRead> {
    return { document: { ...this.descriptor }, text: this.text };
  }

  async statDocument(): Promise<NativeDocumentDescriptor> {
    return { ...this.descriptor };
  }

  async saveDocument(
    _documentId: string,
    encodedText: string,
    overwrite: boolean,
  ): Promise<NativeSaveResult> {
    this.lastOverwrite = overwrite;
    if (this.conflict && !overwrite) {
      return { kind: 'conflict', lastModified: 2_000 };
    }
    this.lastWrite = encodedText;
    this.text = encodedText;
    this.descriptor.size = encodedText.length;
    this.descriptor.lastModified += 1_000;
    return { kind: 'saved', document: { ...this.descriptor } };
  }

  async saveDocumentAs(
    encodedText: string,
    suggestedName: string,
  ): Promise<NativeSaveResult> {
    if (this.cancelSaveAs) return { kind: 'cancelled' };
    this.lastWrite = encodedText;
    return {
      kind: 'saved',
      document: {
        id: 'new-opaque-token',
        name: suggestedName,
        size: encodedText.length,
        lastModified: 3_000,
      },
    };
  }

  async closeDocument(documentId: string): Promise<void> {
    this.closed.push(documentId);
  }
}

function sourceFor(bridge: FakeNativeBridge): NativeFileSource {
  return new NativeFileSource({ ...bridge.descriptor }, bridge);
}

describe('NativeFileSource fidelity', () => {
  it.each([
    ['LF throughout', 'one\ntwo\n'],
    ['CRLF throughout', 'one\r\ntwo\r\n'],
    ['BOM with LF', '\ufeffone\ntwo\n'],
    ['BOM with CRLF', '\ufeffone\r\ntwo\r\n'],
    ['no final newline', 'one\ntwo'],
    ['CRLF without final newline', 'one\r\ntwo'],
    ['single line', 'one'],
    ['empty', ''],
  ])('round-trips %s', async (_label, original) => {
    const bridge = new FakeNativeBridge(original);
    const source = sourceFor(bridge);

    await source.save(await source.read());

    expect(bridge.lastWrite).toBe(original);
  });

  it('normalizes text for editing and applies CRLF to new lines on save', async () => {
    const bridge = new FakeNativeBridge('\ufeffone\r\ntwo\r\n');
    const source = sourceFor(bridge);
    const contents = await source.read();

    expect(contents).toEqual({
      text: 'one\ntwo\n',
      shape: { hadBom: true, lineEnding: 'crlf', hadTrailingNewline: true },
    });

    await source.save({ ...contents, text: `${contents.text}three\n` });
    expect(bridge.lastWrite).toBe('\ufeffone\r\ntwo\r\nthree\r\n');
  });
});

describe('NativeFileSource ownership and conflicts', () => {
  it('returns a conflict without writing', async () => {
    const bridge = new FakeNativeBridge('original\n');
    const source = sourceFor(bridge);
    const contents = await source.read();
    bridge.conflict = true;

    expect(await source.save({ ...contents, text: 'mine\n' })).toEqual({
      kind: 'conflict',
      lastModified: 2_000,
    });
    expect(bridge.lastWrite).toBeNull();
  });

  it('only overwrites after an explicit request', async () => {
    const bridge = new FakeNativeBridge('original\n');
    const source = sourceFor(bridge);
    const contents = await source.read();
    bridge.conflict = true;

    expect((await source.save(contents, { overwrite: true })).kind).toBe('saved');
    expect(bridge.lastOverwrite).toBe(true);
  });

  it('updates its baseline after a successful save', async () => {
    const bridge = new FakeNativeBridge('original\n');
    const source = sourceFor(bridge);
    const contents = await source.read();

    await source.save(contents);

    expect(source.lastModified).toBe(2_000);
    expect(source.size).toBe('original\n'.length);
  });

  it('Save As adopts a new source and cancellation keeps the old identity', async () => {
    const bridge = new FakeNativeBridge('original\n');
    const source = sourceFor(bridge);
    const contents = await source.read();
    const saved = await source.saveAs(contents, 'copy.md');

    expect(saved.kind).toBe('saved');
    if (saved.kind !== 'saved') return;
    expect(saved.source).not.toBe(source);
    expect(saved.source.name).toBe('copy.md');

    bridge.cancelSaveAs = true;
    expect(await source.saveAs(contents)).toEqual({ kind: 'cancelled' });
    expect(source.name).toBe('document.md');
  });

  it('reopens the same native token with a fresh editor identity', async () => {
    const bridge = new FakeNativeBridge('original\n');
    const source = sourceFor(bridge);
    const reopened = source.reopen();

    expect(reopened.id).not.toBe(source.id);
    expect(await reopened.read()).toEqual(await source.read());
  });

  it('releases its opaque native token when disposed', async () => {
    const bridge = new FakeNativeBridge('original\n');
    const source = sourceFor(bridge);

    await source.dispose();

    expect(bridge.closed).toEqual(['opaque-document-token']);
  });

  it('an untitled desktop document uses the native Save As path', async () => {
    const bridge = new FakeNativeBridge('');
    const source = new NativeMemorySource(
      'Untitled.md',
      {
        text: '',
        shape: { hadBom: false, lineEnding: 'lf', hadTrailingNewline: false },
      },
      bridge,
    );
    const contents = await source.read();
    const outcome = await source.save({ ...contents, text: '# New\n' });

    expect(bridge.lastWrite).toBe('# New\n');
    expect(outcome.kind).toBe('saved');
  });

  it('preserves a recovered draft\'s original text shape', async () => {
    const bridge = new FakeNativeBridge('');
    const source = new NativeMemorySource(
      'Recovered.md',
      {
        text: 'recovered\n',
        shape: { hadBom: true, lineEnding: 'crlf', hadTrailingNewline: true },
      },
      bridge,
    );

    await source.save(await source.read());

    expect(bridge.lastWrite).toBe('\ufeffrecovered\r\n');
  });
});
