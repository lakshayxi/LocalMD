import type { Root } from 'hast';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { components } from './components';

/**
 * Renders a sanitized hast tree as React elements.
 *
 * Deliberately not `dangerouslySetInnerHTML`. Converting to real elements is
 * marginally slower on very large documents, but it is what makes the image
 * gate, link hardening, and lazy diagram rendering expressible at all — and it
 * keeps a second HTML-parsing step out of the security path, since the tree has
 * already been sanitized as a tree.
 *
 * The memo keys on the tree identity: the pipeline produces a fresh object per
 * render, so this collapses React's work when the app re-renders for unrelated
 * reasons (theme change, header state). Block-level memoization for keystroke
 * cost arrives with the editor in M5.
 */
export function Document({ tree }: { tree: Root }) {
  const content = useMemo(
    () => toJsxRuntime(tree, { Fragment, jsx, jsxs, components, ignoreInvalidStyle: true }),
    [tree],
  );

  return (
    <article className="lmd-document" aria-label="Document">
      {content}
    </article>
  );
}
