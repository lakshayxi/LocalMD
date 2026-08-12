import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import { createEditor } from './setup';

/**
 * React's stake in the editor is one empty div.
 *
 * CodeMirror owns its own DOM and its own update cycle, so the two must not
 * both try to manage the same subtree. The mount effect runs once per document;
 * every keystroke after that is CodeMirror's business alone and never re-enters
 * React. That is the whole reason a keystroke can stay inside a frame on a
 * large document — React does not see it.
 *
 * Text flows out through `onChange` and never back in as a prop. Feeding a
 * controlled `value` into CodeMirror would fight its own state on every
 * character and destroy the cursor position; the document is set once, when the
 * editor is created for it.
 */
export function Editor({
  doc,
  docId,
  onChange,
  ariaLabel,
  autoFocus = false,
}: {
  doc: string;
  /** Changes when a different document is opened, which is when to rebuild. */
  docId: string;
  onChange: (text: string) => void;
  ariaLabel: string;
  autoFocus?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // `onChange` in a ref so a new callback identity does not tear down a live
  // editor. The listener installed at mount reads the current value each time.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!host.current) return;

    const editor = createEditor(host.current, {
      doc,
      ariaLabel,
      onChange: (text) => latest.current(text),
    });
    view.current = editor;

    if (autoFocus) editor.focus();

    return () => {
      editor.destroy();
      view.current = null;
    };
    // Rebuilt per document, not per render. `doc`, `ariaLabel`, and `autoFocus`
    // are read at construction and intentionally not dependencies: `doc` is the
    // *initial* text, and re-running on a change to it would recreate the
    // editor underneath the person typing.
  }, [docId]);

  useEffect(() => {
    const openFind = () => {
      const editor = view.current;
      if (!editor) return;
      editor.focus();
      openSearchPanel(editor);
    };
    window.addEventListener('localmd:find-editor', openFind);
    return () => window.removeEventListener('localmd:find-editor', openFind);
  }, []);

  return <div className="lmd-editor" ref={host} />;
}
