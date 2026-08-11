import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { INTERNAL_CLASS_PREFIX, type BlockedResource } from '../types';

/**
 * Decides what happens to every image in the document.
 *
 * Three cases, and only one of them loads:
 *
 *   data:      loads. Already local, and guard-urls.ts has confirmed the MIME
 *              type is a raster image.
 *   remote     blocked by default. This is the application-code half of the
 *              privacy guarantee and the half that can regress — CSP cannot
 *              express it, because `img-src` must keep permitting https: for
 *              the opt-in to be possible at all. Only this transform stops it.
 *   relative   never resolves. A file opened through the picker has no base
 *              directory, so `./diagram.png` would resolve against the app's
 *              own origin and 404.
 *
 * Both blocked cases become spans rather than images with the src removed: a
 * src-less `<img>` renders as a broken-image glyph, and "looks broken" is the
 * failure this product can least afford. A reader who is told "loading this
 * would contact img.shields.io" can make a decision. A broken icon teaches
 * them nothing.
 */

function isRemote(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

function isData(url: string): boolean {
  return url.toLowerCase().startsWith('data:');
}

function hostOf(url: string): string {
  try {
    return new URL(url, 'https://localmd.invalid').host;
  } catch {
    return 'unknown host';
  }
}

function toPlaceholder(node: Element, className: string, title: string, alt: string): void {
  node.tagName = 'span';
  node.properties = {
    ...node.properties,
    className: [`${INTERNAL_CLASS_PREFIX}${className}`],
    title,
  };
  delete node.properties['src'];
  delete node.properties['srcSet'];
  node.children = alt ? [{ type: 'text', value: alt }] : [];
}

export function handleImages(options: { allowRemote: boolean; blocked: BlockedResource[] }) {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'img') return;

      const src = node.properties?.['src'];
      if (typeof src !== 'string' || src === '') return;

      const alt = typeof node.properties?.['alt'] === 'string' ? node.properties['alt'] : '';

      if (isData(src)) return;

      if (isRemote(src)) {
        if (options.allowRemote) return;

        const host = hostOf(src);
        options.blocked.push({ url: src, host, alt });
        toPlaceholder(node, 'blocked-image', `Remote image blocked — would contact ${host}`, alt);
        // Retained so the opt-in can restore the image without re-parsing.
        // data-* attributes are never fetched by the browser.
        node.properties['data-src'] = src;
        node.properties['data-host'] = host;
        return;
      }

      toPlaceholder(
        node,
        'unresolved-image',
        `Local image not available — "${src}" is relative to the file's folder, which the browser cannot read`,
        alt,
      );
      node.properties['data-src'] = src;
    });
  };
}
