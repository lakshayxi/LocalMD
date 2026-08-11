import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { INTERNAL_CLASS_PREFIX } from '../types';

/**
 * Replaces GFM's task-list checkboxes with inert spans, and removes every other
 * form control outright.
 *
 * remark-gfm renders `- [x] done` as `<input type="checkbox" checked disabled>`,
 * so the sanitizer has to permit a narrowly-restricted `input` (see
 * sanitize-schema.ts). That leaves a loose end: a hostile `<form><input
 * name="x"></form>` loses its form and its name, but a bare `<input>` would
 * still reach the output.
 *
 * Running here — *after* sanitization — closes it. Every input is either
 * converted or deleted, so the rendered document provably contains no form
 * control at all, which is a far easier invariant to state and test than
 * "inputs are present but declawed".
 *
 * Being post-sanitize also means the className and ARIA attributes below are
 * ours rather than the document's, so they aren't subject to the allowlist.
 */

export function convertTaskCheckboxes() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'input') return;

      const isTaskCheckbox = node.properties?.['type'] === 'checkbox';

      if (!isTaskCheckbox) {
        if (parent && typeof index === 'number') {
          parent.children.splice(index, 1);
          return index; // Re-visit this position; the array shifted underneath us.
        }
        return;
      }

      const checked = node.properties?.['checked'] === true;

      node.tagName = 'span';
      node.properties = {
        className: [`${INTERNAL_CLASS_PREFIX}task-checkbox`],
        role: 'checkbox',
        'aria-checked': checked ? 'true' : 'false',
        'aria-disabled': 'true',
      };
      node.children = [];
      return;
    });
  };
}
