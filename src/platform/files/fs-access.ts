import { decodeText, encodeText } from '@/core/text/encoding';
import type {
  DocumentContents,
  DocumentSource,
  FileBackedDocumentSource,
  SaveOptions,
  SaveOutcome,
  SourceKind,
} from './types';
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
export class FileHandleSource implements FileBackedDocumentSource {
  readonly id: string;
  readonly kind = 'fs-handle' as const satisfies SourceKind;
  readonly canSaveInPlace = true;

  private cachedSize: number | null = null;
  private cachedModified: number | null = null;

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

  /**
   * The file's mtime as of the last read or write, or null before either.
   *
   * This is the version of the file everything in the session is working from,
   * so it is what a draft records and what external-change detection compares
   * against. Cached rather than fetched, because the callers that need it are on
   * teardown paths where there is no time left to stat a file.
   */
  get lastModified(): number | null {
    return this.cachedModified;
  }

  async read(): Promise<DocumentContents> {
    const file = await this.handle.getFile();
    this.cachedSize = file.size;
    this.cachedModified = file.lastModified;
    return decodeText(await file.text());
  }

  reopen(): FileHandleSource {
    return new FileHandleSource(this.handle);
  }

  /**
   * Writes back to the file the reader opened.
   *
   * The one place the product's core loop is genuinely better than a download:
   * ⌘S puts the bytes back where they came from, with the line endings and BOM
   * they arrived with. A permission refusal is reported as `cancelled` rather
   * than thrown — the reader said no, which is an answer, not a fault.
   *
   * **Refuses if the file no longer matches what was read.** The check lives
   * here rather than in the caller so that no save path can be written that
   * forgets it: every route to overwriting a user's file goes through this
   * method, and the only way past the check is an `overwrite` the reader asked
   * for. Any mtime difference counts, not just a newer one — see the note on
   * `lastModified`.
   */
  async save(contents: DocumentContents, options: SaveOptions = {}): Promise<SaveOutcome> {
    // Before the permission prompt, not after: a save that is about to be
    // refused should not first make the reader answer a dialog for it.
    if (!options.overwrite) {
      // Stat'd here and now. A reading taken when the window regained focus is
      // already history by the time ⌘S arrives, and the gap between them is
      // exactly long enough for a `git checkout` to land in.
      const conflict = this.conflictWith(await this.getFileMeta());
      if (conflict) return conflict;
    }

    if (!(await ensureWritePermission(this.handle))) return { kind: 'cancelled' };

    // A permission prompt can leave the application suspended for an arbitrary
    // amount of time. Recheck after it returns, immediately before opening the
    // writable, so an edit made while the dialog was open cannot slip through a
    // preflight that was true only before the prompt.
    if (!options.overwrite) {
      const conflict = this.conflictWith(await this.getFileMeta());
      if (conflict) return conflict;
    }

    await writeToHandle(this.handle, encodeText(contents.text, contents.shape));

    // The file on disk is now a version we have never stat'd. Re-reading its
    // metadata keeps `size` right in recents, moves the baseline a later draft
    // branches from onto the copy we just wrote, and — since this is also the
    // baseline the conflict check reads — stops our own write being mistaken
    // for somebody else's the next time ⌘S is pressed.
    await this.refreshMeta();

    return { kind: 'saved', source: this };
  }

  /** Re-stats the file, adopting what is on disk as the current baseline. */
  async refreshMeta(): Promise<void> {
    const meta = await this.getFileMeta();
    this.cachedSize = meta?.size ?? null;
    this.cachedModified = meta?.lastModified ?? null;
  }

  /**
   * Adopts a baseline recorded somewhere else.
   *
   * For recovery: a draft carries the mtime of the file it branched from, and a
   * document restored from one has to be compared against *that*, not against
   * whatever is on disk at the moment it is restored. Without this the source
   * would arrive with no baseline at all, the conflict check would have nothing
   * to compare, and ⌘S would silently overwrite a file that had moved on since
   * the draft was written — which is precisely the hole recovery left open.
   */
  adoptBaseline(lastModified: number | null): void {
    this.cachedModified = lastModified;
  }

