import { decodeText } from '@/core/text/encoding';
import type { DocumentContents, DocumentSource, SourceKind } from './types';
import { UnsupportedFileError } from './types';
import { isAcceptedFilename } from './sources';

/**
 * File System Access API support.
 *
 * In M1 opening deliberately used `<input type="file">` everywhere, on the
 * reasoning that FSA only buys write-back and that arrives in M4. That was
 * wrong in one respect: a handle is also what makes a recent document
 * *reopenable*. Without it, "recent documents" is a list you cannot click, and
 * recents are the feature that turns this from a one-shot tool into a habit.
 *
 * So opening upgrades to FSA where it exists. The rest of the app still only
 * reads `canSaveInPlace`; nothing above this layer branches on which API ran.
 */

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * A file opened with a retained handle.
 *
 * `canSaveInPlace` is already true here even though saving lands in M4 — the
 * capability is a property of the handle, not of whether we have written the
 * save path yet. M4 adds `save()`; this does not change.
 */
export class FileHandleSource implements DocumentSource {
  readonly id: string;
  readonly kind: SourceKind = 'fs-handle';
  readonly canSaveInPlace = true;

  private cachedSize: number | null = null;

  constructor(
    readonly handle: FileSystemFileHandle,
    id?: string,
  ) {
    this.id = id ?? `fs-${crypto.randomUUID()}`;
  }

  get name(): string {
    return this.handle.name;
  }

  get size(): number | null {
    return this.cachedSize;
  }

  async read(): Promise<DocumentContents> {
    const file = await this.handle.getFile();
    this.cachedSize = file.size;
    return decodeText(await file.text());
  }

  /**
   * Modification time and size, for the external-change detection M4 needs.
   * Reading it costs a `getFile()` call, so it is separate from `read`.
   */
  async getFileMeta(): Promise<{ lastModified: number; size: number } | null> {
    try {
      const file = await this.handle.getFile();
      return { lastModified: file.lastModified, size: file.size };
    } catch {
      return null;
    }
  }
}

const PICKER_OPTIONS: OpenFilePickerOptions = {
  multiple: false,
  types: [
    {
      description: 'Markdown',
      accept: {
        'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
        'text/plain': ['.txt'],
      },
    },
  ],
};

/**
 * Opens the native picker. Resolves null when the reader cancels.
 *
 * Cancellation arrives as an AbortError rather than a return value, and it is
 * not an error condition — it is someone changing their mind.
 */
export async function pickFileWithHandle(): Promise<FileHandleSource | null> {
  try {
    if (!window.showOpenFilePicker) return null;
    const [handle] = await window.showOpenFilePicker(PICKER_OPTIONS);
    if (!handle) return null;

    if (!isAcceptedFilename(handle.name)) {
      throw new UnsupportedFileError(
        handle.name,
        `LocalMD opens Markdown and text files. "${handle.name}" is not one.`,
      );
    }

    return new FileHandleSource(handle);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}
