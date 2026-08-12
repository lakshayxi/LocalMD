import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DocumentContents,
  DocumentSource,
  FileBackedDocumentSource,
  FileMetadata,
  SaveOptions,
  SaveOutcome,
} from '@/platform/files';

const persistence = vi.hoisted(() => ({
  discardDraft: vi.fn(async () => undefined),
  ensureReadPermission: vi.fn(async () => 'granted' as const),
  forgetRecent: vi.fn(async () => undefined),
  listDrafts: vi.fn(async () => []),
  listRecents: vi.fn(async () => []),
  loadPrefs: vi.fn(() => ({
    theme: 'system' as const,
    typeface: 'sans' as const,
    outlinePinned: true,
  })),
  recordRecent: vi.fn(async () => undefined),
  saveDraft: vi.fn(async (draft: { id: string | null }) => draft.id),
  savePrefs: vi.fn(),
}));
const pipeline = vi.hoisted(() => ({
  renderMarkdown: vi.fn(async (_text: string, _options?: unknown) => ({
    slices: [],
    frontmatter: null,
    headings: [],
    blocked: [],
  })),
}));

vi.mock('@/platform/persistence', () => persistence);
vi.mock('@/app/pipeline-loader', () => pipeline);

vi.stubGlobal('window', {
  confirm: vi.fn(() => true),
  location: { hash: '', pathname: '/', search: '' },
  history: { replaceState: vi.fn() },
});

import { useDocument } from '@/app/store';

