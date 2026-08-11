import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { INTERNAL_CLASS_PREFIX } from '../types';

/**
 * Marks Mermaid fences for rendering after mount.
 *
 * Mermaid needs a DOM — it measures text to lay diagrams out — so it cannot run
 * inside the pipeline, which must stay DOM-free and worker-ready. This plugin
 * does the part that belongs in `core`: recognise the fence and hand the
 * renderer something to hydrate.
 *
 * The diagram source stays in the tree as the element's text. That means a
 * document whose diagrams fail to render — or which is printed, or read with
 * JavaScript broken — still shows the source rather than an empty gap.
 */

function textOf(node: Element): string {
  let text = '';
  visit(node, 'text', (child: { value: string }) => {
    text += child.value;
  });
  return text;
}

export function extractMermaid() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'pre') return;

      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      );
      if (!code) return;

      const classes = code.properties?.['className'];
      const isMermaid =
        Array.isArray(classes) && classes.includes('language-mermaid');
      if (!isMermaid) return;

      const source = textOf(code).replace(/\n$/, '');

      node.tagName = 'div';
      node.properties = { className: [`${INTERNAL_CLASS_PREFIX}mermaid`] };
      node.children = [{ type: 'text', value: source }];
    });
  };
}
