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
 * The fallback is deliberately empty rather than a spinner. The chunk resolves
 * in a few milliseconds from cache and in well under a second cold; flashing a
 * loading state for that long reads as a stutter, not as progress.
 */
const LazyEditor = lazy(async () => {
  const { Editor } = await import('@/editor');
  return { default: Editor };
});

export function EditorSurface(props: React.ComponentProps<typeof LazyEditor>) {
  return (
    <Suspense fallback={<div className="lmd-editor is-loading" aria-hidden="true" />}>
      <LazyEditor {...props} />
    </Suspense>
  );
}
