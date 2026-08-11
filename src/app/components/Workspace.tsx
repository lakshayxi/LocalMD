import { Document, HighlightProvider } from '@/render';
import { EditorSurface } from '../editor-loader';
import { highlightCode } from '../pipeline-loader';
import { useDocument } from '../store';
import { Outline } from './Outline';
import { RemoteContentNotice } from './RemoteContentNotice';

/**
 * The three reading and editing layouts.
 *
 * Split renders the *same* two components side by side rather than a third
 * variant of either. That is what keeps the preview in Split identical to the
 * preview in Read — a separate "split preview" would drift within a release.
 *
 * Scroll sync is deliberately absent for now. The plan timeboxes it and calls
 * it best-effort, and the honest options are proportional syncing (which lies
 * badly the moment a document contains a large code block or diagram) or source
 * positions carried through the pipeline into the rendered output, which is the
 * version worth having. Shipping the lying one first would be harder to remove
 * than to never add.
 */
export function Workspace({ onRendered }: { onRendered: () => void }) {
  const mode = useDocument((s) => s.mode);
  const rendered = useDocument((s) => s.rendered);
  const source = useDocument((s) => s.source);
  const updateText = useDocument((s) => s.updateText);

  // Read rather than subscribed: this is the editor's *initial* document, and
  // subscribing would re-render this component on every keystroke — exactly the
  // cost the editor is built to avoid.
  const text = useDocument.getState().text;

  if (!rendered) return null;

  const editor = (
    <EditorSurface
      doc={text}
      // Keyed to the document, so moving between Edit and Split keeps the
      // editor's history and cursor rather than rebuilding it underneath you.
      docId={source?.id ?? 'untitled'}
      onChange={updateText}
      ariaLabel={`Markdown source of ${source?.name ?? 'the document'}`}
      autoFocus
    />
  );

  const preview = (
    <>
      <RemoteContentNotice />
      {/* The renderer decides *when* a block is worth highlighting; who does
          the work is supplied here, because it runs in the worker and
          src/render may not reach into src/platform. */}
      <HighlightProvider highlight={highlightCode}>
        <Document slices={rendered.slices} onComplete={onRendered} />
      </HighlightProvider>
    </>
  );

  if (mode === 'edit') return editor;

  if (mode === 'split') {
    return (
      <div className="lmd-split">
        <div className="lmd-split-pane">{editor}</div>
        {/* The preview is scenery in Split — the editor is what has focus and
            what the reader is working in — so it is not a landmark competing
            for screen-reader navigation. */}
        <div className="lmd-split-pane is-preview">{preview}</div>
      </div>
    );
  }

  return (
    <>
      <Outline />
      {preview}
    </>
  );
}
