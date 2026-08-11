import { create } from 'zustand';
import type { RenderResult } from '@/core/markdown';
import type { TextShape } from '@/core/text/encoding';
import type { DocumentSource } from '@/platform/files';
// Type-only imports above are erased at build time; the pipeline itself is
// loaded on demand so it stays out of the entry chunk. See pipeline-loader.ts.
import { renderMarkdown } from './pipeline-loader';

export type Theme = 'system' | 'light' | 'dark';
export type Status = 'empty' | 'loading' | 'ready' | 'error';

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

  open: (source: DocumentSource) => Promise<void>;
  close: () => void;
  setAllowRemoteContent: (allow: boolean) => Promise<void>;
  setTheme: (theme: Theme) => void;
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

  async open(source) {
    set({ status: 'loading', error: null, source });

    try {
      const { text, shape } = await source.read();
      // Opening a new document resets the remote-content decision. See the note
      // on the field above — this reset is the security property, not an
      // implementation detail.
      const rendered = await renderMarkdown(text, { allowRemoteContent: false });

      set({ text, shape, rendered, status: 'ready', allowRemoteContent: false });
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'That file could not be opened.',
        source: null,
      });
    }
  },

  close() {
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
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  },
}));
