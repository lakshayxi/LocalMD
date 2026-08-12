import { Suspense, lazy } from 'react';

/**
 * Loads CodeMirror on the first switch into Edit mode.
 *
 * The same reasoning as pipeline-loader.ts, and a stronger case for it: this is
 * a reader first. Most visits never enter Edit mode at all, and none of them
 * should download an editor to find that out. Keeping the import dynamic is
 * what holds the initial payload flat — measured, not assumed, by
 * scripts/assert-bundle-budget.mjs.
 *
 * The fallback reserves the editor column and gives a quiet indication that
 * the source is loading. This avoids presenting a blank document surface on a
 * cold first entry into Edit mode.
 */
const LazyEditor = lazy(async () => {
  const { Editor } = await import('@/editor');
  return { default: Editor };
});

export function EditorSurface(props: React.ComponentProps<typeof LazyEditor>) {
  return (
    <Suspense
      fallback={
        <div className="lmd-editor is-loading" role="status" aria-live="polite">
          <span className="lmd-editor-loading-label">Loading editor</span>
          <div className="lmd-editor-loading-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      }
    >
      <LazyEditor {...props} />
    </Suspense>
  );
}
