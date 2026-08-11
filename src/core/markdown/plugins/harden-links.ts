import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Hardens outbound links.
 *
 * Runs after sanitization, so every surviving href is already scheme-checked.
 * What's left is preventing the *act of following a link* from leaking anything:
 *
 *   noreferrer  — no Referer header, so the destination learns nothing about
 *                 where the reader came from
 *   noopener    — the opened page cannot reach back through window.opener
 *   target      — external links leave the document intact, which matters more
 *                 here than usual since the reader may have unsaved edits
 *
 * In-document anchors are left alone: rewriting them would break the outline.
 */

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#');
}

export function hardenLinks() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return;

      const href = node.properties?.['href'];
      if (typeof href !== 'string' || !isExternal(href)) return;

      node.properties['rel'] = ['noopener', 'noreferrer'];
      node.properties['referrerPolicy'] = 'no-referrer';
      node.properties['target'] = '_blank';
    });
  };
}
