import { invoke, isTauri } from '@tauri-apps/api/core';

import { decodeText, encodeText } from '@/core/text/encoding';
import type {
  DocumentContents,
  DocumentSource,
  FileBackedDocumentSource,
  FileMetadata,
  SaveOptions,
  SaveOutcome,
} from '@/platform/files';
import { createEmptyDocument } from '@/platform/files';

export interface NativeDocumentDescriptor {
  id: string;
  name: string;
  size: number;
  lastModified: number;
}

export interface NativeRead {
  document: NativeDocumentDescriptor;
  text: string;
}

export type NativeSaveResult =
  | { kind: 'saved'; document: NativeDocumentDescriptor }
  | { kind: 'conflict'; lastModified: number }
  | { kind: 'cancelled' };

export interface NativeFileBridge {
  openDocument(): Promise<NativeDocumentDescriptor | null>;
  readDocument(documentId: string): Promise<NativeRead>;
  statDocument(documentId: string): Promise<NativeDocumentDescriptor | null>;
  saveDocument(
    documentId: string,
    encodedText: string,
    overwrite: boolean,
  ): Promise<NativeSaveResult>;
  saveDocumentAs(encodedText: string, suggestedName: string): Promise<NativeSaveResult>;
  closeDocument(documentId: string): Promise<void>;
}

const tauriBridge: NativeFileBridge = {
  openDocument: () => invoke('open_document'),
  readDocument: (documentId) => invoke('read_document', { documentId }),
  statDocument: (documentId) => invoke('stat_document', { documentId }),
  saveDocument: (documentId, encodedText, overwrite) =>
    invoke('save_document', { documentId, encodedText, overwrite }),
  saveDocumentAs: (encodedText, suggestedName) =>
    invoke('save_document_as', { encodedText, suggestedName }),
  closeDocument: (documentId) => invoke('close_document', { documentId }),
};

function nextSessionId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class NativeFileSource implements FileBackedDocumentSource {
  readonly id = nextSessionId('native');
  readonly kind = 'native-file' as const;
  readonly canSaveInPlace = true;

  constructor(
    private descriptor: NativeDocumentDescriptor,
    private readonly bridge: NativeFileBridge = tauriBridge,
  ) {}

  get name(): string {
    return this.descriptor.name;
  }

  get size(): number {
    return this.descriptor.size;
  }

  get lastModified(): number {
    return this.descriptor.lastModified;
  }

  async read(): Promise<DocumentContents> {
    const result = await this.bridge.readDocument(this.descriptor.id);
    this.descriptor = result.document;
    return decodeText(result.text);
  }

  async save(contents: DocumentContents, options: SaveOptions = {}): Promise<SaveOutcome> {
    const result = await this.bridge.saveDocument(
      this.descriptor.id,
      encodeText(contents.text, contents.shape),
      options.overwrite === true,
    );
    return this.mapSaveResult(result);
  }

  async saveAs(contents: DocumentContents, suggestedName?: string): Promise<SaveOutcome> {
    const result = await this.bridge.saveDocumentAs(
      encodeText(contents.text, contents.shape),
      suggestedName ?? this.name,
    );
    return this.mapSaveResult(result, true);
  }

  async getFileMeta(): Promise<FileMetadata | null> {
    const current = await this.bridge.statDocument(this.descriptor.id);
    if (!current) return null;
    return { lastModified: current.lastModified, size: current.size };
  }

  reopen(): NativeFileSource {
    return new NativeFileSource(this.descriptor, this.bridge);
  }

  async dispose(): Promise<void> {
    await this.bridge.closeDocument(this.descriptor.id);
  }

  private mapSaveResult(result: NativeSaveResult, replacement = false): SaveOutcome {
    if (result.kind !== 'saved') return result;
    if (replacement) return { kind: 'saved', source: new NativeFileSource(result.document, this.bridge) };
    this.descriptor = result.document;
    return { kind: 'saved', source: this };
  }
}

/** An untitled desktop document whose first save uses the native Save dialog. */
export class NativeMemorySource implements DocumentSource {
  readonly id = nextSessionId('native-memory');
  readonly kind = 'new' as const;
  readonly canSaveInPlace = false;
  readonly size = null;

  constructor(
    readonly name = 'Untitled.md',
    private readonly contents: DocumentContents = decodeText(''),
    private readonly bridge: NativeFileBridge = tauriBridge,
  ) {}

  async read(): Promise<DocumentContents> {
    return this.contents;
  }

  save(contents: DocumentContents): Promise<SaveOutcome> {
    return this.saveAs(contents);
  }

  async saveAs(contents: DocumentContents, suggestedName?: string): Promise<SaveOutcome> {
    const result = await this.bridge.saveDocumentAs(
      encodeText(contents.text, contents.shape),
      suggestedName ?? this.name,
    );
    if (result.kind !== 'saved') return result;
    return { kind: 'saved', source: new NativeFileSource(result.document, this.bridge) };
  }
}

export function createNativeDesktopActions() {
  const available = isTauri() || window.location.protocol === 'tauri:';
  return {
    openAvailable: available,
    saveAvailable: available,
    async openDocument(): Promise<DocumentSource | null> {
      if (!available) return null;
      const descriptor = await tauriBridge.openDocument();
      return descriptor ? new NativeFileSource(descriptor) : null;
    },
    createDocument(name = 'Untitled.md', contents = decodeText('')): DocumentSource {
      return available ? new NativeMemorySource(name, contents) : createEmptyDocument();
    },
  };
}
