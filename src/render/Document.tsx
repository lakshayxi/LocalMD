import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useState } from 'react';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { DocumentSlice } from '@/core/markdown';
import { components, fastComponents } from './components';

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
 * Each slice is memoized by its sanitized-content hash. This keeps progressive
 * mounting linear and preserves unchanged slices across Split preview updates.
 */

const Slice = memo(
  function Slice({ slice, enhance }: { slice: DocumentSlice; enhance: boolean }) {
    return toJsxRuntime(
      { type: 'root', children: slice.nodes },
      {
        Fragment,
        jsx,
        jsxs,
        components: enhance ? components : fastComponents,
        ignoreInvalidStyle: true,
      },
    );
  },
  (before, after) => before.enhance === after.enhance && before.slice.hash === after.slice.hash,
);

export function Document({
  slices,
  enhance = true,
  onComplete,
}: {
  slices: DocumentSlice[];
  enhance?: boolean;
  onComplete?: () => void;
}) {
  const [mounted, setMounted] = useState(1);

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
  }, [mounted, slices.length, onComplete]);

  return (
    <article className="lmd-document" aria-label="Document">
      {slices.slice(0, mounted).map((slice, index) => (
        // Keep position in the key because identical repeated blocks are valid.
        <Slice key={`${index}:${slice.hash}`} slice={slice} enhance={enhance} />
      ))}
    </article>
  );
}
