import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

/**
 * KaTeX rendering, loaded only when a document contains math.
 *
 * Runs *after* sanitization, which is deliberate. KaTeX output is a thicket of
 * spans and MathML that the sanitizer would shred, and it does not need
 * sanitizing: KaTeX builds it from the text content of a math node rather than
 * from HTML supplied by the document, and `trust: false` keeps it from emitting
 * links or raw HTML of its own.
 *
 * remark-math marks math nodes with `math` / `math-inline` classes, which is
 * how this finds them without re-parsing.
 */

function hasMath(tree: Root): boolean {
  let found = false;

  visit(tree, 'element', (node: Element) => {
    if (found) return false;
    const classes = node.properties?.['className'];
    if (
      Array.isArray(classes) &&
      classes.some((name) => name === 'math' || name === 'math-inline' || name === 'math-display')
    ) {
      found = true;
      return false;
    }
    return;
  });

  return found;
}

export function math() {
  // The VFile has to be threaded through: rehype-katex reports malformed
  // formulas as file messages, and without it its error path throws instead of
  // degrading, taking the whole document down over one bad formula.
  return async (tree: Root, file: VFile): Promise<void> => {
    if (!hasMath(tree)) return;

    const { default: rehypeKatex } = await import('rehype-katex');

    const transform = rehypeKatex({
      // No \href, \url, or \includegraphics — those would reintroduce exactly
      // the link and remote-resource surface the rest of the pipeline removes.
      trust: false,
      // Unknown commands and dubious constructs are rendered rather than
      // rejected. A reader wants to see the formula, not a lecture about it.
      strict: false,
      output: 'html',
      // `throwOnError` is deliberately absent — rehype-katex omits it from its
      // options because it handles failures itself, rendering the offending
      // source in place and reporting through the VFile. That is also why the
      // file has to be threaded through below.
    });

    transform(tree, file);
  };
}
