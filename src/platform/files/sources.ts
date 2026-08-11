import { decodeText, encodeText } from '@/core/text/encoding';
import { downloadText } from './download';
import { saveWithPicker, supportsFileSystemAccess } from './fs-access';
import type { DocumentContents, DocumentSource, SaveOutcome, SourceKind } from './types';
import { UnsupportedFileError } from './types';

/**
 * Saving for sources with no way back to an original file.
 *
 * Shared by the picked-file and in-memory sources because their situation is
 * identical: there is no handle, so every save is a new file. Where the File
 * System Access API exists the reader still gets to choose where it goes —
 * having opened by drag-drop should not cost you the save dialog — and
 * everywhere else it becomes a download.
 */
async function saveAsNewFile(
  contents: DocumentContents,
  suggestedName: string,
): Promise<SaveOutcome> {
  const encoded = encodeText(contents.text, contents.shape);
  const filename = withExtension(suggestedName);

  if (supportsFileSystemAccess()) {
    return saveWithPicker(encoded, filename);
  }

  downloadText(filename, encoded);
  return { kind: 'downloaded', name: filename };
}

/**
 * A pasted document is displayed as "Pasted document", which is the right thing
 * to read in the header and the wrong thing to write to disk — it would land as
 * an extensionless file that the reader's own machine no longer recognises as
 * Markdown.
 */
function withExtension(name: string): string {
  return isAcceptedFilename(name) ? name : `${name}.md`;
}

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

  /**
   * A dropped or picked file cannot be written back to — the browser gave us
   * its bytes, not its location — so Save and Save As are the same operation.
   * The reader still chooses the destination wherever the picker exists.
   */
  save(contents: DocumentContents): Promise<SaveOutcome> {
    return saveAsNewFile(contents, this.name);
  }

  saveAs(contents: DocumentContents, suggestedName?: string): Promise<SaveOutcome> {
    return saveAsNewFile(contents, suggestedName ?? this.name);
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

  save(contents: DocumentContents): Promise<SaveOutcome> {
    return saveAsNewFile(contents, this.name);
  }

  saveAs(contents: DocumentContents, suggestedName?: string): Promise<SaveOutcome> {
    return saveAsNewFile(contents, suggestedName ?? this.name);
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
