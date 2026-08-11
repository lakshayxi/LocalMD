import { create } from 'zustand';
import type { RenderResult } from '@/core/markdown';
import type { TextShape } from '@/core/text/encoding';
import type { DocumentSource } from '@/platform/files';
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

  theme: Theme;
  typeface: Typeface;
  outlinePinned: boolean;

  /** Only documents with a reopenable handle appear here. See persistence/recents.ts. */
  recents: RecentDocument[];

  open: (source: DocumentSource) => Promise<void>;
  openRecent: (recent: RecentDocument) => Promise<void>;
  forget: (id: string) => Promise<void>;
  close: () => void;
  setAllowRemoteContent: (allow: boolean) => Promise<void>;
  setTheme: (theme: Theme) => void;
  setTypeface: (typeface: Typeface) => void;
  setOutlinePinned: (pinned: boolean) => void;
  hydrate: () => Promise<void>;
  refreshRecents: () => Promise<void>;
}

function persist(state: Pick<DocumentState, 'theme' | 'typeface' | 'outlinePinned'>): void {
  savePrefs({
    theme: state.theme,
    typeface: state.typeface,
    outlinePinned: state.outlinePinned,
  });
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

      set({ text, shape, rendered, status: 'ready', allowRemoteContent: false });

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
