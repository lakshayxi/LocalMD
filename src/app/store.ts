import { create } from 'zustand';
import type { TextShape } from '@/core/text/encoding';
import type { DocumentContents, DocumentSource, SaveOutcome } from '@/platform/files';
import {
  FileHandleSource,
  isFileBackedDocumentSource,
  isFileHandleSource,
  LARGE_FILE_BYTES,
  MemorySource,
} from '@/platform/files';
import type { RecentDocument, StoredDraft, StoredPrefs } from '@/platform/persistence';
import {
  discardDraft,
  ensureReadPermission,
  forgetRecent,
  listDrafts,
  listRecents,
  loadPrefs,
  recordRecent,
  saveDraft,
  savePrefs,
} from '@/platform/persistence';
// Type-only imports above are erased at build time; the pipeline itself is
// loaded on demand so it stays out of the entry chunk. See pipeline-loader.ts.
import type { RenderedDocument } from '@/platform/render/client';
import { renderMarkdown } from './pipeline-loader';

export type Theme = 'system' | 'light' | 'dark';
export type Status = 'empty' | 'loading' | 'ready' | 'error';

export interface Notice {
  kind: 'info' | 'error';
  message: string;
}

/** Split is only offered above 1024px; below that it collapses to Edit. */
export type Mode = 'view' | 'edit' | 'split';

/**
 * Trailing debounce on the live preview in Split.
 *
 * Long enough that a burst of typing produces one render rather than one per
 * character, short enough that pausing feels like the preview kept up. The
 * plan's number, and it holds up: the pipeline renders 243KB in ~256ms, so the
 * debounce — not the render — is what the reader perceives.
 */
const PREVIEW_DEBOUNCE_MS = 120;

/**
 * How long typing has to stop before unsaved work is written to the draft store.
 *
 * The navigation guard covers every teardown the page is told about — reload,
 * tab close, app switch. It cannot cover the ones it is not told about: a
 * browser crash, an OS kill, a lost battery. Those are exactly the cases where
 * the reader has no chance to save first, so a draft that only exists on the way
 * out is a net with a hole in the middle of it.
 *
 * This is a real change to what sits in browser storage, and it is stated on the
 * privacy page rather than absorbed quietly: before, text was written when you
 * left; now it is written a couple of seconds after you stop typing. The bargain
 * that justifies the store is unchanged — written only while dirty, deleted the
 * instant the work is durable — but the window during which unsaved text is at
 * rest is now the whole editing session rather than the moment of departure.
 *
 * Two seconds, because it wants to be past the end of a sentence rather than in
 * the middle of a word, and because a write nobody is waiting on costs nothing
 * worth optimizing.
 */
const DRAFT_IDLE_MS = 2000;

/**
 * The ceiling on that debounce.
 *
 * A pure idle timer never fires for someone who does not pause, and the person
 * typing without pause for a minute is precisely the person with the most to
 * lose. This bounds what a crash can cost to the last fifteen seconds of work,
 * whatever their typing rhythm.
 */
const DRAFT_MAX_WAIT_MS = 15_000;

/**
 * Reading typeface.
 *
 * Sans is the default because the most common document here is a README or a
 * CLAUDE.md — code-dense, and readers carry a strong sans expectation from
 * GitHub and VS Code, so a serif default risks reading as *wrong* on first
 * open. Serif measurably wins for long-form prose (measured on a 6,800-word
 * document, on screen and in print), which is why it is one click away rather
 * than absent.
 */
export type Typeface = 'sans' | 'serif';

interface DocumentState {
  source: DocumentSource | null;
  /** Normalized to LF. The editor's source of truth from M4 onward. */
  text: string;
  /** Original encoding, carried so M4's save can restore it byte-for-byte. */
  shape: TextShape | null;
  rendered: RenderedDocument | null;
  status: Status;
  error: string | null;

  /**
   * Per-document and per-session by design. Allowing remote content is a
   * decision about *this* document, so it must not persist into the next one —
   * a reader who trusts their own README has not thereby trusted a file a
   * stranger sends them tomorrow.
   */
  allowRemoteContent: boolean;

  /**
   * Large documents start without optional renderer hydration or editing.
   * Parsing still produces the complete readable document; the reader chooses
   * when to pay for highlighting, diagrams, and the editor.
   */
  fastMode: boolean;

