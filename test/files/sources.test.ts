import { describe, expect, it } from 'vitest';
import {
  BlobFileSource,
  createEmptyDocument,
  createPastedDocument,
  isAcceptedFilename,
  UnsupportedFileError,
} from '@/platform/files';

function fileOf(name: string, contents = '# Hi\n'): File {
  return new File([contents], name, { type: 'text/markdown' });
}

describe('isAcceptedFilename', () => {
  it.each(['README.md', 'notes.markdown', 'a.mdown', 'b.mkd', 'c.txt', 'AGENTS.MD'])(
    'accepts %s',
    (name) => {
      expect(isAcceptedFilename(name)).toBe(true);
    },
  );

  it('accepts .mdx, which opens as plain markdown and is never evaluated', () => {
    expect(isAcceptedFilename('page.mdx')).toBe(true);
  });

  it.each(['image.png', 'script.js', 'archive.zip', 'noextension'])('rejects %s', (name) => {
    expect(isAcceptedFilename(name)).toBe(false);
  });
});

describe('BlobFileSource', () => {
  it('exposes name and size and cannot save in place', () => {
    const source = new BlobFileSource(fileOf('README.md', 'hello'));

    expect(source.name).toBe('README.md');
    expect(source.size).toBe(5);
    // No File System Access handle means saving becomes a download in M4.
    expect(source.canSaveInPlace).toBe(false);
  });

  it('decodes contents on read', async () => {
    const source = new BlobFileSource(fileOf('a.md', 'a\r\nb'));
    const { text, shape } = await source.read();

    expect(text).toBe('a\nb');
    expect(shape.lineEnding).toBe('crlf');
  });

  it('rejects unsupported file types with a usable message', () => {
    expect(() => new BlobFileSource(fileOf('photo.png'))).toThrow(UnsupportedFileError);
    expect(() => new BlobFileSource(fileOf('photo.png'))).toThrow(/photo\.png/);
  });

  it('gives each source a distinct id', () => {
    const a = new BlobFileSource(fileOf('a.md'));
    const b = new BlobFileSource(fileOf('b.md'));

    expect(a.id).not.toBe(b.id);
  });
});

describe('memory sources', () => {
  it('creates a pasted document', async () => {
    const source = createPastedDocument('# From an LLM\n');

    expect(source.kind).toBe('pasted');
    expect(source.size).toBeNull();
    expect((await source.read()).text).toBe('# From an LLM\n');
  });

  it('creates an empty document', async () => {
    const source = createEmptyDocument();

    expect(source.kind).toBe('new');
    expect(source.name).toBe('Untitled.md');
    expect((await source.read()).text).toBe('');
  });
});
