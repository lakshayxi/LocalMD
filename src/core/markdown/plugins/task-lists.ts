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

/**
 * The task item's text, for use as the checkbox's accessible name.
 *
 * Whitespace-collapsed and capped: a task can be a whole paragraph, and a
 * screen reader announcing four sentences before saying "checked" is worse than
 * a truncated one. Falls back to a generic name for a checkbox with no text
 * beside it, since an empty `aria-label` is the failure being fixed.
 */
function labelFor(parent: TextBearing): string {
  const text = collectText(parent).replace(/\s+/g, ' ').trim();
  if (!text) return 'Task';
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/**
 * Structural rather than `Element | Root`: `visit` hands back a wider parent
 * union than either, and this only needs the two fields it reads.
 */
interface TextBearing {
  type: string;
  value?: string | undefined;
  children?: TextBearing[] | undefined;
}

function collectText(node: TextBearing): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(collectText).join('');
}

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
        // A checkbox with no name is announced as just "checked" — the state
        // without the thing it applies to, which is the least useful half. The
        // item's own text is the name a sighted reader gets from the layout, so
        // it is the one to carry over.
        'aria-label': parent ? labelFor(parent) : 'Task',
      };
      node.children = [];
      return;
    });
  };
}