  mode: Mode;
  /** Edited since it was last saved. */
  dirty: boolean;
  /**
   * The file changed on disk since we last read or wrote it.
   *
   * Sticky once set: it is cleared by resolving the situation — reloading,
   * overwriting, or saving elsewhere — and never by time passing or by another
   * check happening to run. A banner that cleared itself would be a banner the
   * reader could miss and then act against.
   */
  externalChange: boolean;
  /**
   * The draft row this document owns, once it has been flushed at least once.
   *
   * Held so that repeated flushes overwrite one row instead of accumulating,
   * and so that discarding on save knows exactly what to delete. Null means
   * nothing of this document is in storage — which is the state every saved or
   * unedited document must be in.
   */
  draftId: string | null;
  saving: boolean;
  /** Transient feedback for a save. A save with no acknowledgement is a save you do not trust. */
  notice: Notice | null;

  theme: Theme;
  typeface: Typeface;
  outlinePinned: boolean;

  /** Only documents with a reopenable handle appear here. See persistence/recents.ts. */
  recents: RecentDocument[];

  /**
   * Unsaved work left behind by an earlier session, offered on the landing
   * screen. Loaded once on hydrate and refreshed whenever a row is spent, so the
   * list the reader is looking at is never one that has already been acted on.
   */
  drafts: StoredDraft[];

  open: (source: DocumentSource) => Promise<void>;
  openRecent: (recent: RecentDocument) => Promise<void>;
  forget: (id: string) => Promise<void>;
  restoreDraft: (draft: StoredDraft, detachedSource?: DocumentSource) => Promise<void>;
  dismissDraft: (id: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;
  setMode: (mode: Mode) => Promise<void>;
  renderFully: () => void;
  updateText: (text: string) => void;
  flushDraft: () => void;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  /** The plan's *Keep mine*: write over a file that changed underneath us. */
  overwrite: () => Promise<void>;
  /** The plan's *Load theirs*: throw away what is here and re-read the file. */
  reloadFromDisk: () => Promise<void>;
  checkExternalChange: () => Promise<void>;
  dismissNotice: () => void;
  close: () => void;
  setAllowRemoteContent: (allow: boolean) => Promise<void>;
  setTheme: (theme: Theme) => void;
  setTypeface: (typeface: Typeface) => void;
  setOutlinePinned: (pinned: boolean) => void;
  hydrate: () => Promise<void>;
  refreshRecents: () => Promise<void>;
  refreshPreview: () => Promise<void>;
}

function persist(state: Pick<DocumentState, 'theme' | 'typeface' | 'outlinePinned'>): void {
  savePrefs({
    theme: state.theme,
    typeface: state.typeface,
    outlinePinned: state.outlinePinned,
  });
}

/**
 * The threshold is exclusive: a document of exactly 2 MiB remains on the
 * normal path. File-backed sources supply their original byte size; pasted and
 * recovered text is measured as the UTF-8 bytes it would have in a file.
 */
export function shouldUseFastMode(sourceBytes: number | null, text: string): boolean {
  const bytes = sourceBytes ?? new TextEncoder().encode(text).byteLength;
  return bytes > LARGE_FILE_BYTES;
}

/** Fast mode always wins over the mode a document would otherwise enter. */
export function modeWithFastMode(preferred: Mode, fastMode: boolean): Mode {
  return fastMode ? 'view' : preferred;
}

/**
 * Split's live-preview debounce, and the guard against out-of-order renders.
 *
 * Module-scoped rather than in the store: they are scheduling machinery, not
 * state anything renders from, and putting a timer id in the store would
 * notify every subscriber each time a key is pressed.
 */
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let previewGeneration = 0;

/**
 * Monotonic ownership for asynchronous saves.
 *
 * A save writes the text captured when it starts. The editor remains usable
 * while a native picker or disk write is in flight, so `dirty` may only clear
 * if no edit landed after that snapshot was taken. Comparing the text is not
 * enough: editing away and back is still a newer document history.
 */
let editRevision = 0;

/** Changes whenever a document ownership transition starts. */
let documentRevision = 0;

/**
 * Separates the conflict a save started with from one discovered while it ran.
 * A successful overwrite or Save As resolves the former, never the latter.
 */
let externalChangeRevision = 0;

function schedulePreview(get: () => DocumentState): void {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => void get().refreshPreview(), PREVIEW_DEBOUNCE_MS);
}

function cancelPreview(): void {
  clearTimeout(previewTimer);
  previewTimer = undefined;
}

/**
 * The idle draft flush, and the deadline that keeps it from being starved.
 *
 * Module-scoped for the same reason the preview timer is: a timer id is
 * scheduling machinery, not state, and putting one in the store would notify
 * every subscriber on each keystroke.
 */
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let draftDeadline = 0;

