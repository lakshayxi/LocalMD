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
 * A document's origin, abstracted so nothing above this layer knows whether the
 * File System Access API is available.
 *
 * The UI reads `canSaveInPlace` to decide whether its button says Save or
 * Download. That is the only branch the rest of the app is allowed to make:
 * the File System Access API is Chromium-only, so roughly a third of desktop
 * users will never have it, and the download path has to be a first-class
 * route rather than an apology.
 *
 * Saving lands in M4 along with the FSA adapter. M1 only needs to open things.
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
