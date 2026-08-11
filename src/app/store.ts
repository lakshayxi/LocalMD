import { create } from 'zustand';
import type { RenderResult } from '@/core/markdown';
import type { TextShape } from '@/core/text/encoding';
import type { DocumentContents, DocumentSource, SaveOutcome } from '@/platform/files';
import { FileHandleSource } from '@/platform/files';
import type { RecentDocument, StoredPrefs } from '@/platform/persistence';
import {
  ensureReadPermission,
  forgetRecent,
  listRecents,
  loadPrefs,
  recordRecent,
  savePrefs,
} from '@/platform/persistence';
// Type-only imports above are erased at build time; the pipeline itself is
// loaded on demand so it stays out of the entry chunk. See pipeline-loader.ts.
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
  rendered: RenderResult | null;
  status: Status;
  error: string | null;

  /**
   * Per-document and per-session by design. Allowing remote content is a
   * decision about *this* document, so it must not persist into the next one —
   * a reader who trusts their own README has not thereby trusted a file a
   * stranger sends them tomorrow.
   */
  allowRemoteContent: boolean;

  mode: Mode;
  /** Edited since it was last saved. */
  dirty: boolean;
  saving: boolean;
  /** Transient feedback for a save. A save with no acknowledgement is a save you do not trust. */
  notice: Notice | null;

  theme: Theme;
  typeface: Typeface;
  outlinePinned: boolean;

  /** Only documents with a reopenable handle appear here. See persistence/recents.ts. */
  recents: RecentDocument[];

  open: (source: DocumentSource) => Promise<void>;
  openRecent: (recent: RecentDocument) => Promise<void>;
  forget: (id: string) => Promise<void>;
  setMode: (mode: Mode) => Promise<void>;
  updateText: (text: string) => void;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
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
 * Split's live-preview debounce, and the guard against out-of-order renders.
 *
 * Module-scoped rather than in the store: they are scheduling machinery, not
 * state anything renders from, and putting a timer id in the store would
 * notify every subscriber each time a key is pressed.
 */
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let previewGeneration = 0;

function schedulePreview(get: () => DocumentState): void {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => void get().refreshPreview(), PREVIEW_DEBOUNCE_MS);
}

function cancelPreview(): void {
  clearTimeout(previewTimer);
  previewTimer = undefined;
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

  set({ saving: true, notice: null });

  try {
    const outcome = await run(source, { text, shape });

    if (outcome.kind === 'cancelled') return;

    if (outcome.kind === 'downloaded') {
      // Dirty clears because the reader's work is now durable somewhere. Saying
      // otherwise would make the navigation guard nag about a document they
      // just saved.
      // `outcome.name`, not `source.name`: a pasted document displays as
      // "Pasted document" and is written as "Pasted document.md", and the
      // message has to name the file that actually exists.
      set({ dirty: false, notice: { kind: 'info', message: `Downloaded ${outcome.name}.` } });
      return;
    }

    // Save As hands back a handle to the *new* file, and from here on ⌘S must
    // write there rather than to the original.
    set({
      source: outcome.source,
      dirty: false,
      notice: { kind: 'info', message: `Saved ${outcome.source.name}.` },
    });

    if (outcome.source instanceof FileHandleSource) {
      await recordRecent(outcome.source.handle, outcome.source.size);
      await get().refreshRecents();
    }
  } catch (error) {
    // The document stays open and stays dirty. A failed save must never look
    // like a successful one, and must never cost the reader their text.
    set({
      notice: {
        kind: 'error',
        message: error instanceof Error ? error.message : 'That file could not be saved.',
      },
    });
  } finally {
    set({ saving: false });
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
  mode: 'view',
  dirty: false,
  saving: false,
  notice: null,
  theme: 'system',
  typeface: 'sans',
  outlinePinned: true,
  recents: [],

  async hydrate() {
    // Prefs are synchronous and were already applied by public/theme-init.js
    // before first paint; this only syncs them into React state.
    const prefs = loadPrefs();
    set({ theme: prefs.theme, typeface: prefs.typeface, outlinePinned: prefs.outlinePinned });
    await get().refreshRecents();
  },

  async refreshRecents() {
    set({ recents: await listRecents() });
  },

  async open(source) {
    set({ status: 'loading', error: null, source });

    try {
      const { text, shape } = await source.read();
      // Opening a new document resets the remote-content decision. See the note
      // on the field above — this reset is the security property, not an
      // implementation detail.
      const rendered = await renderMarkdown(text, { allowRemoteContent: false });

      set({
        text,
        shape,
        rendered,
        status: 'ready',
        allowRemoteContent: false,
        // Every document opens as something to read. Landing in Edit because
        // the last one was edited would be the wrong default for a reader.
        mode: 'view',
        dirty: false,
        notice: null,
      });

      // Only handle-backed sources can be reopened, so only they are recorded.
      if (source instanceof FileHandleSource) {
        await recordRecent(source.handle, source.size);
        await get().refreshRecents();
      }
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'That file could not be opened.',
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
   * Records an edit.
   *
   * In View and Edit this deliberately does *not* re-render the preview.
   * Nothing mounted subscribes to `text`, so a keystroke costs one store write
   * and no React render at all — which is what keeps typing inside a frame on a
   * large document. Split is the exception, because there the preview is on
   * screen, and it pays for that with a debounce rather than a render per key.
   */
  updateText(text) {
    set({ text, dirty: true });
    if (get().mode === 'split') schedulePreview(get);
  },

  async setMode(mode) {
    const { mode: current, status } = get();
    if (mode === current || status !== 'ready') return;

    cancelPreview();
    set({ mode });

    // Coming back from an edit, the rendered tree is stale by exactly the edits
    // just made. Re-rendering on the way *out* of editing, rather than on every
    // keystroke, is the whole reason typing is cheap.
    if (mode !== 'edit') await get().refreshPreview();
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

  dismissNotice() {
    set({ notice: null });
  },

  close() {
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
      mode: 'view',
      dirty: false,
      notice: null,
    });
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