function scheduleDraftFlush(get: () => DocumentState): void {
  const now = Date.now();
  // The first keystroke of a burst starts the clock. Later ones push the idle
  // timer back but must not push this, or continuous typing would defer the
  // write forever — which is the case the ceiling exists for.
  if (draftTimer === undefined) draftDeadline = now + DRAFT_MAX_WAIT_MS;

  clearTimeout(draftTimer);
  draftTimer = setTimeout(
    () => {
      draftTimer = undefined;
      get().flushDraft();
    },
    Math.max(0, Math.min(DRAFT_IDLE_MS, draftDeadline - now)),
  );
}

function cancelDraftFlush(): void {
  clearTimeout(draftTimer);
  draftTimer = undefined;
}

/**
 * Drops this document's draft, because its work is no longer unsaved.
 *
 * Clearing `draftId` first is what makes it safe to call from anywhere: the
 * delete is fire-and-forget, and a flush racing behind it would otherwise be
 * able to re-address the row we just asked to be rid of.
 */
function forgetDraft(
  set: (partial: Partial<DocumentState>) => void,
  get: () => DocumentState,
): void {
  // Unconditionally, and before anything else. A flush left scheduled by the
  // last few keystrokes would otherwise land after the delete and put the text
  // of a now-saved document straight back into storage.
  cancelDraftFlush();

  const { draftId } = get();
  if (!draftId) return;

  set({ draftId: null });
  void discardDraft(draftId);
}

/**
 * Asks before unsaved work goes away, and reports whether to go ahead.
 *
 * Both paths that can lose an edit from inside the app — closing the document
 * and opening another over it — run through here, so the guard cannot be
 * forgotten at a call site the way it would be if each asked for itself.
 *
 * A native confirm rather than a designed modal, on purpose: it is the same
 * affordance the browser uses for closing a dirty tab, it cannot be missed or
 * mis-clicked past, and a bespoke dialog for a once-in-a-while question would
 * be a lot of surface to maintain.
 *
 * Answering yes really does discard. Unlike a tab that simply went away, this
 * is a decision, and leaving a draft behind after someone has said "discard"
 * would make the recovery prompt an argument with the reader. The net catches
 * what you lose, not what you choose to throw away.
 */
function confirmDiscard(
  set: (partial: Partial<DocumentState>) => void,
  get: () => DocumentState,
  discardDraft = true,
): boolean {
  const { dirty, source } = get();
  if (!dirty || !source) return true;

  if (!window.confirm(`"${source.name}" has unsaved changes. Discard them?`)) return false;

  if (discardDraft) forgetDraft(set, get);
  return true;
}

/**
 * Works out where a recovered draft's text should be able to go.
 *
 * Restoring puts unsaved work back in front of the reader. It never writes to a
 * file — only saving does that — so the question here is narrower than it looks:
 * whether ⌘S should still be able to write in place afterwards, and what the
 * reader needs told before it does.
 *
 * Three things can have changed since the draft was written, and each has an
 * answer that keeps the text and gives up only the shortcut:
 *
 *  - **The permission lapsed.** Handles survive a reload; their grant does not.
 *    Re-requesting works here because Restore is a click, and a refusal is an
 *    answer — the draft comes back as a document that saves through the picker.
 *  - **The file is gone.** Moved or deleted. Same outcome: text kept, Save As.
 *  - **The file no longer matches what the draft branched from.** The text is
 *    still the reader's work and still worth having back, but saving it would
 *    now overwrite whatever else has happened to that file, so that is said
 *    plainly and left as their decision.
 *
 * That third case tests `!==`, not "newer". A mismatch in either direction means
 * the file is not the version this draft came from, and an *older* mtime is not
 * the benign case it looks like: a restore from backup, a `git checkout`, a sync
 * client writing a stale copy, and a clock that stepped backwards all produce
 * one, and all of them mean the bytes on disk are something the reader has not
 * seen. Trusting an older timestamp would wave through exactly the collisions
 * hardest to reason about afterwards.
 *
 * The baseline recorded in the draft is handed to the source rather than
 * discarded, which is what closes the hole recovery used to leave: without it a
 * restored document would arrive with nothing to compare, and ⌘S would write
 * over a file that had moved on since the draft was written. Reporting the
 * mismatch is now the smaller half of the job — refusing the save is the rest,
 * and that lives in `FileHandleSource.save`.
 */
