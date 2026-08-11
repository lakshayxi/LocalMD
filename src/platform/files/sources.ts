import { decodeText } from '@/core/text/encoding';
import type { DocumentContents, DocumentSource, SourceKind } from './types';
import { UnsupportedFileError } from './types';

/**
 * Extensions LocalMD will open. `.mdx` is accepted but treated as plain
 * Markdown — its JSX is never evaluated, and never will be. That is a permanent
 * non-goal, not a missing feature.
 */
const ACCEPTED_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx', '.txt'];

/** Above this, rendering is slow enough to be worth warning about first. */
export const LARGE_FILE_BYTES = 2 * 1024 * 1024;

export function isAcceptedFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * A file chosen through drag-drop or the file picker.
 *
 * Read-only: without a File System Access handle there is no way back to the
 * original path, so M4's save becomes a download. The distinction is invisible
 * above this layer apart from `canSaveInPlace`.
 */
export class BlobFileSource implements DocumentSource {
  readonly id = nextId('blob');
  readonly kind: SourceKind = 'picked-file';
  readonly canSaveInPlace = false;

  constructor(private readonly file: File) {
    if (!isAcceptedFilename(file.name)) {
      throw new UnsupportedFileError(
        file.name,
        `LocalMD opens Markdown and text files. "${file.name}" is not one.`,
      );
    }
  }

  get name(): string {
    return this.file.name;
  }

  get size(): number {
    return this.file.size;
  }

  async read(): Promise<DocumentContents> {
    // FileReader would work too, but File.text() is a promise already and
    // decodes as UTF-8, which is the only encoding worth supporting here.
    return decodeText(await this.file.text());
  }
}

/**
 * Markdown that never came from a file — pasted from an LLM chat window, or a
 * blank document. The single most common path for the AI-workflow reader, so it
 * is a first-class source rather than a fallback.
 */
export class MemorySource implements DocumentSource {
  readonly id = nextId('memory');
  readonly canSaveInPlace = false;
  readonly size = null;

  constructor(
    readonly name: string,
    private readonly text: string,
    readonly kind: SourceKind = 'pasted',
  ) {}

  async read(): Promise<DocumentContents> {
    return decodeText(this.text);
  }
}

export function createPastedDocument(text: string): MemorySource {
  return new MemorySource('Pasted document', text, 'pasted');
}

export function createEmptyDocument(): MemorySource {
  return new MemorySource('Untitled.md', '', 'new');
}

/**
 * Builds a source from a drop or picker result.
 *
 * Directories arrive as entries with no type and a size that varies by
 * platform; opening a folder is a v1.1 feature, so they are rejected clearly
 * rather than producing a confusing parse failure.
 */
export function createSourceFromFile(file: File): BlobFileSource {
  return new BlobFileSource(file);
}