const shape = { hadBom: false, lineEnding: 'lf' as const, hadTrailingNewline: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class DeferredSaveSource implements DocumentSource {
  readonly id = crypto.randomUUID();
  readonly kind = 'picked-file' as const;
  readonly canSaveInPlace = true;
  readonly size = 9;
  readonly pending = deferred<SaveOutcome>();
  disposed = 0;

  constructor(
    readonly name: string,
    private readonly initial = 'original\n',
  ) {}

  async read(): Promise<DocumentContents> {
    return { text: this.initial, shape };
  }

  save(_contents: DocumentContents, _options?: SaveOptions): Promise<SaveOutcome> {
    return this.pending.promise;
  }

  saveAs(): Promise<SaveOutcome> {
    return this.pending.promise;
  }

  async dispose(): Promise<void> {
    this.disposed += 1;
  }
}

class DeferredReadSource extends DeferredSaveSource {
  readonly reading = deferred<DocumentContents>();

  override read(): Promise<DocumentContents> {
    return this.reading.promise;
  }
}

class ReloadableSource implements FileBackedDocumentSource {
  readonly id = crypto.randomUUID();
  readonly kind = 'native-file' as const;
  readonly canSaveInPlace = true;
  readonly size = 9;
  readonly lastModified = 1_000;
  readonly metadata = deferred<FileMetadata | null>();

  constructor(
    readonly name: string,
    private readonly initial = 'original\n',
    private readonly reopened?: FileBackedDocumentSource,
  ) {}

  async read(): Promise<DocumentContents> {
    return { text: this.initial, shape };
  }

  async save(): Promise<SaveOutcome> {
    return { kind: 'saved', source: this };
  }

  async saveAs(): Promise<SaveOutcome> {
    return { kind: 'saved', source: this };
  }

  getFileMeta(): Promise<FileMetadata | null> {
    return this.metadata.promise;
  }

  reopen(): FileBackedDocumentSource {
    return this.reopened ?? this;
  }
}

function resetStore(): void {
  useDocument.setState({
    source: null,
    text: '',
    shape: null,
    rendered: null,
    status: 'empty',
    error: null,
    allowRemoteContent: false,
    fastMode: false,
    mode: 'view',
    dirty: false,
    externalChange: false,
    draftId: null,
    saving: false,
    notice: null,
    recents: [],
    drafts: [],
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.mocked(window.confirm).mockReturnValue(true);
  pipeline.renderMarkdown.mockResolvedValue({
    slices: [],
    frontmatter: null,
    headings: [],
    blocked: [],
  });
});

describe('asynchronous document ownership', () => {
  it('does not let an older open install content after a newer open', async () => {
    const older = new DeferredReadSource('older.md');
    const newer = new DeferredSaveSource('newer.md', 'newer\n');

    const openingOlder = useDocument.getState().open(older);
    await useDocument.getState().open(newer);
    older.reading.resolve({ text: 'older\n', shape });
    await openingOlder;

    expect(useDocument.getState()).toMatchObject({
      source: newer,
      text: 'newer\n',
      status: 'ready',
      error: null,
    });
  });

  it('does not let an older open error over a newer document', async () => {
    const older = new DeferredReadSource('older.md');
    const newer = new DeferredSaveSource('newer.md', 'newer\n');

    const openingOlder = useDocument.getState().open(older);
    await useDocument.getState().open(newer);
    older.reading.reject(new Error('older failed'));
    await openingOlder;

    expect(useDocument.getState()).toMatchObject({
      source: newer,
      text: 'newer\n',
      status: 'ready',
      error: null,
    });
  });

  it('does not let an older open render install after a newer open', async () => {
    const olderRender = deferred<Awaited<ReturnType<typeof pipeline.renderMarkdown>>>();
    pipeline.renderMarkdown.mockImplementation(async (text: string) => {
      if (text === 'older\n') return olderRender.promise;
      return { slices: [], frontmatter: null, headings: [], blocked: [] };
    });
    const older = new DeferredSaveSource('older.md', 'older\n');
    const newer = new DeferredSaveSource('newer.md', 'newer\n');

    const openingOlder = useDocument.getState().open(older);
    await vi.waitFor(() => expect(pipeline.renderMarkdown).toHaveBeenCalledWith('older\n', expect.anything()));
    await useDocument.getState().open(newer);
    olderRender.resolve({ slices: [], frontmatter: null, headings: [], blocked: [] });
    await openingOlder;

    expect(useDocument.getState()).toMatchObject({ source: newer, text: 'newer\n', status: 'ready' });
  });

  it('does not let an older draft render replace a newer open', async () => {
    const draftRender = deferred<Awaited<ReturnType<typeof pipeline.renderMarkdown>>>();
    pipeline.renderMarkdown.mockImplementation(async (text: string) => {
      if (text === 'draft\n') return draftRender.promise;
      return { slices: [], frontmatter: null, headings: [], blocked: [] };
    });
    const detached = new DeferredSaveSource('draft.md', 'draft\n');
    const newer = new DeferredSaveSource('newer.md', 'newer\n');
    const draft = {
      id: 'draft-id',
      name: 'draft.md',
      text: 'draft\n',
      shape,
      savedAt: 1,
      handle: null,
      baseModified: null,
    };

    const restoring = useDocument.getState().restoreDraft(draft, detached);
    await vi.waitFor(() => expect(pipeline.renderMarkdown).toHaveBeenCalledWith('draft\n', expect.anything()));
    await useDocument.getState().open(newer);
    draftRender.resolve({ slices: [], frontmatter: null, headings: [], blocked: [] });
    await restoring;

    expect(useDocument.getState()).toMatchObject({
      source: newer,
      text: 'newer\n',
      dirty: false,
      status: 'ready',
      error: null,
    });
  });

  it('does not let an older draft failure error over a newer open', async () => {
    const draftRender = deferred<Awaited<ReturnType<typeof pipeline.renderMarkdown>>>();
    pipeline.renderMarkdown.mockImplementation(async (text: string) => {
      if (text === 'draft\n') return draftRender.promise;
      return { slices: [], frontmatter: null, headings: [], blocked: [] };
    });
    const newer = new DeferredSaveSource('newer.md', 'newer\n');
    const draft = {
      id: 'draft-id',
      name: 'draft.md',
      text: 'draft\n',
      shape,
      savedAt: 1,
      handle: null,
      baseModified: null,
    };

    const restoring = useDocument.getState().restoreDraft(draft, new DeferredSaveSource('draft.md'));
    await vi.waitFor(() => expect(pipeline.renderMarkdown).toHaveBeenCalledWith('draft\n', expect.anything()));
    await useDocument.getState().open(newer);
    draftRender.reject(new Error('draft render failed'));
    await restoring;

    expect(useDocument.getState()).toMatchObject({
      source: newer,
      text: 'newer\n',
      status: 'ready',
      error: null,
    });
  });

  it('keeps edits made while a save is in flight dirty and recoverable', async () => {
    const source = new DeferredSaveSource('notes.md');
    await useDocument.getState().open(source);
    useDocument.getState().updateText('snapshot\n');
    useDocument.getState().flushDraft();
    const draftId = useDocument.getState().draftId;

    const saving = useDocument.getState().save();
    useDocument.getState().updateText('newer edit\n');
    source.pending.resolve({ kind: 'saved', source });
    await saving;

    expect(useDocument.getState()).toMatchObject({
      source,
      text: 'newer edit\n',
      dirty: true,
      draftId,
      saving: false,
    });
    expect(persistence.discardDraft).not.toHaveBeenCalled();
  });

  it('unlocks saving after Save As adopts a replacement source', async () => {
    const original = new DeferredSaveSource('original.md');
    const replacement = new DeferredSaveSource('replacement.md');
    await useDocument.getState().open(original);
    useDocument.getState().updateText('saved copy\n');

    const saving = useDocument.getState().saveAs();
    original.pending.resolve({ kind: 'saved', source: replacement });
    await saving;

    expect(useDocument.getState()).toMatchObject({
      source: replacement,
      dirty: false,
      saving: false,
    });
    expect(original.disposed).toBe(1);
  });

  it('releases platform access when a document is replaced or closed', async () => {
    const first = new DeferredSaveSource('first.md');
    const second = new DeferredSaveSource('second.md', 'second\n');
    await useDocument.getState().open(first);

    await useDocument.getState().open(second);
    expect(first.disposed).toBe(1);

    useDocument.getState().close();
    expect(second.disposed).toBe(1);
  });

  it('ignores a late save after ownership changed away and back to the same source', async () => {
    const first = new DeferredSaveSource('first.md');
    const second = new DeferredSaveSource('second.md', 'second\n');
    await useDocument.getState().open(first);
    useDocument.getState().updateText('old edit\n');

    const saving = useDocument.getState().save();
    await useDocument.getState().open(second);
    await useDocument.getState().open(first);
    sourceResolve(first);
    await saving;

    expect(useDocument.getState()).toMatchObject({
      source: first,
      text: 'original\n',
      dirty: false,
      notice: null,
    });
  });

  it('does not let an old completion unlock or report against a newer save', async () => {
    const first = new DeferredSaveSource('first.md');
    const second = new DeferredSaveSource('second.md', 'second\n');
    await useDocument.getState().open(first);
    useDocument.getState().updateText('first edit\n');
    const firstSave = useDocument.getState().save();

    await useDocument.getState().open(second);
    useDocument.getState().updateText('second edit\n');
    const secondSave = useDocument.getState().save();
    first.pending.resolve({ kind: 'saved', source: first });
    await firstSave;

    expect(useDocument.getState()).toMatchObject({
      source: second,
      saving: true,
      dirty: true,
      notice: null,
    });

    second.pending.resolve({ kind: 'saved', source: second });
    await secondSave;
    expect(useDocument.getState()).toMatchObject({ source: second, saving: false, dirty: false });
  });

  it('does not report a failed save against a replacement document', async () => {
    const first = new DeferredSaveSource('first.md');
    const second = new DeferredSaveSource('second.md', 'second\n');
    await useDocument.getState().open(first);
    useDocument.getState().updateText('first edit\n');
    const saving = useDocument.getState().save();

    await useDocument.getState().open(second);
    first.pending.reject(new Error('first disk failed'));
    await saving;

    expect(useDocument.getState()).toMatchObject({
      source: second,
      saving: false,
      notice: null,
    });
  });

  it('keeps the recovery draft when reload fails', async () => {
    const failed = new ReloadableSource('notes.md');
    failed.read = vi.fn(async () => {
      throw new Error('gone');
    });
    const source = new ReloadableSource('notes.md', 'original\n', failed);
    await useDocument.getState().open(source);
    useDocument.getState().updateText('unsaved\n');
    useDocument.getState().flushDraft();
    const draftId = useDocument.getState().draftId;
    useDocument.setState({ externalChange: true });

    await useDocument.getState().reloadFromDisk();

    expect(useDocument.getState()).toMatchObject({
      source,
      text: 'unsaved\n',
      dirty: true,
      externalChange: true,
      draftId,
      status: 'ready',
    });
    expect(persistence.discardDraft).not.toHaveBeenCalled();
  });

  it('ignores metadata returned after another document took ownership', async () => {
    const first = new ReloadableSource('first.md');
    const second = new ReloadableSource('second.md', 'second\n');
    await useDocument.getState().open(first);

    const checking = useDocument.getState().checkExternalChange();
    await useDocument.getState().open(second);
    first.metadata.resolve({ lastModified: 2_000, size: 10 });
    await checking;

    expect(useDocument.getState()).toMatchObject({ source: second, externalChange: false });
  });

  it('flags a same-mtime external size change', async () => {
    const source = new ReloadableSource('notes.md');
    await useDocument.getState().open(source);

    const checking = useDocument.getState().checkExternalChange();
    source.metadata.resolve({ lastModified: source.lastModified, size: source.size + 1 });
    await checking;

    expect(useDocument.getState().externalChange).toBe(true);
  });
});

function sourceResolve(source: DeferredSaveSource): void {
  source.pending.resolve({ kind: 'saved', source });
}