async function adoptDraft(
  draft: StoredDraft,
): Promise<{ source: DocumentSource; notice: Notice | null; conflict: boolean }> {
  // Same name, so it saves as the file it came from rather than as "Untitled".
  const detached = () => new MemorySource(draft.name, draft.text);

  if (!draft.handle) return { source: detached(), notice: null, conflict: false };

  if ((await ensureReadPermission(draft.handle)) !== 'granted') {
    return {
      source: detached(),
      notice: {
        kind: 'info',
        message: `Restored. LocalMD no longer has access to ${draft.name}, so saving will ask where to put it.`,
      },
      conflict: false,
    };
  }

  const source = new FileHandleSource(draft.handle);
  const meta = await source.getFileMeta();

  if (!meta) {
    return {
      source: detached(),
      notice: {
        kind: 'info',
        message: `Restored, but ${draft.name} could not be found. Saving will ask where to put it.`,
      },
      conflict: false,
    };
  }

  // The version this text was written against, not the one on disk now. Saving
  // re-stats and compares against this, so a file that moved on while the draft
  // was gone is refused rather than replaced.
  source.adoptBaseline(draft.baseModified);

  // Reported through the conflict banner rather than a toast: the banner is
  // persistent and carries the three answers — save a copy, keep mine, load
  // theirs — where a toast could only say that something was wrong.
  return {
    source,
    notice: null,
    conflict: draft.baseModified !== null && meta.lastModified !== draft.baseModified,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function disposeSource(source: DocumentSource | null): void {
  if (!source?.dispose) return;
  void source.dispose().catch(() => {
    // Revocation is cleanup. The document transition has already completed,
    // so a platform cleanup failure must not restore stale document state.
  });
}

/**
 * The shared body of Save and Save As.
 *
 * Both have the same shape and the same three outcomes, and the difference —
 * whether a picker opens — belongs to the source. Sharing it here keeps the two
 * from drifting apart on the parts that actually matter: clearing dirty only on
 * a real write, adopting a new handle after Save As, and never reporting
 * success for a cancelled dialog.
 */
async function performSave(
  set: (partial: Partial<DocumentState>) => void,
  get: () => DocumentState,
  run: (source: DocumentSource, contents: DocumentContents) => Promise<SaveOutcome>,
): Promise<void> {
  const { source, text, shape, status, saving } = get();
  // Re-entry is real: ⌘S held down, or a click while the picker is already up.
  if (!source || !shape || status !== 'ready' || saving) return;

  const savedRevision = editRevision;
  const savedDocumentRevision = documentRevision;
  const savedConflictRevision = externalChangeRevision;
  let adoptedSource: DocumentSource | null = null;

  set({ saving: true, notice: null });

  try {
    const outcome = await run(source, { text, shape });

    // The operation belongs to the document it started from. A native dialog
    // can stay open long enough for another application action to replace that
    // document, and a late completion must never adopt its source, clear the new
    // document's dirty bit, or raise its conflict banner.
    if (get().source !== source || documentRevision !== savedDocumentRevision) return;

    const hasNewerEdits = editRevision !== savedRevision;

    if (outcome.kind === 'cancelled') return;

    // Nothing was written, and nothing about the document changes: it stays
    // dirty, it keeps its draft, and the reader keeps every option they had a
    // moment ago. The banner carries the three ways out; this only has to say
    // why the keystroke did not do what it usually does.
    if (outcome.kind === 'conflict') {
      externalChangeRevision += 1;
      set({
        externalChange: true,
        notice: {
          kind: 'error',
          message: `${source.name} changed on disk since you opened it. Nothing was written.`,
        },
      });
      return;
    }

    if (outcome.kind === 'downloaded') {
      // Dirty clears because the reader's work is now durable somewhere. Saying
      // otherwise would make the navigation guard nag about a document they
      // just saved.
      // `outcome.name`, not `source.name`: a pasted document displays as
      // "Pasted document" and is written as "Pasted document.md", and the
      // message has to name the file that actually exists.
      set({
        dirty: hasNewerEdits,
        notice: {
          kind: 'info',
          message: hasNewerEdits
            ? `Downloaded ${outcome.name}. Newer edits are still unsaved.`
            : `Downloaded ${outcome.name}.`,
        },
      });
      if (!hasNewerEdits) forgetDraft(set, get);
      return;
    }

    // Save As hands back a handle to the *new* file, and from here on ⌘S must
    // write there rather than to the original.
    adoptedSource = outcome.source;
    set({
      source: outcome.source,
      dirty: hasNewerEdits,
      // Whatever the disagreement was, this settles it: the bytes on disk are
      // now ours, and the source re-stat'd itself as it wrote, so the baseline
      // matches again. Save As settles it too, by pointing at a different file.
      externalChange:
        externalChangeRevision === savedConflictRevision ? false : get().externalChange,
      notice: {
        kind: 'info',
        message: hasNewerEdits
          ? `Saved ${outcome.source.name}. Newer edits are still unsaved.`
          : `Saved ${outcome.source.name}.`,
      },
    });
    if (outcome.source !== source) disposeSource(source);

    // The file on disk is now the better copy, so the draft has nothing left to
    // protect — and keeping it would leave the text of a saved document in
    // storage, which is the one thing this store promises not to do.
    if (!hasNewerEdits) forgetDraft(set, get);

    if (isFileHandleSource(outcome.source)) {
      await recordRecent(outcome.source.handle, outcome.source.size);
      await get().refreshRecents();
    }
  } catch (error) {
    // The document stays open and stays dirty. A failed save must never look
    // like a successful one, and must never cost the reader their text.
    if (get().source === source && documentRevision === savedDocumentRevision) {
      set({
        notice: {
          kind: 'error',
          message: errorMessage(error, 'That file could not be saved.'),
        },
      });
    }
  } finally {
    // `saving` belongs to the operation, not globally to whichever document is
    // current when it finishes. A newer document may already have begun its own
    // save, and this completion must not unlock that operation's controls.
    const currentSource = get().source;
    if (
      (currentSource === source || currentSource === adoptedSource) &&
      documentRevision === savedDocumentRevision
    ) {
      set({ saving: false });
    }
  }
}

/** Applies preferences to the document element, which is where CSS reads them. */
function applyPrefs(prefs: Pick<StoredPrefs, 'theme' | 'typeface'>): void {
  const root = document.documentElement;
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);

  if (prefs.typeface === 'sans') root.removeAttribute('data-typeface');
  else root.setAttribute('data-typeface', prefs.typeface);
}

export const useDocument = create<DocumentState>((set, get) => ({
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
  theme: 'system',
  typeface: 'sans',
  outlinePinned: true,
  recents: [],
  drafts: [],

  async hydrate() {
    // Prefs are synchronous and were already applied by public/theme-init.js
    // before first paint; this only syncs them into React state.
    const prefs = loadPrefs();
    set({ theme: prefs.theme, typeface: prefs.typeface, outlinePinned: prefs.outlinePinned });
    await Promise.all([get().refreshRecents(), get().refreshDrafts()]);
  },

  async refreshRecents() {
    set({ recents: await listRecents() });
  },

  async refreshDrafts() {
    set({ drafts: await listDrafts() });
  },

  async open(source) {
    // Opening one document over another that is mid-edit loses the same work a
    // tab close would, and has to ask the same question.
    if (!confirmDiscard(set, get)) return;

    const previousSource = get().source;
    documentRevision += 1;
    const openedDocumentRevision = documentRevision;

    set({ status: 'loading', error: null, source, draftId: null, saving: false });
    if (previousSource !== source) disposeSource(previousSource);

    try {
      const { text, shape } = await source.read();
      if (documentRevision !== openedDocumentRevision || get().source !== source) return;

      // Opening a new document resets the remote-content decision. See the note
      // on the field above — this reset is the security property, not an
      // implementation detail.
      const rendered = await renderMarkdown(text, { allowRemoteContent: false });
      if (documentRevision !== openedDocumentRevision || get().source !== source) return;

      const fastMode = shouldUseFastMode(source.size, text);

      set({
        text,
        shape,
        rendered,
        status: 'ready',
        allowRemoteContent: false,
        fastMode,
        // Files and pasted text arrive to be read. A new, empty document has
        // nothing to read yet: opening it in View produces a blank page that
        // looks like the button did nothing. Start that one source kind in the
        // focused editor; the mode still resets per document rather than
        // leaking whatever the previous document used.
        mode: modeWithFastMode(source.kind === 'new' ? 'edit' : 'view', fastMode),
        dirty: false,
        // Just read, so it cannot already disagree with itself. Reset because
        // this state belongs to the document, not to the session.
        externalChange: false,
        notice: null,
      });

      // Only handle-backed sources can be reopened, so only they are recorded.
      if (isFileHandleSource(source)) {
        await recordRecent(source.handle, source.size);
        if (documentRevision !== openedDocumentRevision || get().source !== source) return;
        await get().refreshRecents();
      }
    } catch (error) {
      if (documentRevision !== openedDocumentRevision || get().source !== source) return;

      disposeSource(source);
      set({
        status: 'error',
        error: errorMessage(error, 'That file could not be opened.'),
        source: null,
      });
    }
  },

  async openRecent(recent) {
    // Handles survive a reload but their permission does not, so this re-prompts.
    // It happens on click because the request needs a user activation — asking
    // while drawing the list would both fail and feel like an ambush.
    const outcome = await ensureReadPermission(recent.handle);

    if (outcome !== 'granted') {
      set({
        status: 'error',
        error: `Permission to read "${recent.name}" was not granted. Open it again to restore access.`,
      });
      return;
    }

    // A moved or deleted file has to be detected here rather than by catching
    // `open`, which reports its failures into state instead of throwing.
    // `getFile()` is the call that raises NotFoundError once the file is gone.
    try {
      await recent.handle.getFile();
    } catch {
      // Leaving the row in place would strand the reader on an entry that can
      // only ever fail, so a dead handle removes itself.
      await get().forget(recent.id);
      set({ status: 'error', error: `"${recent.name}" could not be found. It may have moved.` });
      return;
    }

    await get().open(new FileHandleSource(recent.handle, recent.id));
  },

  async forget(id) {
    await forgetRecent(id);
    await get().refreshRecents();
  },

  /**
   * Puts unsaved work from an earlier session back in front of the reader.
   *
   * Not `open`, and deliberately not built on it: `open` reads a source and
   * makes what it finds the document. Here the *draft* is the document, and the
   * file — if there still is one — is only where it might go next. Routing this
   * through `open` would read the file and overwrite the recovered text with
   * exactly the version the reader was trying to get back from.
   *
   * The document arrives dirty, because it is. Nothing has been written
   * anywhere, and the guard that has been protecting this text all along has to
   * keep protecting it.
   */
  async restoreDraft(draft, detachedSource) {
    // Restoring over a document that is itself mid-edit loses the same work a
    // close would, and has to ask the same question.
    if (!confirmDiscard(set, get)) return;

    const previousSource = get().source;
    documentRevision += 1;
    const restoredDocumentRevision = documentRevision;

    set({ status: 'loading', error: null, draftId: null, saving: false });
    disposeSource(previousSource);

    let restoredSource: DocumentSource | null = null;
    try {
      const { source, notice, conflict } = detachedSource
        ? { source: detachedSource, notice: null, conflict: false }
        : await adoptDraft(draft);
      restoredSource = source;
      if (documentRevision !== restoredDocumentRevision) {
        disposeSource(restoredSource);
        return;
      }

      const rendered = await renderMarkdown(draft.text, { allowRemoteContent: false });
      if (documentRevision !== restoredDocumentRevision) {
        disposeSource(restoredSource);
        return;
      }

      // The recovered draft is the document being shown. Its backing file may
      // have grown or shrunk since the draft was captured, so its size cannot
      // decide whether rendering the recovered text needs fast mode.
      const fastMode = shouldUseFastMode(null, draft.text);

      set({
        source,
        text: draft.text,
        // The shape travelled with the draft, so a document recovered from a
        // crash still saves with the line endings and BOM the file arrived with.
        shape: draft.shape,
        rendered,
        status: 'ready',
        allowRemoteContent: false,
        fastMode,
        // Edit, where `open` uses View. A document being opened is something to
        // read; a draft being restored is work that was interrupted, and putting
        // the reader back where they were beats making them press ⌘E first.
        mode: modeWithFastMode('edit', fastMode),
        dirty: true,
        // Adopting the row rather than minting a new one is what keeps this to a
        // single draft — the next flush overwrites what was just recovered
        // instead of filing a second copy of it alongside.
        draftId: draft.id,
        // A draft written against a version of the file that is no longer there
        // arrives already in conflict, and says so through the same banner a
        // change noticed on focus would — with the same three answers rather than
        // a warning the reader can only acknowledge.
        externalChange: conflict,
        notice,
      });

      // The row stays: the work is still unsaved, so the net still applies. What
      // has to go is this document's entry in the *offer*, which is now open.
      set({ drafts: get().drafts.filter((entry) => entry.id !== draft.id) });
    } catch (error) {
      if (documentRevision !== restoredDocumentRevision) return;

      disposeSource(restoredSource);
      set({
        status: 'error',
        error: errorMessage(error, 'That draft could not be restored.'),
        source: null,
      });
    }
  },

  async dismissDraft(id) {
    await discardDraft(id);
    await get().refreshDrafts();
  },

  /**
   * Records an edit.
   *
   * In View and Edit this deliberately does *not* re-render the preview.
   * Nothing mounted subscribes to `text`, so a keystroke costs one store write
   * and no React render at all — which is what keeps typing inside a frame on a
   * large document. Split is the exception, because there the preview is on
   * screen, and it pays for that with a debounce rather than a render per key.
   */
  updateText(text) {
    editRevision += 1;
    set({ text, dirty: true });
    // The crash net. The navigation guard covers every way of leaving the page
    // that the page is told about; this covers the ways it is not.
    scheduleDraftFlush(get);
    if (get().mode === 'split') schedulePreview(get);
  },

  /**
   * Writes the current unsaved text to the draft store.
   *
   * Synchronous up to the point where it hands off, and that is the whole
   * design. It is called from teardown — `visibilitychange`, `pagehide`, and
   * the moment before state is cleared — where reading the store later would
   * read a document that is already gone. Everything the write needs is
   * captured here, on the caller's stack, and the write itself is left to
   * finish on its own.
   *
   * Deliberately does nothing when the document is clean: an unedited document
   * has nothing worth keeping, and writing one would put text into storage for
   * a reader who only ever read.
   */
  flushDraft() {
    // Whatever the idle timer was about to write, this is writing now. Leaving
    // it armed would cost a second identical write on the way out of a teardown.
    cancelDraftFlush();

    const { source, text, shape, dirty, status, draftId } = get();
    if (!source || !shape || !dirty || status !== 'ready') return;

    // Minted here rather than inside the write, and kept for the rest of the
    // document's life. A teardown fires `visibilitychange` and `pagehide` in the
    // same tick, so the second flush starts long before the first has landed —
    // deciding the row up front is what makes it an overwrite instead of a
    // second copy of the same unsaved work.
    const id = draftId ?? crypto.randomUUID();
    if (id !== draftId) set({ draftId: id });

    const browserFile = isFileHandleSource(source) ? source : null;

    void saveDraft({
      id,
      name: source.name,
      text,
      shape,
      // Only a handle survives a reload, so only a handle-backed document can be
      // recognised as "the same file" on the way back in.
      handle: browserFile?.handle ?? null,
      // Cached on the source at read and write time rather than stat'd here:
      // this runs on a teardown path, where there is no time left to await a
      // file. See FileHandleSource.lastModified.
      baseModified: browserFile?.lastModified ?? null,
    });
  },

  async setMode(mode) {
    const { mode: current, status, fastMode } = get();
    if (mode === current || status !== 'ready') return;

    // Fast mode is deliberately read-only. The notice carries the explicit
    // opt-in that enables both enhancements and editing together.
    if (fastMode && mode !== 'view') return;

    cancelPreview();
    set({ mode });

    // Coming back from an edit, the rendered tree is stale by exactly the edits
    // just made. Re-rendering on the way *out* of editing, rather than on every
    // keystroke, is the whole reason typing is cheap.
    if (mode !== 'edit') await get().refreshPreview();
  },

  renderFully() {
    if (!get().fastMode) return;
    set({ fastMode: false });
  },

  /**
   * Re-renders the preview from the current text.
   *
   * Guarded by a generation counter because renders are async and a fast typist
   * can start a second one before the first resolves. Without it, an older,
   * slower render can land last and put stale content on screen — the classic
   * async-race bug, and a particularly confusing one in a live preview.
   */
  async refreshPreview() {
    const { text, allowRemoteContent } = get();
    const generation = ++previewGeneration;

    const rendered = await renderMarkdown(text, { allowRemoteContent });
    if (generation !== previewGeneration) return;

    set({ rendered });
  },

  /**
   * Writes the document back where it came from, or downloads it.
   *
   * The whole difference between the two is `canSaveInPlace`, decided inside
   * the source. Nothing here branches on which browser is running.
   */
  async save() {
    await performSave(set, get, (source, contents) => source.save(contents));
  },

  async saveAs() {
    await performSave(set, get, (source, contents) => source.saveAs(contents));
  },

  /**
   * *Keep mine.* Writes over a file that changed underneath the reader.
   *
   * Deliberately a separate action rather than a retry of `save`, and reachable
   * only from the conflict banner. Overwriting somebody's work has to be
   * something the reader did, not something a keystroke fell through to on its
   * second press.
   */
  async overwrite() {
    await performSave(set, get, (source, contents) => source.save(contents, { overwrite: true }));
  },

  /**
   * *Load theirs.* Throws away what is on screen and re-reads the file.
   *
   * A new source over the same handle rather than a re-read into the old one:
   * the editor is keyed to the source's id, so reusing it would leave the old
   * text on screen with the new file underneath it. An undo history that reaches
   * back into a version of the file that no longer exists is not worth keeping
   * either.
   */
  async reloadFromDisk() {
    const { source, status } = get();
    if (status !== 'ready' || !isFileBackedDocumentSource(source)) return;

    // Reloading over unsaved work loses exactly what closing would, so it asks
    // the same question — and on yes, drops the draft with it.
    // Keep the recovery row until the replacement has actually been read. A
    // failed reload leaves the dirty document in place, so deleting its draft
    // before the read would silently remove its crash protection.
    if (!confirmDiscard(set, get, false)) return;

    documentRevision += 1;

    const reloaded = source.reopen();
    set({ status: 'loading', error: null, saving: false });

    try {
      const { text, shape } = await reloaded.read();
      const rendered = await renderMarkdown(text, { allowRemoteContent: false });
      const fastMode = shouldUseFastMode(reloaded.size, text);

      // A later open or close owns the store now. Do not let this reload install
      // an older document over it when its asynchronous read/render completes.
      if (get().source !== source) return;

      set({
        source: reloaded,
        text,
        shape,
        rendered,
        status: 'ready',
        allowRemoteContent: false,
        fastMode,
        mode: modeWithFastMode(get().mode, fastMode),
        dirty: false,
        externalChange: false,
        notice: { kind: 'info', message: `Reloaded ${reloaded.name}.` },
      });
      forgetDraft(set, get);
    } catch {
      // The document is still here and still theirs. A failed reload must cost
      // them nothing, so it goes back to exactly what was on screen — including
      // the conflict, which is still true.
      if (get().source !== source) return;

      set({
        status: 'ready',
        notice: { kind: 'error', message: `${source.name} could not be read. It may have moved.` },
      });
    }
  },

  /**
   * Asks whether the file still matches what we read.
   *
   * Runs when the window regains focus, which is the moment a reader most often
   * comes back from having done something to the file somewhere else. Silent
   * about everything except a genuine mismatch: no permission prompt (there is
   * no user activation here, and asking would be an ambush), and no complaint
   * about a file that cannot be reached, which is a different problem with a
   * different answer.
   */
  async checkExternalChange() {
    const { source, status, externalChange } = get();
    // Already flagged, so there is nothing to learn and a banner already saying
    // it. Re-running would only risk clearing what the reader has not answered.
    if (status !== 'ready' || externalChange) return;
    if (!isFileBackedDocumentSource(source) || source.lastModified === null) return;

    const baseline = source.lastModified;
    const checkedDocumentRevision = documentRevision;
    const current = await source.getFileMeta();

    // Metadata belongs to both a source and the baseline it was compared with.
    // A save, reload, open, or close that wins while the stat is in flight makes
    // this result historical rather than evidence about the current document.
    const latest = get();
    if (
      latest.source !== source ||
      documentRevision !== checkedDocumentRevision ||
      latest.status !== 'ready' ||
      latest.externalChange ||
      source.lastModified !== baseline
    ) {
      return;
    }
    if (
      !current ||
      (current.lastModified === source.lastModified && current.size === source.size)
    ) {
      return;
    }

    externalChangeRevision += 1;
    set({ externalChange: true });
  },

  dismissNotice() {
    set({ notice: null });
  },

  close() {
    // Every close path runs through here — the wordmark, the palette, and
    // whatever gets added later.
    if (!confirmDiscard(set, get)) return;

    const source = get().source;
    documentRevision += 1;

    // A heading fragment belongs to the document that was open. Left in the
    // URL, it would scroll the *next* document to whichever of its headings
    // happened to share the slug. Done here rather than in an effect because
    // `close` only ever runs from a real close, never on mount — so it cannot
    // discard a fragment the reader arrived with and has yet to use.
    const { hash, pathname, search } = window.location;
    if (hash && !hash.startsWith('#/')) {
      // replaceState, so closing does not add a history entry and does not
      // fire hashchange at the router.
      window.history.replaceState(null, '', pathname + search);
    }

    set({
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
    });
    disposeSource(source);

    // Closing lands on the screen that offers drafts back, so the list behind it
    // has to be current — a row this close just discarded must not still be sat
    // there waiting to be restored.
    void get().refreshDrafts();
  },

  async setAllowRemoteContent(allow) {
    const { text, status } = get();
    if (status !== 'ready') return;

    set({ allowRemoteContent: allow });
    set({ rendered: await renderMarkdown(text, { allowRemoteContent: allow }) });
  },

  setTheme(theme) {
    set({ theme });
    applyPrefs({ theme, typeface: get().typeface });
    persist(get());
  },

  setTypeface(typeface) {
    set({ typeface });
    applyPrefs({ theme: get().theme, typeface });
    persist(get());
  },

  setOutlinePinned(outlinePinned) {
    set({ outlinePinned });
    persist(get());
  },
}));
