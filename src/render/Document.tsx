import type { RootContent } from 'hast';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useState } from 'react';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { components } from './components';

/**
 * Renders a sanitized document as React elements, a slice at a time.
 *
 * Deliberately not `dangerouslySetInnerHTML`. Converting to real elements is
 * marginally slower on very large documents, but it is what makes the image
 * gate, link hardening, and lazy diagram rendering expressible at all — and it
 * keeps a second HTML-parsing step out of the security path, since the tree has
 * already been sanitized as a tree.
 *
 * **Why it arrives in slices.** A megabyte of Markdown is about 78,000 DOM
 * nodes, and committing them in one go was a 353ms task — seven times §16's
 * 50ms ceiling, and 353ms during which the page answers nothing. The slices are
 * the same ones the worker posted them in, so nothing is re-cut here; mounting
 * them one task at a time turns a single long block into a series of short ones
 * and puts the first screenful up almost immediately.
 *
 * Each slice is memoized on the identity of its array, which is what keeps this
 * linear rather than quadratic: mounting slice twelve must not re-render the
 * eleven already on screen.
 */

const Slice = memo(function Slice({ nodes }: { nodes: RootContent[] }) {
  return toJsxRuntime(
    { type: 'root', children: nodes },
    { Fragment, jsx, jsxs, components, ignoreInvalidStyle: true },
  );
});

export function Document({
  slices,
  onComplete,
}: {
  slices: RootContent[][];
  onComplete?: () => void;
}) {
  const [mounted, setMounted] = useState(1);

  // A new document starts from its own first slice. Without this, opening a
  // short document after a long one would mount all of it in one commit.
  useEffect(() => {
    setMounted(1);
  }, [slices]);

  useEffect(() => {
    if (mounted >= slices.length) {
      onComplete?.();
      return;
    }

    // A macrotask, not a microtask and not an animation frame. A microtask
    // would run inside the task that just committed and rebuild the long task
    // this exists to break up; a frame would cap the document at one slice per
    // 16ms, which on a megabyte is several seconds of watching it grow.
    const timer = setTimeout(() => setMounted((count) => count + 1), 0);
    return () => clearTimeout(timer);
  }, [mounted, slices, onComplete]);

  return (
    <article className="lmd-document" aria-label="Document">
      {slices.slice(0, mounted).map((nodes, index) => (
        // The index is the identity: slices are a stable cut of one immutable
        // document, and a new document replaces the array wholesale.
        <Slice key={index} nodes={nodes} />
      ))}
    </article>
  );
}
