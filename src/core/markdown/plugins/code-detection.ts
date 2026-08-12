import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

export const AUTO_DETECT_CODE_CLASS = 'lmd-code-autodetect';

/** Marks only unlabelled fenced blocks for conservative language detection. */
export function markAutoDetectCode(source: string) {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'pre' || node.children.length !== 1) return;
      const code = node.children[0];
      if (!code || code.type !== 'element' || code.tagName !== 'code') return;

      const classes = code.properties?.['className'];
      if (Array.isArray(classes) && classes.some((name) => String(name).startsWith('language-'))) {
        return;
      }

      const offset = node.position?.start.offset;
      if (offset === undefined) return;
      const openingLine = source.slice(offset).split(/\r?\n/, 1)[0] ?? '';
      if (!/^ {0,3}(`{3,}|~{3,})\s*$/.test(openingLine)) return;

      code.properties ??= {};
      const current = Array.isArray(classes) ? classes : [];
      code.properties['className'] = [...current, AUTO_DETECT_CODE_CLASS];
    });
  };
}