  saveAs(contents: DocumentContents, suggestedName?: string): Promise<SaveOutcome> {
    return saveWithPicker(
      encodeText(contents.text, contents.shape),
      suggestedName ?? this.handle.name,
    );
  }

  /**
   * What the file looks like on disk *right now*.
   *
   * Always a fresh `getFile()`, never the cached baseline — the whole point of
   * every caller is to find out whether the two still agree. Returns null when
   * the file cannot be reached at all, which is a different problem from having
   * changed and is left to the caller to interpret.
   */
  async getFileMeta(): Promise<{ lastModified: number; size: number } | null> {
    try {
      const file = await this.handle.getFile();
      return { lastModified: file.lastModified, size: file.size };
    } catch {
      return null;
    }
  }

  /**
   * Compares every baseline field the browser exposes cheaply and reliably.
   *
   * A timestamp alone is not enough: filesystems and sync tools can retain an
   * mtime while replacing content. Size catches that common case without adding
   * document bytes to the shared metadata interface. If the original handle can
   * no longer be stat'd, ordinary Save refuses rather than recreating a deleted
   * or moved file. Explicit overwrite remains the only path that can do that.
   */
  private conflictWith(current: { lastModified: number; size: number } | null): SaveOutcome | null {
    if (!current) {
      return { kind: 'conflict', lastModified: this.cachedModified ?? 0 };
    }

    const modifiedChanged =
      this.cachedModified !== null && current.lastModified !== this.cachedModified;
    const sizeChanged = this.cachedSize !== null && current.size !== this.cachedSize;

    return modifiedChanged || sizeChanged
      ? { kind: 'conflict', lastModified: current.lastModified }
      : null;
  }
}

export function isFileHandleSource(source: DocumentSource | null): source is FileHandleSource {
  return source?.kind === 'fs-handle';
}

/**
 * Ensures we may write to a handle, prompting if the grant has lapsed.
 *
 * Read permission and write permission are separate grants. A handle restored
 * from recents may be readable and not writable, so this must run before every
 * in-place save rather than once at open — and it must be reached from a click,
 * because the request needs a user activation.
 */
async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const query = handle.queryPermission?.bind(handle);
  const request = handle.requestPermission?.bind(handle);
  // No permissions API means nothing to ask for; `createWritable` will throw on
  // its own if the write is genuinely disallowed.
  if (!query || !request) return true;

  const options = { mode: 'readwrite' } as const;
  if ((await query(options)) === 'granted') return true;

  try {
    return (await request(options)) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Writes to a handle.
 *
 * `createWritable` opens a swap file and `close` atomically moves it into
 * place, so a failure part-way through leaves the reader's original intact
 * rather than truncated. That is the entire reason for the ceremony.
 */
async function writeToHandle(handle: FileSystemFileHandle, encoded: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(encoded);
  } catch (error) {
    // Abandon the swap file rather than leaving it behind; `close` on a failed
    // write would commit whatever did land.
    await writable.abort?.();
    throw error;
  }
  await writable.close();
}

const SAVE_PICKER_TYPES = [
  {
    description: 'Markdown',
    accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.txt'] },
  },
];

/**
 * Save As. Resolves `cancelled` when the reader dismisses the dialog, which is
 * a decision rather than a failure and must leave the document untouched.
 */
export async function saveWithPicker(
  encoded: string,
  suggestedName: string,
): Promise<SaveOutcome> {
  try {
    if (!window.showSaveFilePicker) return { kind: 'cancelled' };

    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: SAVE_PICKER_TYPES,
    });

    await writeToHandle(handle, encoded);

    // The document now belongs to the new file: subsequent saves write here.
    // Stat it before handing it back, so the new source starts with a baseline.
    // Without one the conflict check has nothing to compare and every document
    // that arrived through Save As would be exempt from it — the quiet kind of
    // gap where a guarantee holds everywhere except the path nobody tested.
    const source = new FileHandleSource(handle);
    await source.refreshMeta();

    return { kind: 'saved', source };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    throw error;
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
