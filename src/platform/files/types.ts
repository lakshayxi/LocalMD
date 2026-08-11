import type { TextShape } from '@/core/text/encoding';

/**
 * How a document got here. Determines what saving can do, and nothing else —
 * the rest of the app reads `canSaveInPlace` rather than switching on this.
 */
export type SourceKind = 'fs-handle' | 'picked-file' | 'pasted' | 'new';

export interface DocumentContents {
  /** Normalized to LF, BOM stripped. */
  text: string;
  /** Original encoding, so saving can restore it byte-for-byte. */
  shape: TextShape;
}

/**
 * What a save did.
 *
 * `saved` can carry a *different* source than the one that was asked: Save As
 * through the File System Access API hands back a handle to the new file, and
 * from that moment on ⌘S must write there rather than to the original. Making
 * that a return value keeps the swap explicit at the call site instead of
 * mutating a source under the caller.
 *
 * Cancelling is not an error. It is someone changing their mind in a file
 * dialog, and it must leave the document exactly as it was — still dirty,
 * still pointing at the same file.
 */
export type SaveOutcome =
  | { kind: 'saved'; source: DocumentSource }
  /** Carries the name actually written, which is not always the display name. */
  | { kind: 'downloaded'; name: string }
  | { kind: 'cancelled' };

/**
 * A document's origin, abstracted so nothing above this layer knows whether the
 * File System Access API is available.
 *
 * The UI reads `canSaveInPlace` to decide whether its button says Save or
 * Download. That is the only branch the rest of the app is allowed to make:
 * the File System Access API is Chromium-only, so roughly a third of desktop
 * users will never have it, and the download path has to be a first-class
 * route rather than an apology.
 */
export interface DocumentSource {
  /** Stable within a session; used to key drafts and recents. */
  readonly id: string;
  readonly name: string;
  readonly kind: SourceKind;
  /** Whether `save` can write back to the original file. */
  readonly canSaveInPlace: boolean;
  /** Bytes, when known. Null for pasted and new documents. */
  readonly size: number | null;

  read(): Promise<DocumentContents>;

  /**
   * Writes back to the original file where that is possible, and downloads a
   * copy where it is not.
   *
   * Takes the whole `DocumentContents`, not just the text, because the shape —
   * BOM and line endings — is a property of the *document*, not of the source.
   * Passing it explicitly is what makes a save byte-identical to the file that
   * was opened, and keeps that guarantee visible rather than hidden in state
   * cached at read time.
   */
  save(contents: DocumentContents): Promise<SaveOutcome>;

  /** Always asks where to put it, and never overwrites the original. */
  saveAs(contents: DocumentContents, suggestedName?: string): Promise<SaveOutcome>;
}

export class UnsupportedFileError extends Error {
  constructor(
    readonly filename: string,
    message: string,
  ) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}
